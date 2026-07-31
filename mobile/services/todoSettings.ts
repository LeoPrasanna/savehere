import { useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { TodoPriority } from './api';

/**
 * Preferences for the to-do list, stored on the DEVICE.
 *
 * Deliberately not server-side: these are display choices, not data. Putting
 * them in Postgres would mean a migration, an endpoint and a round-trip before
 * the first paint — for something that only affects how this phone renders a
 * screen. If cross-device sync is ever asked for, move the same shape onto
 * `profiles` and keep this module as the cache.
 *
 * Unknown/corrupt stored values fall back to the defaults rather than throwing:
 * a settings blob is never worth blocking the screen over.
 */
export interface TodoSettings {
  /** Completions targeted per local day. 0 turns the goal off entirely. */
  dailyGoal: number;
  /** Show the list block on the home screen. */
  showOnHome: boolean;
  /** Pre-selected priority for a new task. */
  defaultPriority: TodoPriority;
  /** After finishing a task that came from a save, offer to delete the save.
   *  On by default because the owner asked for the prompt — but it's the kind
   *  of thing that gets old fast, so it can be turned off. */
  askDeleteSaveOnDone: boolean;
  /** Keep finished tasks visible in the list instead of hiding them. */
  showCompleted: boolean;
  /** Sort "Someday" items to the top instead of the bottom. */
  somedayFirst: boolean;
}

export const DEFAULT_SETTINGS: TodoSettings = {
  dailyGoal: 5,
  showOnHome: true,
  defaultPriority: 'medium',
  askDeleteSaveOnDone: true,
  showCompleted: false,
  somedayFirst: false,
};

export const GOAL_OPTIONS = [0, 3, 5, 8, 10] as const;

const KEY = '@savehere:todo:settings:v1';

function coerce(raw: unknown): TodoSettings {
  const v = (raw ?? {}) as Partial<TodoSettings>;
  // NOT `Number(v.dailyGoal)`. Number(null), Number(''), Number([]) and
  // Number(false) are all 0 — and 0 is a MEANINGFUL value here ("goal off"), so
  // a missing or corrupt field would silently switch the user's goal off
  // instead of falling back to the default. Only a real number, or a numeric
  // string (JSON round-trips produce those), counts as an answer.
  const rawGoal: unknown = v.dailyGoal;
  const goal =
    typeof rawGoal === 'number' ? rawGoal
      : typeof rawGoal === 'string' && rawGoal.trim() !== '' ? Number(rawGoal)
        : NaN;
  return {
    // Clamped, not trusted: a hand-edited or half-written value must not produce
    // a progress bar dividing by zero or stretching to infinity.
    dailyGoal: Number.isFinite(goal) && goal >= 0 && goal <= 50
      ? Math.floor(goal)
      : DEFAULT_SETTINGS.dailyGoal,
    showOnHome: typeof v.showOnHome === 'boolean' ? v.showOnHome : DEFAULT_SETTINGS.showOnHome,
    defaultPriority: v.defaultPriority === 'high' || v.defaultPriority === 'low' || v.defaultPriority === 'medium'
      ? v.defaultPriority
      : DEFAULT_SETTINGS.defaultPriority,
    askDeleteSaveOnDone: typeof v.askDeleteSaveOnDone === 'boolean'
      ? v.askDeleteSaveOnDone : DEFAULT_SETTINGS.askDeleteSaveOnDone,
    showCompleted: typeof v.showCompleted === 'boolean' ? v.showCompleted : DEFAULT_SETTINGS.showCompleted,
    somedayFirst: typeof v.somedayFirst === 'boolean' ? v.somedayFirst : DEFAULT_SETTINGS.somedayFirst,
  };
}

export async function loadTodoSettings(): Promise<TodoSettings> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    return coerce(raw ? JSON.parse(raw) : null);
  } catch {
    return DEFAULT_SETTINGS;
  }
}

/**
 * Settings + a patch function. `ready` is false until the stored value has been
 * read — screens should hold off on rendering goal UI until then, or the bar
 * flashes the default goal before snapping to the real one.
 */
export function useTodoSettings() {
  const [settings, setSettings] = useState<TodoSettings>(DEFAULT_SETTINGS);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let alive = true;
    loadTodoSettings().then(s => {
      if (!alive) return;
      setSettings(s);
      setReady(true);
    });
    return () => { alive = false; };
  }, []);

  const update = useCallback((patch: Partial<TodoSettings>) => {
    setSettings(prev => {
      const next = coerce({ ...prev, ...patch });
      // Optimistic: the UI already shows `next`, and a failed write only costs
      // the preference on the next launch — never worth an error dialog.
      AsyncStorage.setItem(KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });
  }, []);

  return { settings, update, ready };
}
