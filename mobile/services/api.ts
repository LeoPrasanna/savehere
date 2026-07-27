import { Platform } from 'react-native';
import { getAccessToken } from './supabase';
import type { ClientMetadata } from './clientExtract';

// Local dev defaults to localhost; override for cloud dev (e.g. a Codespace's
// forwarded backend URL) by setting EXPO_PUBLIC_API_URL before `expo start`.
const BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:8000';

/**
 * Instagram/Facebook/LinkedIn CDN images block browser hotlinking (CORS), so on
 * web we route them through the backend proxy. Native loads them directly.
 */
export function thumbUrl(url?: string | null): string | undefined {
  if (!url) return undefined;
  if (Platform.OS === 'web' && /fbcdn\.net|cdninstagram\.com|licdn\.com/.test(url)) {
    return `${BASE_URL}/api/thumbnail?url=${encodeURIComponent(url)}`;
  }
  return url;
}

export interface Reel {
  id: string;
  url: string;
  platform: string;
  title: string | null;
  thumbnail_url: string | null;
  uploader: string | null;
  duration: number | null;
  summary: string[];
  tags: string[];
  category: string | null;
  // pending = summary generating in background; ready = done; skipped = nothing
  // readable; failed = errored (retryable). Drives the "Summarizing…" UI.
  summary_status?: 'pending' | 'ready' | 'skipped' | 'failed';
  notes: string | null;
  summarize_count: number;
  tasks_count: number;
  workout_count: number;
  // Flagged by the AI when the content is medical/high-stakes advice: the app
  // shows a disclaimer and hides tasks/workout (the server refuses them too).
  is_sensitive?: boolean;
  created_at: string;
}

export interface ReelListResponse {
  total: number;
  items: Reel[];
}

export interface WorkoutExercise {
  id: string;
  name: string;
  type: 'strength' | 'cardio' | 'core' | 'flexibility';
  muscle_group: string;
  sets: number | null;
  reps: number | null;
  duration_seconds: number | null;
  rest_seconds: number;
  is_estimated: boolean;
  sort_order: number;
}

export interface WorkoutPlan {
  reel_id: string;
  workout_name: string;
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  estimated_minutes: number;
  exercises: WorkoutExercise[];
}

export interface Task {
  id: string;
  reel_id: string;
  text: string;
  emoji: string;
  estimated_minutes: number | null;
  completed: boolean;
  sort_order: number;
}

export interface Usage {
  // Effective tier: 'trial' (first days, full limits), 'free' (post-trial:
  // capped saves + a small daily AI trickle), 'pro' (paid, unlimited saves).
  tier: 'trial' | 'free' | 'pro';
  trial_ends_at: string | null;                    // ISO UTC; null for pro
  saves: { used: number; limit: number | null };   // limit null = unlimited
  categories?: number; // distinct categories across the whole library
  platforms?: number;  // distinct platforms across the whole library
  used: number;        // AI actions spent today
  limit: number;       // AI actions allowed today (tier-dependent)
  remaining: number;
  resets_at: string;
  // Feature flags for locked-button UI (server enforces with 403s regardless):
  // post-trial free loses ask / non-cooking tasks / itinerary; trial+pro keep all.
  features?: { ask: boolean; tasks: boolean; recipe: boolean; workout: boolean; itinerary: boolean };
}

// The drill-down behind the meter: what today's AI actions were spent on.
export interface UsageLogItem {
  action: string;         // summary | resummarize | tasks | recipe | workout | itinerary | ask
  action_label: string;   // human label, e.g. "Trip itinerary"
  label: string | null;   // the reel title or question snippet
  at: string | null;      // ISO timestamp
}

export interface UsageLog {
  day: string;
  used: number;           // the meter's number
  logged: number;         // how many we can actually describe (may be < used)
  items: UsageLogItem[];
}

// ── Trip Itinerary (travel reels, Pro feature) ─────────────────────────────
export interface ItineraryDay {
  label: string;                                  // "Day 1 — Tokyo"
  items: { text: string; emoji: string }[];
}

export interface Itinerary {
  trip_name: string;
  destination: string | null;
  duration_days: number | null;
  // True when the reel didn't state a day plan and the AI organized the places
  // into days itself — the UI shows an honesty note. Places are always
  // extracted-only, never invented.
  structure_estimated: boolean;
  days: ItineraryDay[];
  tips: string[];
}

