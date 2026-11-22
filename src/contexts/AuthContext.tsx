import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { db, supabase } from '@/lib/supabase';

interface AuthContextValue {
  session: Session | null;
  user: User | null;
  /** Server-verified admin flag (public.is_admin()). */
  isAdmin: boolean;
  /** True until the initial session and admin check have resolved. */
  loading: boolean;
  /** Set when the user arrived through a password-recovery link. */
  recoveryMode: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  sendPasswordReset: (email: string) => Promise<void>;
  updatePassword: (password: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

async function checkAdmin(): Promise<boolean> {
  const { data, error } = await db().rpc('is_admin');
  if (error) throw error;
  return data === true;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(Boolean(supabase));
  const [recoveryMode, setRecoveryMode] = useState(false);

  useEffect(() => {
    if (!supabase) return;
    let active = true;

    const apply = async (next: Session | null) => {
      if (!active) return;
      setSession(next);
      if (!next) {
        setIsAdmin(false);
        setLoading(false);
        return;
      }
      try {
        const admin = await checkAdmin();
        if (active) setIsAdmin(admin);
      } catch {
        if (active) setIsAdmin(false);
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

  const signIn = useCallback(async (email: string, password: string) => {
    const { data, error } = await db().auth.signInWithPassword({ email, password });
    if (error) throw error;
    const admin = await checkAdmin().catch(() => false);
    if (!admin) {
      await db().auth.signOut();
      throw new Error('This account does not have administrator access.');
    }
    setSession(data.session);
    setIsAdmin(true);
  }, []);

  const signOut = useCallback(async () => {
    const { error } = await db().auth.signOut();
    if (error) throw error;
    setSession(null);
    setIsAdmin(false);
  }, []);

  const sendPasswordReset = useCallback(async (email: string) => {
    const origin = import.meta.env.VITE_SITE_URL?.replace(/\/$/, '') || window.location.origin;
    const { error } = await db().auth.resetPasswordForEmail(email, {
      redirectTo: `${origin}/admin/reset-password`,
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
        isAdmin,
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
