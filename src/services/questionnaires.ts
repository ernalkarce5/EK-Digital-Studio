import { db, publicDb } from '@/lib/supabase';
import { unwrap } from '@/lib/errors';
import type { QuestionnaireAnswers, QuestionnaireStatus } from '@/lib/questionnaire';

/**
 * Client Project Questionnaire data access.
 *  - Moderators: one row read through RLS (explicit columns: token_hash is not granted, so
 *    `select *` is refused) and the approved SECURITY DEFINER functions for every change.
 *  - Clients: ONLY the three token functions, through the session-less public client.
 *    The anonymous client never touches questionnaire tables directly.
 */

export interface ClientQuestionnaire {
  id: string;
  message_id: string;
  status: QuestionnaireStatus;
  token_expires_at: string | null;
  link_generated_at: string | null;
  revoked_at: string | null;
  sent_at: string | null;
  sent_channel: 'email' | 'instagram' | null;
  send_count: number;
  first_opened_at: string | null;
  last_client_activity_at: string | null;
  draft_saved_at: string | null;
  draft_purged_at: string | null;
  answers: QuestionnaireAnswers | null;
  submitted_at: string | null;
  reviewed_at: string | null;
  reviewed_by: string | null;
  created_at: string;
  updated_at: string;
}

/** Safe summary returned by the moderator functions (never token_hash, answers or drafts). */
export type QuestionnaireSummary = Omit<ClientQuestionnaire, 'answers' | 'draft_purged_at' | 'created_at'> & { link_active: boolean };
export type GeneratedLink = QuestionnaireSummary & { token: string; expires_at: string; resent: boolean };

const COLUMNS =
  'id, message_id, status, token_expires_at, link_generated_at, revoked_at, sent_at, sent_channel, send_count, first_opened_at, ' +
  'last_client_activity_at, draft_saved_at, draft_purged_at, answers, submitted_at, reviewed_at, reviewed_by, created_at, updated_at';

export async function getQuestionnaire(messageId: string): Promise<ClientQuestionnaire | null> {
  return unwrap(await db().from('client_questionnaires').select(COLUMNS).eq('message_id', messageId).maybeSingle()) as ClientQuestionnaire | null;
}

/** Link is usable by the client right now (not revoked, not expired). */
export const linkActive = (q: Pick<ClientQuestionnaire, 'revoked_at' | 'token_expires_at'> | null): boolean =>
  !!q && !q.revoked_at && !!q.token_expires_at && new Date(q.token_expires_at).getTime() > Date.now();

const rpc = async <T>(fn: string, args: Record<string, unknown>): Promise<T> => unwrap(await db().rpc(fn, args)) as T;

export const generateQuestionnaireLink = (messageId: string) => rpc<GeneratedLink>('questionnaire_generate_link', { p_message_id: messageId });
export const markQuestionnaireSent = (messageId: string, channel: 'email' | 'instagram') =>
  rpc<QuestionnaireSummary>('questionnaire_mark_sent', { p_message_id: messageId, p_channel: channel });
export const revokeQuestionnaire = (messageId: string) => rpc<QuestionnaireSummary>('questionnaire_revoke', { p_message_id: messageId });
export const markQuestionnaireReviewed = (messageId: string) => rpc<QuestionnaireSummary>('questionnaire_mark_reviewed', { p_message_id: messageId });
export const recordQuestionnaireApplied = (messageId: string) => rpc<null>('questionnaire_record_applied', { p_message_id: messageId });

// ── Client (no account; token only in request bodies) ───────────────

export type ClientOpenResult =
  | { ok: true; status: 'open'; first_name: string | null; draft: QuestionnaireAnswers; draft_saved_at: string | null; expires_at: string }
  | { ok: true; status: 'submitted'; first_name: string | null }
  | { ok: false; error: 'unavailable' | 'rate_limited' };
export type ClientSaveResult =
  | { ok: true; saved_at?: string; status?: 'submitted' }
  | { ok: false; error: 'unavailable' | 'rate_limited' | 'submitted' | 'invalid'; field?: string; message?: string };

const clientRpc = async <T>(fn: string, args: Record<string, unknown>): Promise<T> => {
  const { data, error } = await publicDb().rpc(fn, args);
  if (error) throw error;
  return data as T;
};

export const openQuestionnaire = (token: string) => clientRpc<ClientOpenResult>('questionnaire_open', { p_token: token });
export const saveQuestionnaireDraft = (token: string, answers: QuestionnaireAnswers) =>
  clientRpc<ClientSaveResult>('questionnaire_save_draft', { p_token: token, p_answers: answers });
export const submitQuestionnaire = (token: string, answers: QuestionnaireAnswers, elapsedMs: number, honeypot: string) =>
  clientRpc<ClientSaveResult>('questionnaire_submit', { p_token: token, p_answers: answers, p_elapsed_ms: Math.round(elapsedMs), p_website: honeypot || null });