export interface ItineraryResponse {
  reel_id: string;
  itinerary: Itinerary | null;                    // null = never generated
  regenerations_left: number;
}

export interface AskResponse {
  answer: string;
  sources: Reel[];
}

export interface TaskListResponse {
  reel_id: string;
  total: number;
  completed: number;
  kind?: 'steps' | 'tasks';        // "steps" = ordered how-to/recipe, shown numbered
  source?: 'content' | 'title' | 'notes';
  note?: string | null;            // disclaimer when steps weren't read from the video
  tasks: Task[];
}

async function request<T>(path: string, options?: RequestInit, timeoutMs = 55000): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    // Attach the Supabase access token so the backend can scope to this user.
    // supabase-js auto-refreshes, so this is current; null when logged out.
    const token = await getAccessToken();
    const res = await fetch(`${BASE_URL}${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(options?.headers || {}),
      },
      signal: controller.signal,
    });
    if (!res.ok) {
      // Surface the backend's human-readable `detail` so screens never have to
      // show raw JSON. Falls back to the raw body for non-FastAPI errors.
      const raw = await res.text();
      let msg = raw || `Request failed: ${res.status}`;
      try {
        const detail = JSON.parse(raw)?.detail;
        if (typeof detail === 'string' && detail) msg = detail;
      } catch {}
      throw new Error(msg);
    }
    return res.json();
  } catch (e: any) {
    if (e.name === 'AbortError') {
      throw new Error('Request timed out. The server took too long — try again.');
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

// Must match the backend's SOURCES_MARKER (app/routes/ask.py) — separates the
// streamed answer prose from the trailing sources JSON.
const SOURCES_MARKER = '\n␞__SRC__␞';

export interface AskStreamHandlers {
  onToken: (answerSoFar: string) => void;  // called with the full answer text each time it grows
  signal?: AbortSignal;
}

/**
 * Streaming "ask your library" — the answer renders token-by-token as Claude
 * writes it. Uses XMLHttpRequest (not fetch): its incremental `responseText`
 * surfaces the same way on React Native native AND web, so one path works on
 * both. Resolves with the final {answer, sources} once the stream completes.
 */
async function askStream(question: string, handlers: AskStreamHandlers): Promise<AskResponse> {
  const token = await getAccessToken();
  return new Promise<AskResponse>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${BASE_URL}/api/ask/stream`);
    xhr.setRequestHeader('Content-Type', 'application/json');
    if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);

    const split = (raw: string) => {
      const i = raw.indexOf(SOURCES_MARKER);
      return i === -1
        ? { answer: raw, sources: null as Reel[] | null }
        : { answer: raw.slice(0, i), sources: safeParse(raw.slice(i + SOURCES_MARKER.length)) };
    };
    const safeParse = (s: string): Reel[] | null => {
      try { return JSON.parse(s) as Reel[]; } catch { return null; }
    };

    xhr.onprogress = () => {
      // responseText holds everything received so far; show the answer portion,
      // hiding the sources sentinel if it's already arrived.
      handlers.onToken(split(xhr.responseText).answer);
    };
    xhr.onload = () => {
      if (xhr.status < 200 || xhr.status >= 300) {
        let msg = xhr.responseText || `Request failed: ${xhr.status}`;
        try { const d = JSON.parse(xhr.responseText)?.detail; if (typeof d === 'string' && d) msg = d; } catch {}
        reject(new Error(msg));
        return;
      }
      const { answer, sources } = split(xhr.responseText);
      resolve({ answer: answer.trim(), sources: sources ?? [] });
    };
    xhr.onerror = () => reject(new Error("Can't reach the server. Make sure the backend is running."));
    xhr.ontimeout = () => reject(new Error('That took too long — try again.'));
    xhr.timeout = 55000;

    if (handlers.signal) {
      handlers.signal.addEventListener('abort', () => xhr.abort());
    }
    xhr.send(JSON.stringify({ question }));
  });
}

