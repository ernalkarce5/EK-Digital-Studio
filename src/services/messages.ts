import { db, publicDb } from '@/lib/supabase';
import { unwrap } from '@/lib/errors';
import type { ContactMessage, MessageStatus } from '@/types/database';

export interface ContactSubmission {
  fullName: string;
  email: string;
  company?: string;
  projectType: string;
  budget?: string;
  message: string;
  preferredContact?: string;
  phone?: string;
  /** Honeypot value: must stay empty for humans. */
  website?: string;
  elapsedMs: number;
}

export type SubmitResult =
  | { ok: true }
  | { ok: false; error: 'validation' | 'rate_limited'; field?: string; message: string };

/** Public: submits through the security-definer RPC (validated, sanitized, rate-limited server side). */
export async function submitContactMessage(input: ContactSubmission): Promise<SubmitResult> {
  const { data, error } = await publicDb().rpc('submit_contact_message', {
    p_full_name: input.fullName,
    p_email: input.email,
    p_project_type: input.projectType,
    p_message: input.message,
    p_company: input.company || null,
    p_budget: input.budget || null,
    p_preferred_contact: input.preferredContact || null,
    p_website: input.website || null,
    p_elapsed_ms: Math.round(input.elapsedMs),
    p_phone: input.phone || null,
  });
  if (error) throw error;
  if (!data || typeof data !== 'object' || !('ok' in data)) {
    throw new Error('Unexpected response from the server.');
  }
  return data as SubmitResult;
}

// ── Admin ────────────────────────────────────────────────────────

export async function listMessages(status?: MessageStatus | 'all'): Promise<ContactMessage[]> {
  let q = db()
    .from('contact_messages')
    .select('id, full_name, email, company, project_type, budget, message, preferred_contact, phone, status, read_at, created_at, updated_at')
    .order('created_at', { ascending: false })
    .limit(500);
  if (status && status !== 'all') q = q.eq('status', status);
  return unwrap(await q) as ContactMessage[];
}

export async function setMessageStatus(id: string, status: MessageStatus): Promise<ContactMessage> {
  const patch: Partial<ContactMessage> = { status };
  if (status !== 'new') patch.read_at = new Date().toISOString();
  else patch.read_at = null;
  const res = await db().from('contact_messages').update(patch).eq('id', id).select('*').single();
  return unwrap(res) as ContactMessage;
}

export async function deleteMessage(id: string): Promise<void> {
  const res = await db().from('contact_messages').delete().eq('id', id).select('id');
  if ((res.error as { code?: string } | null)?.code === '23503') {
    // Assignment rows reference the message (on delete restrict): its history must be kept.
    throw new Error('This inquiry has been assigned to a moderator, so its history is kept. Archive it instead of deleting.');
  }
  const rows = unwrap(res) as { id: string }[];
  if (!rows.length) throw new Error('The message could not be deleted (not found or not permitted).');
}

/** Unread inquiries still in the admin's unassigned inbox (assigned leads are handled by moderators). */
export async function countUnreadMessages(): Promise<number> {
  const [unread, assigned] = await Promise.all([
    db().from('contact_messages').select('id').eq('status', 'new').limit(1000),
    db().from('lead_assignments').select('message_id').is('released_at', null),
  ]);
  const ids = (unwrap(unread) ?? []) as { id: string }[];
  const taken = new Set(((unwrap(assigned) ?? []) as { message_id: string }[]).map((a) => a.message_id));
  return ids.filter((m) => !taken.has(m.id)).length;
}
