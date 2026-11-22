// Lead (assigned inquiry) data access. Visibility is enforced by RLS: admins
// see everything; a moderator sees only their current assignments.
import { db } from '@/lib/supabase';
import { unwrap } from '@/lib/errors';
import type {
  CommunicationChannel,
  CommunicationDirection,
  CommunicationLog,
  ContactMessage,
  LeadActivity,
  LeadAssignment,
  LeadClient,
  LeadNote,
  LeadStatus,
  Moderator,
  ProjectBrief,
  ProjectBriefContent,
} from '@/types/database';

const MESSAGE_FIELDS = 'id, full_name, email, company, project_type, budget, message, preferred_contact, phone, status, read_at, created_at, updated_at';
const WITH_RELATIONS = `*, message:contact_messages(${MESSAGE_FIELDS}), moderator:moderators(id, full_name, email, is_active)`;

export type LeadMessage = Omit<ContactMessage, never>;
export interface LeadSummary extends LeadAssignment {
  message: LeadMessage | null;
  moderator: Pick<Moderator, 'id' | 'full_name' | 'email' | 'is_active'> | null;
}

// ── Assignments ──────────────────────────────────────────────────

export async function listCurrentAssignments(opts: { statuses?: LeadStatus[]; moderatorId?: string } = {}): Promise<LeadSummary[]> {
  let q = db().from('lead_assignments').select(WITH_RELATIONS).is('released_at', null).order('updated_at', { ascending: false });
  if (opts.statuses?.length) q = q.in('status', opts.statuses);
  if (opts.moderatorId) q = q.eq('moderator_id', opts.moderatorId);
  return unwrap(await q) as LeadSummary[];
}

/** Admin: every assignment row for a message (current + released), oldest first. */
export async function listAssignmentHistory(messageId: string): Promise<LeadSummary[]> {
  const res = await db().from('lead_assignments').select(WITH_RELATIONS).eq('message_id', messageId).order('assigned_at');
  return unwrap(res) as LeadSummary[];
}

/** Admin inbox helper: message_id → current assignment (with moderator name). */
export async function currentAssignmentsByMessage(): Promise<Map<string, LeadSummary>> {
  const res = await db()
    .from('lead_assignments')
    .select('*, moderator:moderators(id, full_name, email, is_active)')
    .is('released_at', null);
  const rows = (unwrap(res) ?? []) as LeadSummary[];
  return new Map(rows.map((r) => [r.message_id, r]));
}

export interface LeadWorkspace {
  message: LeadMessage;
  assignment: LeadSummary | null;
  client: LeadClient | null;
  brief: ProjectBrief | null;
  communications: CommunicationLog[];
  notes: LeadNote[];
  activity: LeadActivity[];
}

/** Everything about one lead. Returns null if the caller may not see the message. */
export async function getLeadWorkspace(messageId: string): Promise<LeadWorkspace | null> {
  const message = unwrap(
    await db().from('contact_messages').select(MESSAGE_FIELDS).eq('id', messageId).maybeSingle(),
  ) as LeadMessage | null;
  if (!message) return null;
  const [assignment, client, brief, communications, notes, activity] = await Promise.all([
    db().from('lead_assignments').select(WITH_RELATIONS).eq('message_id', messageId).is('released_at', null).maybeSingle(),
    db().from('lead_clients').select('*').eq('message_id', messageId).maybeSingle(),
    db().from('project_briefs').select('*').eq('message_id', messageId).maybeSingle(),
    db().from('communication_logs').select('*').eq('message_id', messageId).order('occurred_at').order('created_at'),
    db().from('lead_notes').select('*').eq('message_id', messageId).order('created_at'),
    db().from('lead_activity_logs').select('*').eq('message_id', messageId).order('created_at', { ascending: false }).limit(100),
  ]);
  return {
    message,
    assignment: unwrap(assignment) as LeadSummary | null,
    client: unwrap(client) as LeadClient | null,
    brief: unwrap(brief) as ProjectBrief | null,
    communications: (unwrap(communications) ?? []) as CommunicationLog[],
    notes: (unwrap(notes) ?? []) as LeadNote[],
    activity: (unwrap(activity) ?? []) as LeadActivity[],
  };
}

// ── Lead data ────────────────────────────────────────────────────

export type ClientInput = Pick<LeadClient, 'company' | 'industry' | 'preferred_contact' | 'additional_contacts' | 'notes'>;

/**
 * Update-then-insert instead of upsert: moderators may update only the content
 * columns (not the key), and an upsert would also write message_id on conflict.
 */
async function saveByMessage<T>(table: 'lead_clients' | 'project_briefs', messageId: string, values: object): Promise<T> {
  const updated = unwrap(await db().from(table).update(values).eq('message_id', messageId).select('*')) as T[];
  if (updated.length) return updated[0];
  const res = await db().from(table).insert({ message_id: messageId, ...values }).select('*').single();
  if (res.error) {
    // Updating returned nothing and inserting was refused: the lead is no longer editable.
    if (['42501', '23505'].includes((res.error as { code?: string }).code ?? '')) {
      throw new Error('This lead can no longer be edited (it may have been submitted, reassigned or completed).');
    }
    throw res.error;
  }
  return res.data as T;
}

