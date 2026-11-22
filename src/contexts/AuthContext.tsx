import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { db, supabase } from '@/lib/supabase';

/** Server-verified role (public.app_role()). */
export type AppRole = 'admin' | 'moderator';
/** Which dashboard a sign-in / password flow belongs to. */
export type AuthArea = 'admin' | 'moderator';

export const AREA_PATHS: Record<AuthArea, { home: string; login: string; reset: string }> = {
  admin: { home: '/admin', login: '/admin/login', reset: '/admin/reset-password' },
  moderator: { home: '/moderator', login: '/moderator/login', reset: '/moderator/set-password' },
};

interface AuthContextValue {
  session: Session | null;
  user: User | null;
  role: AppRole | null;
  /** Server-verified admin flag (public.is_admin()). */
  isAdmin: boolean;
  /** Server-verified active moderator (public.is_moderator()). */
  isModerator: boolean;
  /** True until the initial session and role check have resolved. */
  loading: boolean;
  /** Set when the user arrived through a password-recovery or invite link. */
  recoveryMode: boolean;
  signIn: (email: string, password: string, area?: AuthArea) => Promise<void>;
  signOut: () => Promise<void>;
  sendPasswordReset: (email: string, area?: AuthArea) => Promise<void>;
  updatePassword: (password: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

async function fetchRole(): Promise<AppRole | null> {
  const { data, error } = await db().rpc('app_role');
  if (error) throw error;
  return data === 'admin' || data === 'moderator' ? data : null;
}

/** Explains why an account cannot use the requested dashboard. */
function wrongAreaMessage(area: AuthArea, role: AppRole | null): string {
  if (area === 'admin' && role === 'moderator') {
    return 'This is a moderator account. Please sign in through the moderator dashboard.';
  }
  if (area === 'moderator' && role === 'admin') {
    return 'This is an administrator account. Please sign in through the admin dashboard.';
  }
  return area === 'admin'
    ? 'This account does not have administrator access.'
    : 'This account does not have moderator access, or it has been deactivated.';
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [role, setRole] = useState<AppRole | null>(null);
  const [loading, setLoading] = useState(Boolean(supabase));
  const [recoveryMode, setRecoveryMode] = useState(false);

  useEffect(() => {
    if (!supabase) return;
    let active = true;

    const apply = async (next: Session | null) => {
      if (!active) return;
      setSession(next);
      if (!next) {
        setRole(null);
        setLoading(false);
        return;
      }
      try {
        const r = await fetchRole();
        if (active) setRole(r);
      } catch {
        if (active) setRole(null);
      } finally {
        if (active) setLoading(false);
      }
    };

    supabase.auth.getSession().then(({ data }) => apply(data.session));

    const { data: sub } = supabase.auth.onAuthStateChange((event, next) => {
      if (event === 'PASSWORD_RECOVERY') setRecoveryMode(true);
      if (event === 'INITIAL_SESSION') return;
      // Defer Supabase calls out of the auth callback to avoid lock contention.
      window.setTimeout(() => void apply(next), 0);
    });

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const signIn = useCallback(async (email: string, password: string, area: AuthArea = 'admin') => {
    const { data, error } = await db().auth.signInWithPassword({ email, password });
    if (error) throw error;
    const r = await fetchRole().catch(() => null);
    if (r !== area) {
      await db().auth.signOut();
      throw new Error(wrongAreaMessage(area, r));
    }
    setSession(data.session);
    setRole(r);
  }, []);

  const signOut = useCallback(async () => {
    const { error } = await db().auth.signOut();
    if (error) throw error;
    setSession(null);
    setRole(null);
  }, []);

  const sendPasswordReset = useCallback(async (email: string, area: AuthArea = 'admin') => {
    const origin = import.meta.env.VITE_SITE_URL?.replace(/\/$/, '') || window.location.origin;
    const { error } = await db().auth.resetPasswordForEmail(email, {
      redirectTo: `${origin}${AREA_PATHS[area].reset}`,
    });
    if (error) throw error;
  }, []);

  const updatePassword = useCallback(async (password: string) => {
    const { error } = await db().auth.updateUser({ password });
    if (error) throw error;
    setRecoveryMode(false);
  }, []);

  return (
    <AuthContext.Provider
      value={{
        session,
        user: session?.user ?? null,
        role,
        isAdmin: role === 'admin',
        isModerator: role === 'moderator',
        loading,
        recoveryMode,
        signIn,
        signOut,
        sendPasswordReset,
        updatePassword,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
