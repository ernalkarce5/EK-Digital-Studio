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
  const rows = unwrap(await db().from('contact_messages').delete().eq('id', id).select('id')) as { id: string }[];
  if (!rows.length) throw new Error('The message could not be deleted (not found or not permitted).');
}

export async function countUnreadMessages(): Promise<number> {
  const { count, error } = await db()
    .from('contact_messages')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'new');
  if (error) throw error;
  return count ?? 0;
}
