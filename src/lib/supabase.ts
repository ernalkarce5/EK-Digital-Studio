import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL?.trim();
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim();

export const SUPABASE_URL = url ?? '';
export const MEDIA_BUCKET = import.meta.env.VITE_SUPABASE_MEDIA_BUCKET?.trim() || 'media';

export const isSupabaseConfigured = Boolean(
  url && anonKey && /^https?:\/\//.test(url) && !url.includes('your-project-ref'),
);

export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(url!, anonKey!, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    })
  : null;

/**
 * Session-less client for public, anonymous reads (and the contact RPC).
 * Public pages never wait on the auth session lock, which supabase-js shares
 * across tabs; an admin tab refreshing its token cannot stall the website.
 * Public data is defined by RLS for the anon role, so no session is needed.
 */
export const publicClient: SupabaseClient | null = isSupabaseConfigured
  ? createClient(url!, anonKey!, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false, storageKey: 'ek-public' },
    })
  : null;

/**
 * Thrown when the Supabase env vars are missing. The message is deliberately
 * neutral because it can reach public visitors; setup details live in the README
 * and in the development-only banner.
 */
export class NotConfiguredError extends Error {
  constructor() {
    super('This content is temporarily unavailable. Please try again later.');
    this.name = 'NotConfiguredError';
  }
}

/** Authenticated client (admin). Throws a descriptive error when env vars are missing. */
export function db(): SupabaseClient {
  if (!supabase) throw new NotConfiguredError();
  return supabase;
}

/** Anonymous client for the public website. */
export function publicDb(): SupabaseClient {
  if (!publicClient) throw new NotConfiguredError();
  return publicClient;
}
