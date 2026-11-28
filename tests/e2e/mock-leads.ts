/**
 * Moderator & lead-management half of the in-memory Supabase mock.
 * Mirrors the RLS visibility rules and the security-definer workflow
 * functions of migration 20261123000001 so the UI can be exercised end to
 * end. The real policies/functions are verified in tests/db/leads.test.mjs.
 */

import { toPayload, validateAnswers, type QuestionnaireAnswers } from '../../src/lib/questionnaire';

export type Row = Record<string, unknown> & { id: string | number };
export type Role = 'anon' | 'user' | 'admin' | 'moderator';
export interface Session {
  role: Role;
  uid: string | null;
}
export interface RpcResult {
  status: number;
  body: unknown;
}

export const LEAD_TABLES = [
  'moderators',
  'lead_assignments',
  'lead_clients',
  'project_briefs',
  'communication_logs',
  'lead_notes',
  'internal_notifications',
  'lead_activity_logs',
  'client_questionnaires',
] as const;

const ACTIVE = ['new_assignment', 'contacted', 'in_discussion', 'waiting_for_client', 'brief_in_progress', 'changes_requested'];
const WORKING = ['contacted', 'in_discussion', 'waiting_for_client', 'brief_in_progress'];

export interface LeadTables {
  client_questionnaires: Row[];
  moderators: Row[];
  lead_assignments: Row[];
  lead_clients: Row[];
  project_briefs: Row[];
  communication_logs: Row[];
  lead_notes: Row[];
  internal_notifications: Row[];
  lead_activity_logs: Row[];
  contact_messages: Row[];
  profiles: Row[];
}

const now = () => new Date().toISOString();
let seq = 1000;
const uuid = () => `00000000-0000-4000-9000-${String(++seq).padStart(12, '0')}`;
const err = (status: number, code: string, message: string): RpcResult => ({ status, body: { code, message } });
const forbidden = (message = 'Only administrators can do this.') => err(403, '42501', message);

export class LeadsMock {
  constructor(
    private db: LeadTables,
    /** Emails that exist in auth.users (accounts + invited). */
    private authUsers: Map<string, string>,
  ) {}

  // ── Helpers ────────────────────────────────────────────────────
  isActiveModerator(uid: string | null) {
    return !!uid && this.db.moderators.some((m) => m.id === uid && m.is_active === true);
  }
  current(messageId: unknown) {
    return this.db.lead_assignments.find((a) => a.message_id === messageId && a.released_at == null);
  }
  isCurrentModOf(uid: string | null, messageId: unknown) {
    const a = this.current(messageId);
    return !!a && a.moderator_id === uid && this.isActiveModerator(uid);
  }
  editableByMod(uid: string | null, messageId: unknown) {
    const a = this.current(messageId);
    return this.isCurrentModOf(uid, messageId) && !!a && ACTIVE.includes(String(a.status));
  }
  private clientName(messageId: unknown) {
    return String(this.db.contact_messages.find((m) => m.id === messageId)?.full_name ?? '');
  }
  private log(s: Session, action: string, a: Row | undefined, messageId: unknown, moderatorId: unknown, metadata: Record<string, unknown> = {}) {
    this.db.lead_activity_logs.unshift({
      id: ++seq,
      actor_id: s.uid,
      actor_role: s.role === 'admin' || s.role === 'moderator' ? s.role : 'system',
      action,
      assignment_id: a?.id ?? null,
      message_id: messageId ?? null,
      moderator_id: moderatorId ?? null,
      metadata,
      created_at: now(),
    });
  }
  private notify(recipient: unknown, type: string, title: string, body: string, messageId: unknown, assignmentId: unknown) {
    if (!recipient) return;
    this.db.internal_notifications.unshift({
      id: ++seq, recipient_id: recipient, type, title, body, message_id: messageId ?? null, assignment_id: assignmentId ?? null, read_at: null, created_at: now(),
    });
  }
  private notifyAdmins(type: string, title: string, body: string, messageId: unknown, assignmentId: unknown) {
    for (const p of this.db.profiles.filter((x) => x.is_admin)) this.notify(p.id, type, title, body, messageId, assignmentId);
  }

