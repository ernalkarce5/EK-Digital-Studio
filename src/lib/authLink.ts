import type { EmailOtpType, User } from '@supabase/supabase-js';
import { initialAuthLink } from './authLinkUrl';
import { db, supabase } from './supabase';

/**
 * Invitation and password-recovery links.
 *
 * Supabase sends people back to /moderator/set-password or /admin/reset-password in one of two forms:
 *  - Default email template (`{{ .ConfirmationURL }}`): Supabase verifies the one-time token itself
 *    and redirects with `#access_token=…&type=invite|recovery`, or with `#error=…&error_code=otp_expired`
 *    when the token was already used or expired.
 *  - Recommended template: `…/set-password?token_hash={{ .TokenHash }}&type=invite`. The token is only
 *    verified when the page runs (verifyOtp), so email link scanners that pre-open links cannot use it up.
 *
 * supabase-js removes the fragment while it initialises, and on a failed link it keeps whatever session
 * was already stored in the browser. The page therefore must not trust "some session exists": it checks
 * that the session belongs to the link, and that the Auth server still accepts it, before showing the form.
 */

export type LinkType = 'invite' | 'recovery';

export type LinkResult =
  | { status: 'ready'; user: User; type: LinkType }
  | { status: 'missing' }
  | { status: 'expired' }
  | { status: 'invalid'; reason: string };

const VERIFIED_KEY = 'ek-auth-link-verified';

let pending: Promise<LinkResult> | null = null;

/**
 * Resolves the link the page was opened with. Memoised: the token is single-use, so it must be
 * verified exactly once (also under React StrictMode's double effects).
 */
export function resolveAuthLink(allowed: readonly LinkType[]): Promise<LinkResult> {
  pending ??= resolve(allowed);
  return pending;
}

/** Call after the password was set: the link session must not unlock the form again. */
export function finishAuthLink() {
  try {
    sessionStorage.removeItem(VERIFIED_KEY);
  } catch {
    /* storage unavailable */
  }
  pending = Promise.resolve({ status: 'missing' });
}

async function resolve(allowed: readonly LinkType[]): Promise<LinkResult> {
  if (!supabase) return { status: 'invalid', reason: 'Sign-in is temporarily unavailable.' };
  const link = initialAuthLink;

  let expectedUserId: string | null = null;
  let type: LinkType | null = null;

  if (link) {
    // Never fall back to an unrelated session when the link itself failed.
    if (link.errorCode) {
      return /expired|access_denied|otp/i.test(`${link.errorCode} ${link.errorDescription ?? ''}`)
        ? { status: 'expired' }
        : { status: 'invalid', reason: link.errorDescription ?? 'This link could not be used.' };
    }
    if (!link.type || !(allowed as readonly string[]).includes(link.type)) {
      return { status: 'invalid', reason: 'This link is not meant for this page.' };
    }
    type = link.type as LinkType;

    if (link.tokenHash) {
      // Remove the single-use token from the address bar and history before using it.
      window.history.replaceState(window.history.state, '', window.location.pathname);
      const { data, error } = await db().auth.verifyOtp({ token_hash: link.tokenHash, type: type as EmailOtpType });
      if (error || !data.session) {
        return /expired|invalid|otp/i.test(error?.message ?? '') || error?.code === 'otp_expired'
          ? { status: 'expired' }
          : { status: 'invalid', reason: error?.message ?? 'This link could not be used.' };
      }
      expectedUserId = data.session.user.id;
    } else {
      // Validate the link's OWN token with the Auth server. The JWT's `sub` alone proves nothing:
      // a forged or failed token would otherwise match a different session already stored here.
      if (!link.accessToken) return { status: 'expired' };
      const { data: linkUser, error: linkError } = await db().auth.getUser(link.accessToken);
      if (linkError || !linkUser.user) return { status: 'expired' };
      expectedUserId = linkUser.user.id;
    }
  } else {
    // Reload after a verified link in this tab: allowed only for the same user.
    try {
      const saved = JSON.parse(sessionStorage.getItem(VERIFIED_KEY) ?? 'null') as { userId?: string; type?: LinkType } | null;
      if (saved?.userId && saved.type && allowed.includes(saved.type)) {
        expectedUserId = saved.userId;
        type = saved.type;
      }
    } catch {
      /* storage unavailable */
    }
    if (!expectedUserId) return { status: 'missing' };
  }

  // Waits for supabase-js to finish processing the URL fragment.
  const { data: sessionData } = await db().auth.getSession();
  const session = sessionData.session;
  if (!session || !expectedUserId || session.user.id !== expectedUserId) {
    return { status: 'expired' };
  }

  // Ask the Auth server: a revoked session ("session_not_found") must not show the form.
  const { data: userData, error } = await db().auth.getUser();
  if (error || !userData.user || userData.user.id !== expectedUserId) {
    return { status: 'expired' };
  }

  try {
    sessionStorage.setItem(VERIFIED_KEY, JSON.stringify({ userId: expectedUserId, type }));
  } catch {
    /* storage unavailable */
  }
  return { status: 'ready', user: userData.user, type: type! };
}
