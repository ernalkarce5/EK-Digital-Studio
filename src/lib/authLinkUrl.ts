/**
 * Reads invitation / recovery link parameters from the URL the page was opened with.
 * No imports on purpose: src/lib/supabase.ts imports this module first, so the URL is
 * captured before the Supabase client reads and clears the fragment.
 */

export interface RawAuthLink {
  type: string | null;
  /** Access token from the fragment (implicit flow), kept in memory only so the Auth server can validate it. */
  accessToken: string | null;
  hasTokens: boolean;
  tokenHash: string | null;
  errorCode: string | null;
  errorDescription: string | null;
}

export function parseAuthLink(href: string): RawAuthLink | null {
  const url = new URL(href);
  const params = new URLSearchParams(url.search);
  new URLSearchParams(url.hash.replace(/^#/, '')).forEach((v, k) => params.set(k, v));
  const accessToken = params.get('access_token');
  const link: RawAuthLink = {
    type: params.get('type'),
    accessToken,
    hasTokens: Boolean(accessToken && params.get('refresh_token')),
    tokenHash: params.get('token_hash'),
    errorCode: params.get('error_code') ?? params.get('error'),
    errorDescription: params.get('error_description'),
  };
  return link.hasTokens || link.tokenHash || link.errorCode ? link : null;
}

export const initialAuthLink: RawAuthLink | null = typeof window === 'undefined' ? null : parseAuthLink(window.location.href);