  // ── RLS emulation ──────────────────────────────────────────────
  /** Rows the session may SELECT, or 'denied' for a missing table privilege. */
  visible(table: string, s: Session, rows: Row[]): Row[] | 'denied' | null {
    const isLead = (LEAD_TABLES as readonly string[]).includes(table);
    if (table === 'internal_notifications') return s.uid ? rows.filter((r) => r.recipient_id === s.uid) : 'denied';
    if (s.role === 'admin') return isLead ? rows : null;
    if (isLead && s.role === 'anon') return 'denied';
    if (s.role === 'moderator') {
      switch (table) {
        case 'moderators':
          return rows.filter((r) => r.id === s.uid);
        case 'lead_assignments':
          return rows.filter((r) => r.moderator_id === s.uid && r.released_at == null);
        case 'contact_messages':
          return rows.filter((r) => this.isCurrentModOf(s.uid, r.id));
        case 'lead_clients':
        case 'project_briefs':
        case 'communication_logs':
        case 'client_questionnaires':
          return rows.filter((r) => this.isCurrentModOf(s.uid, r.message_id));
        case 'lead_notes':
          return rows.filter((r) => r.visibility === 'shared' && this.isCurrentModOf(s.uid, r.message_id));
        case 'lead_activity_logs':
          return rows.filter((r) => r.actor_id === s.uid || (r.message_id != null && this.isCurrentModOf(s.uid, r.message_id)));
        case 'admin_activity_logs':
          return [];
      }
    }
    if (isLead) return []; // signed-in non-admin, non-moderator
    return null; // fall back to the existing public rules
  }

  /** May a non-admin session write this row? (admins use the generic path) */
  canWrite(table: string, op: 'insert' | 'update', s: Session, row: Row): boolean {
    if (table === 'internal_notifications') return op === 'update' && row.recipient_id === s.uid;
    if (s.role !== 'moderator') return false;
    switch (table) {
      case 'moderators':
        return op === 'update' && row.id === s.uid;
      case 'lead_clients':
      case 'project_briefs':
        return this.editableByMod(s.uid, row.message_id);
      case 'communication_logs':
        return op === 'insert' && this.isCurrentModOf(s.uid, row.message_id);
      case 'lead_notes':
        return op === 'insert' && row.visibility !== 'admin_only' && this.isCurrentModOf(s.uid, row.message_id);
    }
    return false;
  }

  /** BEFORE INSERT/UPDATE: stamp authorship from the session (cannot be spoofed). */
  stamp(table: string, s: Session, row: Row) {
    if (table === 'communication_logs' || table === 'lead_notes') {
      row.author_id = s.uid;
      row.author_role = s.role === 'admin' ? 'admin' : 'moderator';
      if (table === 'lead_notes') {
        row.visibility ??= 'shared';
        row.kind ??= 'note';
      }
      if (table === 'communication_logs') row.occurred_at ??= now();
    }
    if (table === 'lead_clients' || table === 'project_briefs') {
      row.updated_by = s.uid;
      row.id = row.message_id as string; // keyed by message
    }
  }

  /** AFTER INSERT/UPDATE triggers: audit, notifications, auto status. */
  after(table: string, op: 'insert' | 'update', s: Session, row: Row) {
    const a = this.current(row.message_id);
    if (table === 'project_briefs') this.log(s, op === 'insert' ? 'brief_created' : 'brief_updated', a, row.message_id, a?.moderator_id);
    if (table === 'lead_clients') this.log(s, 'client_info_updated', a, row.message_id, a?.moderator_id);
    if (table === 'communication_logs') {
      this.log(s, row.direction === 'incoming' ? 'client_response_recorded' : 'client_contacted', a, row.message_id, a?.moderator_id, {
        channel: row.channel,
        direction: row.direction,
      });
      if (a && a.status === 'new_assignment' && row.direction === 'outgoing') a.status = 'contacted';
    }
    if (table === 'lead_notes') {
      if (row.kind === 'help_request') {
        this.log(s, 'help_requested', a, row.message_id, a?.moderator_id);
        this.notifyAdmins('help_requested', 'Moderator requests assistance', String(row.body), row.message_id, a?.id);
      } else {
        this.log(s, 'note_added', a, row.message_id, a?.moderator_id, { visibility: row.visibility });
        if (row.author_role === 'admin' && row.visibility === 'shared' && a && !row._fromReview) {
          this.notify(a.moderator_id, 'admin_note', 'Admin added a note', String(row.body), row.message_id, a.id);
        }
      }
      delete row._fromReview;
    }
  }

