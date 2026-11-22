import { NotConfiguredError } from './supabase';

interface PostgrestLikeError {
  code?: string;
  message?: string;
  details?: string;
}

/** Turns Supabase / network errors into a sentence an admin or visitor can act on. */
export function toErrorMessage(err: unknown, fallback = 'Something went wrong. Please try again.'): string {
  if (err instanceof NotConfiguredError) return err.message;
  const e = (err ?? {}) as PostgrestLikeError;
  switch (e.code) {
    case '23505':
      if (e.message?.includes('slug')) return 'That slug is already used. Choose a different one.';
      if (e.message?.includes('name')) return 'An item with that name already exists.';
      return 'This item already exists.';
    case '23503':
      return 'This item is still in use and cannot be removed.';
    case '23514':
      return 'Some values are not valid. Check the fields and try again.';
    case '42501':
      return 'You do not have permission to do that.';
    case 'PGRST116':
      return 'The requested item was not found.';
  }
  if (err instanceof TypeError && /fetch|network/i.test(err.message)) {
    return 'Network error. Check your connection and try again.';
  }
  if (err instanceof Error && err.message) return err.message;
  if (e.message) return e.message;
  return fallback;
}

/**
 * Message safe to show public visitors: never exposes database errors,
 * configuration names or other technical detail.
 */
export function publicErrorMessage(err: unknown, fallback = 'Something went wrong. Please try again in a moment.'): string {
  if (err instanceof NotConfiguredError) return err.message;
  if (err instanceof TypeError && /fetch|network/i.test(err.message)) {
    return 'Network error. Check your connection and try again.';
  }
  return fallback;
}

/** Throws the Supabase error if present so callers can rely on try/catch. */
export function unwrap<T>(res: { data: T; error: unknown }): T {
  if (res.error) throw res.error;
  return res.data;
}
