// Moderator accounts. Privileged operations go through database functions
// (admin rights re-checked server-side) or the invite Netlify function.
import { db } from '@/lib/supabase';
import { unwrap } from '@/lib/errors';
import type { LeadStatus, Moderator } from '@/types/database';
import { ACTIVE_STATUSES, DONE_STATUSES, REVIEW_STATUSES } from '@/lib/leads';

export interface ModeratorWithStats extends Moderator {
  active: number;
  inReview: number;
  completed: number;
}

export async function listModerators(): Promise<Moderator[]> {
  return unwrap(await db().from('moderators').select('*').order('full_name')) as Moderator[];
}

export async function listModeratorsWithStats(): Promise<ModeratorWithStats[]> {
  const [mods, assignments] = await Promise.all([
    listModerators(),
    db().from('lead_assignments').select('moderator_id, status').is('released_at', null),
  ]);
  const rows = (unwrap(assignments) ?? []) as { moderator_id: string; status: LeadStatus }[];
  return mods.map((m) => {
    const mine = rows.filter((r) => r.moderator_id === m.id);
    return {
      ...m,
      active: mine.filter((r) => ACTIVE_STATUSES.includes(r.status)).length,
      inReview: mine.filter((r) => REVIEW_STATUSES.includes(r.status)).length,
      completed: mine.filter((r) => DONE_STATUSES.includes(r.status)).length,
    };
  });
}

/** Registers an existing Supabase Auth account as a moderator (no email sent). */
export async function addExistingModerator(email: string, fullName: string): Promise<Moderator> {
  const res = await db().rpc('admin_add_moderator', { p_email: email, p_full_name: fullName }).single();
  return unwrap(res) as Moderator;
}

export interface InviteResult {
  invited: boolean;
  moderator: Moderator;
}

/**
 * Sends a Supabase invitation email and registers the account as a moderator.
 * Runs in the `invite-moderator` Netlify function (service-role key stays server-side).
 */
export async function inviteModerator(email: string, fullName: string): Promise<InviteResult> {
  const { data } = await db().auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error('Your session has expired. Please sign in again.');
  let res: Response;
  try {
    res = await fetch('/.netlify/functions/invite-moderator', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({ email, fullName }),
    });
  } catch {
    throw new Error('Network error. Check your connection and try again.');
  }
  const body = (await res.json().catch(() => null)) as
    | { ok?: boolean; invited?: boolean; moderator?: Moderator; message?: string; error?: string }
    | null;
  if (res.status === 404) {
    throw Object.assign(new Error('Email invitations are not available in this environment. Link an existing account instead.'), {
      code: 'not_configured',
    });
  }
  if (!res.ok || !body?.ok || !body.moderator) {
    throw Object.assign(new Error(body?.message || 'The invitation could not be sent.'), { code: body?.error });
  }
  return { invited: Boolean(body.invited), moderator: body.moderator };
}

export async function setModeratorActive(id: string, active: boolean): Promise<Moderator> {
  const res = await db().rpc('admin_set_moderator_active', { p_moderator_id: id, p_active: active }).single();
  return unwrap(res) as Moderator;
}

export async function getModerator(id: string): Promise<Moderator | null> {
  return unwrap(await db().from('moderators').select('*').eq('id', id).maybeSingle()) as Moderator | null;
}

/** Moderators may change only their own display name (column privilege + RLS). */
export async function renameModerator(id: string, fullName: string): Promise<Moderator> {
  const res = await db().from('moderators').update({ full_name: fullName.trim() }).eq('id', id).select('*').single();
  return unwrap(res) as Moderator;
}