export const saveClient = (messageId: string, input: ClientInput) => saveByMessage<LeadClient>('lead_clients', messageId, input);

/** Saves the brief as-is (drafts allowed: no field is required). */
export const saveBrief = (messageId: string, input: ProjectBriefContent) =>
  saveByMessage<ProjectBrief>('project_briefs', messageId, input);

export async function addCommunication(input: {
  messageId: string;
  channel: CommunicationChannel;
  direction: CommunicationDirection;
  occurredAt: string;
  summary: string;
  authorRole: 'admin' | 'moderator';
}): Promise<CommunicationLog> {
  const res = await db()
    .from('communication_logs')
    .insert({
      message_id: input.messageId,
      channel: input.channel,
      direction: input.direction,
      occurred_at: input.occurredAt,
      summary: input.summary.trim(),
      author_role: input.authorRole, // overwritten server-side from the session
    })
    .select('*')
    .single();
  return unwrap(res) as CommunicationLog;
}

export async function addNote(input: {
  messageId: string;
  body: string;
  authorRole: 'admin' | 'moderator';
  visibility?: 'shared' | 'admin_only';
  kind?: 'note' | 'help_request';
}): Promise<LeadNote> {
  const res = await db()
    .from('lead_notes')
    .insert({
      message_id: input.messageId,
      body: input.body.trim(),
      author_role: input.authorRole, // overwritten server-side from the session
      visibility: input.visibility ?? 'shared',
      kind: input.kind ?? 'note',
    })
    .select('*')
    .single();
  return unwrap(res) as LeadNote;
}

/** All communication across the caller's visible leads (moderator: own leads only). */
export async function listCommunications(limit = 200): Promise<CommunicationLog[]> {
  const res = await db().from('communication_logs').select('*').order('occurred_at', { ascending: false }).limit(limit);
  return unwrap(res) as CommunicationLog[];
}

export async function listBriefs(messageIds: string[]): Promise<ProjectBrief[]> {
  if (!messageIds.length) return [];
  const res = await db().from('project_briefs').select('*').in('message_id', messageIds);
  return unwrap(res) as ProjectBrief[];
}

// ── Workflow (database functions) ────────────────────────────────

async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await db().rpc(fn, args);
  if (error) throw error;
  return data as T;
}

export const assignLead = (messageId: string, moderatorId: string, note?: string) =>
  rpc<LeadAssignment>('assign_lead', { p_message_id: messageId, p_moderator_id: moderatorId, p_note: note?.trim() || null });

export const transferLead = (assignmentId: string, moderatorId: string, note?: string) =>
  rpc<LeadAssignment>('transfer_lead', { p_assignment_id: assignmentId, p_moderator_id: moderatorId, p_note: note?.trim() || null });

export const returnLead = (assignmentId: string, reason?: string) =>
  rpc<void>('return_lead', { p_assignment_id: assignmentId, p_reason: reason?.trim() || null });

export const moderatorReturnLead = (assignmentId: string, reason: string) =>
  rpc<void>('moderator_return_lead', { p_assignment_id: assignmentId, p_reason: reason.trim() });

export const moderatorSetStatus = (assignmentId: string, status: LeadStatus) =>
  rpc<LeadAssignment>('moderator_set_status', { p_assignment_id: assignmentId, p_status: status });

export const adminSetStatus = (assignmentId: string, status: LeadStatus, note?: string) =>
  rpc<LeadAssignment>('admin_set_status', { p_assignment_id: assignmentId, p_status: status, p_note: note?.trim() || null });

export const submitBrief = (assignmentId: string) => rpc<LeadAssignment>('submit_brief', { p_assignment_id: assignmentId });

export const reviewBrief = (assignmentId: string, decision: 'start_review' | 'approve' | 'request_changes', note?: string) =>
  rpc<LeadAssignment>('review_brief', { p_assignment_id: assignmentId, p_decision: decision, p_note: note?.trim() || null });

/** Admin badge: briefs submitted and not yet picked up for review. */
export async function countBriefsAwaitingReview(): Promise<number> {
  const { count, error } = await db()
    .from('lead_assignments')
    .select('id', { count: 'exact', head: true })
    .is('released_at', null)
    .eq('status', 'brief_completed');
  if (error) throw error;
  return count ?? 0;
}

// ── Activity ─────────────────────────────────────────────────────

export async function listLeadActivity(opts: { limit?: number; moderatorId?: string; action?: string } = {}): Promise<LeadActivity[]> {
  let q = db().from('lead_activity_logs').select('*').order('created_at', { ascending: false }).limit(opts.limit ?? 200);
  if (opts.moderatorId) q = q.eq('moderator_id', opts.moderatorId);
  if (opts.action) q = q.eq('action', opts.action);
  return unwrap(await q) as LeadActivity[];
}

export const notifyLeadsChanged = () => window.dispatchEvent(new Event('ek:leads-changed'));