export const api = {
  // ── Reels ────────────────────────────────────────────────
  saveReel: (url: string) =>
    request<Reel>('/api/reels/save', {
      method: 'POST',
      body: JSON.stringify({ url }),
    }),

  /** Hand the backend metadata this device fetched from the user's own IP, for
   *  links our datacenter IP can't read (Instagram/Facebook). The server ignores
   *  it whenever its own extraction succeeded. See services/clientExtract.ts. */
  sendClientMetadata: (reelId: string, meta: ClientMetadata) =>
    request<Reel>(`/api/reels/${reelId}/client-metadata`, {
      method: 'POST',
      body: JSON.stringify(meta),
    }),

  listReels: (filters?: { tag?: string; category?: string; platform?: string; limit?: number; offset?: number }) => {
    const params = new URLSearchParams(
      Object.fromEntries(
        Object.entries(filters || {})
          .filter(([, v]) => v !== undefined && v !== '' && v !== null)
          .map(([k, v]) => [k, String(v)])
      )
    );
    return request<ReelListResponse>(`/api/reels?${params}`);
  },

  getReel: (id: string) => request<Reel>(`/api/reels/${id}`),

  searchReels: (q: string, limit = 24, offset = 0) =>
    request<ReelListResponse>(`/api/reels/search?q=${encodeURIComponent(q)}&limit=${limit}&offset=${offset}`),

  resummarize: (id: string) =>
    request<Reel>(`/api/reels/${id}/resummarize`, { method: 'POST' }),

  // Run/retry the first summary (for a reel still pending or failed).
  summarizeReel: (id: string) =>
    request<Reel>(`/api/reels/${id}/summarize`, { method: 'POST' }),

  updateNotes: (id: string, notes: string) =>
    request<Reel>(`/api/reels/${id}/notes`, {
      method: 'PATCH',
      body: JSON.stringify({ notes }),
    }),

  updateCategory: (id: string, category: string) =>
    request<Reel>(`/api/reels/${id}/category`, {
      method: 'PATCH',
      body: JSON.stringify({ category }),
    }),

  deleteReel: (id: string) =>
    request<{ message: string }>(`/api/reels/${id}`, { method: 'DELETE' }),

  ask: (question: string) =>
    request<AskResponse>('/api/ask', { method: 'POST', body: JSON.stringify({ question }) }),

  askStream,

  // ── Workout ──────────────────────────────────────────────
  generateWorkout: (reelId: string) =>
    request<WorkoutPlan>(`/api/reels/${reelId}/workout`, { method: 'POST' }),

  getWorkout: (reelId: string) =>
    request<WorkoutPlan>(`/api/reels/${reelId}/workout`),

  // ── Trip Itinerary (travel reels) ────────────────────────
  generateItinerary: (reelId: string) =>
    request<ItineraryResponse>(`/api/reels/${reelId}/itinerary`, { method: 'POST' }),

  getItinerary: (reelId: string) =>
    request<ItineraryResponse>(`/api/reels/${reelId}/itinerary`),

  updateExercise: (exerciseId: string, patch: { sets?: number; reps?: number; duration_seconds?: number; rest_seconds?: number }) =>
    request<WorkoutExercise>(`/api/exercises/${exerciseId}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    }),

  // ── Tasks ────────────────────────────────────────────────
  generateTasks: (reelId: string) =>
    request<TaskListResponse>(`/api/reels/${reelId}/tasks`, { method: 'POST' }),

  getTasks: (reelId: string) =>
    request<TaskListResponse>(`/api/reels/${reelId}/tasks`),

  toggleTask: (taskId: string, completed: boolean) =>
    request<Task>(`/api/tasks/${taskId}`, {
      method: 'PATCH',
      body: JSON.stringify({ completed }),
    }),

  // Manual task editing — no AI.
  addTask: (reelId: string, text: string) =>
    request<Task>(`/api/reels/${reelId}/tasks/manual`, {
      method: 'POST',
      body: JSON.stringify({ text }),
    }),

  editTask: (taskId: string, text: string) =>
    request<Task>(`/api/tasks/${taskId}`, {
      method: 'PATCH',
      body: JSON.stringify({ text }),
    }),

  deleteTask: (taskId: string) =>
    request<{ message: string }>(`/api/tasks/${taskId}`, { method: 'DELETE' }),

  // ── Account ───────────────────────────────────────────────
  getUsage: () => request<Usage>('/api/account/usage'),

  getUsageLog: () => request<UsageLog>('/api/account/usage/log'),

  deleteAccount: () =>
    request<{ deleted: boolean; reels_removed: number; message: string }>(`/api/account`, { method: 'DELETE' }),
};