  // ── Workflow functions ─────────────────────────────────────────
  rpc(fn: string, body: Record<string, unknown>, s: Session): RpcResult | null {
    const isAdmin = s.role === 'admin';
    const assignment = (id: unknown) => {
      const a = this.db.lead_assignments.find((x) => x.id === id);
      if (!a) return err(404, 'P0002', 'Assignment not found.');
      if (a.released_at != null) return err(400, '22023', 'This assignment is no longer active.');
      return a;
    };
    const isErr = (x: Row | RpcResult): x is RpcResult => 'status' in x && 'body' in x && !('id' in x);

    switch (fn) {
      case 'app_role':
        return { status: 200, body: s.role === 'admin' || s.role === 'moderator' ? s.role : null };

      case 'admin_add_moderator': {
        if (!isAdmin) return forbidden();
        const email = String(body.p_email ?? '').trim().toLowerCase();
        const name = String(body.p_full_name ?? '').trim();
        if (!name) return err(400, '22023', 'Please enter the moderator’s name.');
        const uid = this.authUsers.get(email);
        if (!uid) return err(404, 'P0002', 'No account exists for that email yet. Invite the moderator first.');
        if (this.db.profiles.some((p) => p.id === uid && p.is_admin)) return err(400, '22023', 'Administrators cannot be moderators.');
        let m = this.db.moderators.find((x) => x.id === uid);
        if (m) Object.assign(m, { full_name: name, is_active: true, deactivated_at: null, updated_at: now() });
        else {
          m = { id: uid, full_name: name, email, is_active: true, created_by: s.uid, deactivated_at: null, created_at: now(), updated_at: now() };
          this.db.moderators.push(m);
        }
        this.log(s, 'moderator_created', undefined, null, m.id, { name });
        return { status: 200, body: m };
      }

      case 'admin_set_moderator_active': {
        if (!isAdmin) return forbidden();
        const m = this.db.moderators.find((x) => x.id === body.p_moderator_id);
        if (!m) return err(404, 'P0002', 'Moderator not found.');
        m.is_active = Boolean(body.p_active);
        m.deactivated_at = m.is_active ? null : now();
        const open = this.db.lead_assignments.filter((a) => a.moderator_id === m.id && a.released_at == null && !['approved', 'archived'].includes(String(a.status))).length;
        this.log(s, m.is_active ? 'moderator_activated' : 'moderator_deactivated', undefined, null, m.id, { open_leads: open });
        if (!m.is_active && open > 0) this.notifyAdmins('moderator_attention', `${m.full_name} was deactivated with ${open} open lead(s)`, 'Transfer or retrieve these leads.', null, null);
        return { status: 200, body: m };
      }

      case 'assign_lead': {
        if (!isAdmin) return forbidden();
        if (!this.isActiveModerator(String(body.p_moderator_id))) return err(400, '22023', 'Choose an active moderator.');
        if (!this.db.contact_messages.some((m) => m.id === body.p_message_id)) return err(404, 'P0002', 'Message not found.');
        if (this.current(body.p_message_id)) return err(400, '22023', 'This message is already assigned. Transfer it instead.');
        const a: Row = {
          id: uuid(), message_id: body.p_message_id, moderator_id: body.p_moderator_id, status: 'new_assignment',
          admin_note: (body.p_note as string) || null, assigned_by: s.uid, assigned_at: now(), released_at: null, release_reason: null,
          submitted_at: null, approved_at: null, archived_at: null, created_at: now(), updated_at: now(),
        };
        this.db.lead_assignments.push(a);
        const name = this.clientName(a.message_id);
        this.log(s, 'assignment_created', a, a.message_id, a.moderator_id, { client: name });
        this.notify(a.moderator_id, 'assignment_new', `New lead assigned: ${name}`, String(a.admin_note ?? ''), a.message_id, a.id);
        return { status: 200, body: a };
      }

      case 'transfer_lead': {
        if (!isAdmin) return forbidden();
        const old = assignment(body.p_assignment_id);
        if (isErr(old)) return old;
        if (old.moderator_id === body.p_moderator_id) return err(400, '22023', 'The lead is already assigned to this moderator.');
        if (!this.isActiveModerator(String(body.p_moderator_id))) return err(400, '22023', 'Choose an active moderator.');
        Object.assign(old, { released_at: now(), release_reason: 'transferred', updated_at: now() });
        const a: Row = { ...old, id: uuid(), moderator_id: body.p_moderator_id, admin_note: (body.p_note as string) || old.admin_note, assigned_by: s.uid, assigned_at: now(), released_at: null, release_reason: null, created_at: now(), updated_at: now() };
        this.db.lead_assignments.push(a);
        const name = this.clientName(a.message_id);
        this.log(s, 'assignment_transferred', a, a.message_id, a.moderator_id, { from_moderator: old.moderator_id, to_moderator: a.moderator_id, client: name });
        this.notify(old.moderator_id, 'assignment_transferred', `Lead transferred: ${name}`, 'This lead was reassigned to another moderator.', a.message_id, null);
        this.notify(a.moderator_id, 'assignment_new', `Lead transferred to you: ${name}`, String(a.admin_note ?? ''), a.message_id, a.id);
        return { status: 200, body: a };
      }

      case 'return_lead': {
        if (!isAdmin) return forbidden();
        const a = assignment(body.p_assignment_id);
        if (isErr(a)) return a;
        Object.assign(a, { released_at: now(), release_reason: 'returned_by_admin', updated_at: now() });
        const name = this.clientName(a.message_id);
        this.log(s, 'assignment_returned', a, a.message_id, a.moderator_id, { by: 'admin', reason: body.p_reason ?? '', client: name });
        this.notify(a.moderator_id, 'assignment_transferred', `Lead retrieved by admin: ${name}`, String(body.p_reason ?? ''), a.message_id, null);
        return { status: 200, body: null };
      }

      case 'moderator_return_lead': {
        const a = assignment(body.p_assignment_id);
        if (isErr(a)) return a;
        if (a.moderator_id !== s.uid || s.role !== 'moderator') return forbidden('You can only return your own assignments.');
        if (!String(body.p_reason ?? '').trim()) return err(400, '22023', 'Please explain why the lead is being returned.');
        Object.assign(a, { released_at: now(), release_reason: 'returned_by_moderator', updated_at: now() });
        const name = this.clientName(a.message_id);
        this.log(s, 'assignment_returned', a, a.message_id, a.moderator_id, { by: 'moderator', reason: body.p_reason, client: name });
        this.notifyAdmins('assignment_returned', `Lead returned: ${name}`, String(body.p_reason), a.message_id, null);
        return { status: 200, body: null };
      }

      case 'moderator_set_status': {
        const a = assignment(body.p_assignment_id);
        if (isErr(a)) return a;
        if (a.moderator_id !== s.uid || s.role !== 'moderator') return forbidden('You can only update your own assignments.');
        const from = String(a.status);
        const to = String(body.p_status);
        const ok = from !== to && ((ACTIVE.includes(from) && WORKING.includes(to)) || (from === 'approved' && to === 'archived'));
        if (!ok) return err(400, '22023', `Status cannot change from ${from} to ${to}.`);
        Object.assign(a, { status: to, archived_at: to === 'archived' ? now() : a.archived_at, updated_at: now() });
        const name = this.clientName(a.message_id);
        this.log(s, to === 'archived' ? 'assignment_archived' : 'status_changed', a, a.message_id, a.moderator_id, { to, client: name });
        this.notifyAdmins('assignment_status', `${name}: ${to.replace(/_/g, ' ')}`, 'Status updated by the moderator.', a.message_id, a.id);
        return { status: 200, body: a };
      }

      case 'admin_set_status': {
        if (!isAdmin) return forbidden();
        const a = assignment(body.p_assignment_id);
        if (isErr(a)) return a;
        const from = a.status;
        const to = String(body.p_status);
        if (from !== to) {
          Object.assign(a, { status: to, archived_at: to === 'archived' ? now() : a.archived_at, approved_at: to === 'approved' ? a.approved_at ?? now() : a.approved_at, updated_at: now() });
          this.log(s, to === 'archived' ? 'assignment_archived' : 'status_changed', a, a.message_id, a.moderator_id, { from, to, override: true });
          this.notify(a.moderator_id, 'admin_note', `Status changed by admin: ${to.replace(/_/g, ' ')}`, String(body.p_note ?? ''), a.message_id, a.id);
        }
        return { status: 200, body: a };
      }

      case 'submit_brief': {
        const a = assignment(body.p_assignment_id);
        if (isErr(a)) return a;
        if (a.moderator_id !== s.uid || s.role !== 'moderator') return forbidden('You can only submit briefs for your own assignments.');
        if (!ACTIVE.includes(String(a.status))) return err(400, '22023', 'This brief has already been submitted.');
        const brief = this.db.project_briefs.find((b) => b.message_id === a.message_id);
        if (!brief) return err(400, '22023', 'Save the project brief before submitting it.');
        Object.assign(brief, { submitted_at: now(), submitted_by: s.uid });
        Object.assign(a, { status: 'brief_completed', submitted_at: now(), updated_at: now() });
        const name = this.clientName(a.message_id);
        this.log(s, 'brief_submitted', a, a.message_id, a.moderator_id, { client: name });
        this.notifyAdmins('brief_submitted', `Project brief submitted: ${name}`, 'Awaiting your review.', a.message_id, a.id);
        return { status: 200, body: a };
      }

      case 'review_brief': {
        if (!isAdmin) return forbidden();
        const a = assignment(body.p_assignment_id);
        if (isErr(a)) return a;
        const name = this.clientName(a.message_id);
        const note = String(body.p_note ?? '').trim();
        const brief = this.db.project_briefs.find((b) => b.message_id === a.message_id);
        if (body.p_decision === 'start_review') {
          if (a.status !== 'brief_completed') return err(400, '22023', 'Only submitted briefs can be reviewed.');
          a.status = 'admin_review';
          this.log(s, 'review_started', a, a.message_id, a.moderator_id, { client: name });
        } else if (body.p_decision === 'approve') {
          if (!['brief_completed', 'admin_review'].includes(String(a.status))) return err(400, '22023', 'Only submitted briefs can be approved.');
          if (brief) Object.assign(brief, { approved_at: now(), approved_by: s.uid });
          Object.assign(a, { status: 'approved', approved_at: now() });
          this.log(s, 'brief_approved', a, a.message_id, a.moderator_id, { client: name });
          this.notify(a.moderator_id, 'brief_approved', `Brief approved: ${name}`, note, a.message_id, a.id);
        } else if (body.p_decision === 'request_changes') {
          if (!['brief_completed', 'admin_review'].includes(String(a.status))) return err(400, '22023', 'Only submitted briefs can be returned.');
          if (!note) return err(400, '22023', 'Describe what additional information is needed.');
          if (brief) Object.assign(brief, { submitted_at: null, submitted_by: null });
          a.status = 'changes_requested';
          this.log(s, 'changes_requested', a, a.message_id, a.moderator_id, { client: name, note });
          const n: Row = { id: uuid(), message_id: a.message_id, body: note, visibility: 'shared', kind: 'note', created_at: now(), _fromReview: true };
          this.stamp('lead_notes', s, n);
          this.db.lead_notes.push(n);
          this.after('lead_notes', 'insert', s, n);
          this.notify(a.moderator_id, 'changes_requested', `More information needed: ${name}`, note, a.message_id, a.id);
        } else return err(400, '22023', 'Unknown review decision.');
        a.updated_at = now();
        return { status: 200, body: a };
      }
    }
    return this.questionnaireRpc(fn, body, s);
  }

