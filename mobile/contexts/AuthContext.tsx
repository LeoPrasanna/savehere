// App-wide auth state from Supabase. Subscribes to session changes so the UI
// reacts immediately to login / logout / token refresh.
import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../services/supabase';
import { api } from '../services/api';
import { resetSessionFlags } from '../services/sessionFlags';

export interface Profile {
  first_name?: string;
  last_name?: string;
  nickname?: string;
}

interface AuthState {
  session: Session | null;
  loading: boolean;          // true until the initial session check resolves
  email: string | null;
  profile: Profile;          // from Supabase user_metadata
  displayName: string;       // what to address them by: nickname > first name > email
  celebrate: boolean;        // one-shot: play the welcome confetti over the whole app
  triggerCelebrate: () => void;
  updateProfile: (fields: Profile) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  deleteAccount: () => Promise<{ error: string | null }>;
}

// Friendly fallback name from the email local-part, e.g. "prasanna.a1@x.com" ->
// "Prasanna" — used only until the user sets a real first name / nickname.
function nameFromEmail(email?: string | null): string {
  const local = (email?.split('@')[0] || '').split(/[._\-+0-9]/)[0];
  return local ? local.charAt(0).toUpperCase() + local.slice(1).toLowerCase() : 'there';
}

const AuthContext = createContext<AuthState>({
  session: null,
  loading: true,
  email: null,
  profile: {},
  displayName: 'there',
  celebrate: false,
  triggerCelebrate: () => {},
  updateProfile: async () => ({ error: null }),
  signOut: async () => {},
  deleteAccount: async () => ({ error: null }),
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [celebrate, setCelebrate] = useState(false);

  // Fired on successful sign-in. Lives here (not in LoginScreen) because the auth
  // gate unmounts LoginScreen the instant a session exists — so the confetti must
  // be owned above the gate to survive the login→app transition.
  const triggerCelebrate = () => {
    setCelebrate(true);
    setTimeout(() => setCelebrate(false), 2400);
  };

  useEffect(() => {
    let mounted = true;

    // Restore any persisted session on cold start.
    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setSession(data.session);
      setLoading(false);
    });

    // React to sign-in / sign-out / token refresh for the app's lifetime.
    const { data: sub } = supabase.auth.onAuthStateChange((event, next) => {
      // A real auth transition resets session-scoped UI flags so the next user
      // starts at the Landing screen (not wherever the last user navigated).
      // Token refreshes must NOT reset — they fire mid-session.
      if (event === 'SIGNED_IN' || event === 'SIGNED_OUT') resetSessionFlags();
      setSession(next);
      setLoading(false);
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const updateProfile = async (fields: Profile): Promise<{ error: string | null }> => {
    // Merge into existing metadata so we never wipe fields the form didn't touch.
    const current = (session?.user?.user_metadata ?? {}) as Profile;
    const { data, error } = await supabase.auth.updateUser({ data: { ...current, ...fields } });
    if (error) return { error: error.message };
    if (data.user) setSession(s => (s ? { ...s, user: data.user } : s));
    return { error: null };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  const deleteAccount = async (): Promise<{ error: string | null }> => {
    try {
      // 1. Delete all user data + the auth record on the backend. If this fails
      // we STOP — signing out anyway would tell the user their data was erased
      // when it wasn't.
      await api.deleteAccount();
    } catch (e: any) {
      return { error: e?.message || "Couldn't delete your data — check your connection and try again." };
    }
    // 2. Clear the local session. Scope 'local' only — the server-side session
    // is already dead (the auth user was just deleted), so a server sign-out
    // would fail and previously made a successful deletion LOOK broken.
    try {
      await supabase.auth.signOut({ scope: 'local' });
    } catch {
      // Local storage clear can't meaningfully fail; the gate flips on the
      // auth listener either way.
    }
    return { error: null };
  };

  const email = session?.user?.email ?? null;
  const profile = (session?.user?.user_metadata ?? {}) as Profile;
  const displayName =
    profile.nickname?.trim() || profile.first_name?.trim() || nameFromEmail(email);

  return (
    <AuthContext.Provider
      value={{ session, loading, email, profile, displayName, celebrate, triggerCelebrate, updateProfile, signOut, deleteAccount }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
