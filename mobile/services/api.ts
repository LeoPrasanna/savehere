import { Platform } from 'react-native';
import { getAccessToken } from './supabase';

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
  used: number;        // AI actions spent today
  limit: number;       // AI actions allowed today (tier-dependent)
  remaining: number;
  resets_at: string;
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

export const api = {
  // ── Reels ────────────────────────────────────────────────
  saveReel: (url: string) =>
    request<Reel>('/api/reels/save', {
      method: 'POST',
      body: JSON.stringify({ url }),
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

  // ── Workout ──────────────────────────────────────────────
  generateWorkout: (reelId: string) =>
    request<WorkoutPlan>(`/api/reels/${reelId}/workout`, { method: 'POST' }),

  getWorkout: (reelId: string) =>
    request<WorkoutPlan>(`/api/reels/${reelId}/workout`),

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

  deleteAccount: () =>
    request<{ deleted: boolean; reels_removed: number; message: string }>(`/api/account`, { method: 'DELETE' }),
};