  // ── Client Project Questionnaire (mirrors 20261128000001; verified in tests/db/questionnaire.test.mjs) ──
  /** Raw token → questionnaire id. Rows never carry a token or hash (like the real column grants). */
  qTokens = new Map<string, string>();

  private qLinkActive(q: Row) {
    return !q.revoked_at && !!q.token_expires_at && new Date(String(q.token_expires_at)).getTime() > Date.now() && [...this.qTokens.values()].includes(String(q.id));
  }
  private qSafe(q: Row) {
    const { answers: _a, draft_answers: _d, draft_purged_at: _p, created_at: _c, ...rest } = q;
    void _a, _d, _p, _c;
    return { ...rest, link_active: this.qLinkActive(q) };
  }
  private qByToken(token: unknown): Row | null {
    const id = this.qTokens.get(String(token ?? ''));
    const q = id ? this.db.client_questionnaires.find((x) => x.id === id) : undefined;
    if (!q || q.revoked_at || new Date(String(q.token_expires_at)).getTime() <= Date.now()) return null;
    return q;
  }
  private qEligible(messageId: unknown) {
    const a = this.current(messageId);
    return a && ACTIVE.includes(String(a.status)) ? a : null;
  }

  questionnaireRpc(fn: string, body: Record<string, unknown>, s: Session): RpcResult | null {
    if (!fn.startsWith('questionnaire_')) return null;
    const mid = body.p_message_id;
    const q = this.db.client_questionnaires.find((x) => x.message_id === mid);
    const a = this.current(mid);
    const notMine = () => err(403, '42501', 'You can only manage questionnaires for active leads assigned to you.');
    const newToken = (id: string) => {
      for (const [t, v] of this.qTokens) if (v === id) this.qTokens.delete(t);
      const token = Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('base64url');
      this.qTokens.set(token, id);
      return token;
    };
    switch (fn) {
      case 'questionnaire_generate_link': {
        if (s.role !== 'moderator' || !this.editableByMod(s.uid, mid)) return notMine();
        if (q?.submitted_at) return err(400, '22023', 'This questionnaire has already been submitted.');
        let row = q;
        if (!row) {
          row = { id: uuid(), message_id: mid, status: 'not_sent', send_count: 0, created_by: s.uid, created_at: now(), updated_at: now() } as Row;
          this.db.client_questionnaires.push(row);
        }
        Object.assign(row, { token_expires_at: new Date(Date.now() + 30 * 864e5).toISOString(), link_generated_at: now(), revoked_at: null, updated_at: now() });
        const token = newToken(String(row.id));
        this.log(s, q ? 'questionnaire_link_resent' : 'questionnaire_link_created', a, mid, a?.moderator_id);
        return { status: 200, body: { ...this.qSafe(row), token, expires_at: row.token_expires_at, resent: !!q } };
      }
      case 'questionnaire_mark_sent': {
        if (s.role !== 'moderator' || !this.editableByMod(s.uid, mid)) return notMine();
        if (!q || !this.qLinkActive(q)) return err(400, '22023', 'Generate a questionnaire link first.');
        if (q.submitted_at) return err(400, '22023', 'This questionnaire has already been submitted.');
        Object.assign(q, { sent_at: now(), sent_channel: body.p_channel, send_count: Number(q.send_count) + 1, status: q.status === 'not_sent' ? 'sent' : q.status, updated_at: now() });
        const c: Row = { id: uuid(), message_id: mid, channel: body.p_channel, direction: 'outgoing', summary: 'Sent the project questionnaire link to the client.', created_at: now() };
        this.stamp('communication_logs', s, c);
        this.db.communication_logs.push(c);
        this.after('communication_logs', 'insert', s, c);
        this.log(s, 'questionnaire_sent', a, mid, a?.moderator_id, { channel: body.p_channel });
        return { status: 200, body: this.qSafe(q) };
      }
      case 'questionnaire_revoke': {
        if (s.role !== 'moderator' || !this.isCurrentModOf(s.uid, mid)) return notMine();
        if (!q) return err(400, '22023', 'There is no active questionnaire link.');
        for (const [t, v] of this.qTokens) if (v === q.id) this.qTokens.delete(t);
        Object.assign(q, { revoked_at: now(), updated_at: now() });
        this.log(s, 'questionnaire_revoked', a, mid, a?.moderator_id);
        return { status: 200, body: this.qSafe(q) };
      }
      case 'questionnaire_mark_reviewed': {
        if (s.role !== 'moderator' || !this.isCurrentModOf(s.uid, mid)) return notMine();
        if (!q || q.status !== 'submitted') return err(400, '22023', 'Only a submitted questionnaire can be marked as reviewed.');
        Object.assign(q, { status: 'reviewed', reviewed_at: now(), reviewed_by: s.uid, updated_at: now() });
        this.log(s, 'questionnaire_reviewed', a, mid, a?.moderator_id);
        return { status: 200, body: this.qSafe(q) };
      }
      case 'questionnaire_record_applied': {
        if (s.role !== 'moderator' || !this.editableByMod(s.uid, mid)) return notMine();
        if (!q?.submitted_at) return err(400, '22023', 'The questionnaire has not been submitted yet.');
        this.log(s, 'questionnaire_applied_to_brief', a, mid, a?.moderator_id);
        return { status: 200, body: null };
      }
      case 'questionnaire_open': {
        const row = this.qByToken(body.p_token);
        if (!row) return { status: 200, body: { ok: false, error: 'unavailable' } };
        const first = String(this.db.contact_messages.find((m) => m.id === row.message_id)?.full_name ?? '').split(' ')[0] || null;
        if (row.submitted_at) return { status: 200, body: { ok: true, status: 'submitted', first_name: first } };
        if (!this.qEligible(row.message_id)) return { status: 200, body: { ok: false, error: 'unavailable' } };
        row.first_opened_at ??= now();
        row.last_client_activity_at = now();
        return {
          status: 200,
          body: { ok: true, status: 'open', first_name: first, draft: row.draft_answers ?? {}, draft_saved_at: row.draft_saved_at ?? null, expires_at: row.token_expires_at },
        };
      }
      case 'questionnaire_save_draft':
      case 'questionnaire_submit': {
        const final = fn === 'questionnaire_submit';
        if (final && (body.p_website || Number(body.p_elapsed_ms ?? 0) < 1500)) return { status: 200, body: { ok: true, status: 'submitted' } };
        const row = this.qByToken(body.p_token);
        if (!row) return { status: 200, body: { ok: false, error: 'unavailable' } };
        if (row.submitted_at) return { status: 200, body: final ? { ok: true, status: 'submitted' } : { ok: false, error: 'submitted' } };
        const ea = this.qEligible(row.message_id);
        if (!ea) return { status: 200, body: { ok: false, error: 'unavailable' } };
        const answers = toPayload((body.p_answers ?? {}) as QuestionnaireAnswers);
        const problems = validateAnswers(answers, final);
        const field = Object.keys(problems)[0];
        if (field) return { status: 200, body: { ok: false, error: 'invalid', field, message: problems[field as keyof typeof problems] } };
        const client: Session = { role: 'anon', uid: null };
        const qname = String(this.db.contact_messages.find((m) => m.id === row.message_id)?.full_name ?? '');
        if (!final) {
          const first = ['not_sent', 'sent'].includes(String(row.status));
          Object.assign(row, { draft_answers: answers, draft_saved_at: now(), last_client_activity_at: now(), status: first ? 'in_progress' : row.status, updated_at: now() });
          row.first_opened_at ??= now();
          if (first) this.log(client, 'questionnaire_started', ea, row.message_id, ea.moderator_id, { by: 'client' });
          return { status: 200, body: { ok: true, saved_at: row.draft_saved_at } };
        }
        Object.assign(row, { answers, submitted_at: now(), status: 'submitted', draft_answers: null, draft_saved_at: null, last_client_activity_at: now(), updated_at: now() });
        this.log(client, 'questionnaire_submitted', ea, row.message_id, ea.moderator_id, { by: 'client', client: qname });
        this.notify(ea.moderator_id, 'questionnaire_submitted', `Questionnaire submitted: ${qname}`, 'The client submitted the project questionnaire.', row.message_id, ea.id);
        return { status: 200, body: { ok: true, status: 'submitted' } };
      }
    }
    return null;
  }
}
