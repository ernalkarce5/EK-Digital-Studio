import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  ClipboardCheck,
  Copy,
  Eye,
  Mail,
  MessageCircleQuestion,
  Phone,
  RotateCcw,
  Send,
  Shuffle,
  SlidersHorizontal,
  Undo2,
  UserPlus,
} from 'lucide-react';
import { Panel } from '@/components/admin/AdminUI';
import { Button } from '@/components/common/Button';
import { Modal } from '@/components/common/Modal';
import { EmptyState, ErrorState, LoadingBlock } from '@/components/common/Feedback';
import { FormField, Select, Textarea } from '@/components/forms/Field';
import { WhatsappIcon } from '@/components/common/BrandIcons';
import { useToast } from '@/contexts/ToastContext';
import { useAsync } from '@/hooks/useAsync';
import {
  adminSetStatus,
  assignLead,
  getLeadWorkspace,
  listAssignmentHistory,
  moderatorReturnLead,
  moderatorSetStatus,
  notifyLeadsChanged,
  returnLead,
  reviewBrief,
  submitBrief,
  transferLead,
  type LeadWorkspace as Workspace,
} from '@/services/leads';
import { listModerators } from '@/services/moderators';
import { isEditableByModerator, LEAD_STATUS, LEAD_STATUS_ORDER, moderatorNextStatuses } from '@/lib/leads';
import { formatPhone, telLink, whatsappLink } from '@/lib/phone';
import { toErrorMessage } from '@/lib/errors';
import { cn, formatDate } from '@/lib/utils';
import type { LeadStatus } from '@/types/database';
import { LeadStatusBadge } from './LeadStatusBadge';
import { ClientInfoForm } from './ClientInfoForm';
import { BriefForm, BriefView, type BriefPrefillRequest } from './BriefForm';
import { QuestionnairePanel } from './QuestionnairePanel';
import { recordQuestionnaireApplied } from '@/services/questionnaires';
import { BRIEF_FIELD_LABELS, type BriefPrefill } from '@/lib/questionnaire';
import { CommunicationPanel } from './CommunicationPanel';
import { NotesPanel } from './NotesPanel';
import { ActivityList } from './ActivityList';
import { ModeratorPickerDialog, ReasonDialog } from './LeadDialogs';

const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'client', label: 'Client' },
  { id: 'brief', label: 'Project brief' },
  { id: 'questionnaire', label: 'Questionnaire', moderatorOnly: true },
  { id: 'communication', label: 'Communication' },
  { id: 'notes', label: 'Notes' },
  { id: 'history', label: 'History' },
] as const;
type TabId = (typeof TABS)[number]['id'];
const tabsFor = (role: 'admin' | 'moderator') => TABS.filter((t) => role === 'moderator' || !('moderatorOnly' in t));

type Dialog = null | 'submit' | 'return' | 'transfer' | 'retrieve' | 'assign' | 'approve' | 'changes' | 'override';

/** Full client workspace for one lead, for either role. Security is enforced server-side. */
export function LeadWorkspace({ messageId, role, backTo, backLabel }: { messageId: string; role: 'admin' | 'moderator'; backTo: string; backLabel: string }) {
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  // The Questionnaire tab exists only for moderators (admins keep the existing brief review workflow).
  const tab = (tabsFor(role).some((t) => t.id === params.get('tab')) ? params.get('tab') : 'overview') as TabId;
  const ws = useAsync(() => getLeadWorkspace(messageId), [messageId]);
  const extras = useAsync(
    () => (role === 'admin' ? Promise.all([listAssignmentHistory(messageId), listModerators()]) : Promise.resolve(null)),
    [messageId, role],
  );
  const [dialog, setDialog] = useState<Dialog>(null);
  const [busy, setBusy] = useState(false);
  const [nextStatus, setNextStatus] = useState<LeadStatus | ''>('');
  const [override, setOverride] = useState<{ status: LeadStatus | ''; note: string }>({ status: '', note: '' });
  const [briefPrefill, setBriefPrefill] = useState<BriefPrefillRequest | null>(null);
  const [prefillConflict, setPrefillConflict] = useState<{ values: BriefPrefill; fields: Array<keyof BriefPrefill> } | null>(null);

  const names = useMemo(() => {
    const map = new Map<string, string>();
    for (const m of extras.data?.[1] ?? []) map.set(m.id, m.full_name);
    const a = ws.data?.assignment;
    if (a?.moderator) map.set(a.moderator.id, a.moderator.full_name);
    return map;
  }, [extras.data, ws.data]);

  // Spinner only on the first load: refreshes keep the page (and in-memory state such as a
  // just-generated questionnaire link) mounted.
  if (ws.loading && !ws.data) return <LoadingBlock />;
  if (ws.error) return <ErrorState message={ws.error} onRetry={ws.reload} />;
  if (!ws.data) {
    return (
      <EmptyState
        icon={AlertTriangle}
        title="Lead not available"
        description={role === 'moderator' ? 'This lead is not assigned to you (it may have been transferred or retrieved).' : 'This inquiry does not exist.'}
        action={<Button to={backTo} variant="secondary" size="sm">{backLabel}</Button>}
      />
    );
  }

  const data = ws.data;
  const { message, assignment } = data;
  const status = assignment?.status;
  const update = (patch: Partial<Workspace>) => ws.setData((d) => (d ? { ...d, ...patch } : d));
  const isModerator = role === 'moderator';
  const editable = isModerator && !!status && isEditableByModerator(status);
  const canLog = !!assignment && (role === 'admin' || status !== 'archived');
  const lastAdminNote = [...data.notes].reverse().find((n) => n.author_role === 'admin' && n.visibility === 'shared');

  async function run(action: () => Promise<unknown>, success: string, after?: () => void) {
    setBusy(true);
    try {
      await action();
      toast.success(success);
      setDialog(null);
      notifyLeadsChanged();
      after?.();
      ws.reload();
      extras.reload();
    } catch (err) {
      toast.error(toErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  /** Questionnaire → existing Project Brief: never overwrites the moderator's text without asking. */
  const requestBriefPrefill = (values: BriefPrefill) => {
    const saved = (data.brief ?? {}) as unknown as Record<string, unknown>;
    const fields = (Object.keys(values) as Array<keyof BriefPrefill>).filter((k) => {
      const existing = saved[k] == null ? '' : String(saved[k]).trim();
      return existing !== '' && existing !== String(values[k]).trim();
    });
    if (fields.length) setPrefillConflict({ values, fields });
    else void applyBriefPrefill(values, 'all');
  };
  const applyBriefPrefill = async (values: BriefPrefill, mode: 'empty' | 'all') => {
    setBusy(true);
    try {
      await recordQuestionnaireApplied(messageId); // audit entry; does NOT mark the questionnaire reviewed
      setPrefillConflict(null);
      setBriefPrefill({ values, mode, nonce: Date.now() });
      setParams({ tab: 'brief' }, { replace: true });
      ws.reload();
    } catch (err) {
      toast.error(toErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const copyEmail = () =>
    navigator.clipboard
      .writeText(message.email)
      .then(() => toast.success('Email address copied.'))
      .catch(() => toast.error('Could not copy. Select the address and copy it manually.'));
  const mailto = `mailto:${message.email}?subject=${encodeURIComponent(`Your ${message.project_type.toLowerCase()} inquiry`)}`;
  const wa = message.phone ? whatsappLink(message.phone) : null;

  return (
    <div>
      <Link to={backTo} className="mb-4 inline-flex items-center gap-2 text-sm text-muted hover:text-fg">
        <ArrowLeft className="size-4" aria-hidden /> {backLabel}
      </Link>

      {/* Header */}
      <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-medium tracking-tight md:text-3xl">{message.full_name}</h1>
            {status ? <LeadStatusBadge status={status} /> : <span className="text-sm text-muted">Unassigned</span>}
          </div>
          <p className="mt-1.5 text-sm text-muted">
            {message.project_type} · received {formatDate(message.created_at)}
            {role === 'admin' && assignment?.moderator && (
              <>
                {' '}
                · assigned to <span className="text-fg">{assignment.moderator.full_name}</span>
              </>
            )}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {isModerator && assignment && (
            <>
              {isEditableByModerator(assignment.status) && (
                <Button size="sm" icon={Send} onClick={() => setDialog('submit')} disabled={!data.brief}>
                  Submit to Admin
                </Button>
              )}
              {!['approved', 'archived'].includes(assignment.status) && (
                <Button size="sm" variant="ghost" icon={Undo2} onClick={() => setDialog('return')}>
                  Return lead
                </Button>
              )}
            </>
          )}
          {role === 'admin' && assignment && (
            <>
              {assignment.status === 'brief_completed' && (
                <Button size="sm" variant="secondary" icon={Eye} onClick={() => void run(() => reviewBrief(assignment.id, 'start_review'), 'Review started.')} loading={busy}>
                  Start review
                </Button>
              )}
              {['brief_completed', 'admin_review'].includes(assignment.status) && (
                <>
                  <Button size="sm" icon={CheckCircle2} onClick={() => setDialog('approve')}>
                    Approve brief
                  </Button>
                  <Button size="sm" variant="secondary" icon={MessageCircleQuestion} onClick={() => setDialog('changes')}>
                    Request changes
                  </Button>
                </>
              )}
              <Button size="sm" variant="ghost" icon={Shuffle} onClick={() => setDialog('transfer')}>
                Transfer
              </Button>
              <Button size="sm" variant="ghost" icon={RotateCcw} onClick={() => setDialog('retrieve')}>
                Retrieve
              </Button>
              <Button size="sm" variant="ghost" icon={SlidersHorizontal} onClick={() => { setOverride({ status: assignment.status, note: '' }); setDialog('override'); }}>
                Override status
              </Button>
            </>
          )}
          {role === 'admin' && !assignment && (
            <Button size="sm" icon={UserPlus} onClick={() => setDialog('assign')}>
              Assign to moderator
            </Button>
          )}
        </div>
      </div>

      {isModerator && assignment && isEditableByModerator(assignment.status) && !data.brief && (
        <p className="mb-4 text-[13px] text-subtle">Save a project brief before submitting it to the admin.</p>
      )}
      {isModerator && status === 'changes_requested' && lastAdminNote && (
        <div className="mb-6 flex gap-3 rounded-xl border border-danger/30 bg-danger/[0.05] p-4 text-sm" role="status">
          <MessageCircleQuestion className="mt-0.5 size-4 shrink-0 text-danger" aria-hidden />
          <div>
            <p className="font-medium">The admin requested more information</p>
            <p className="mt-1 whitespace-pre-wrap text-muted">{lastAdminNote.body}</p>
          </div>
        </div>
      )}
      {role === 'admin' && status && ['brief_completed', 'admin_review'].includes(status) && (
        <div className="mb-6 flex gap-3 rounded-xl border border-success/30 bg-success/[0.05] p-4 text-sm" role="status">
          <ClipboardCheck className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />
          <p>
            The project brief was submitted {assignment?.submitted_at ? formatDate(assignment.submitted_at, { dateStyle: 'medium', timeStyle: 'short' }) : ''} and is awaiting your review. See the{' '}
            <button type="button" className="text-accent-2 underline" onClick={() => setParams({ tab: 'brief' }, { replace: true })}>
              Project brief
            </button>{' '}
            tab.
          </p>
        </div>
      )}

      {/* Tabs */}
      <div className="sticky top-14 z-20 -mx-4 mb-6 border-b border-line bg-bg/90 px-4 backdrop-blur md:-mx-8 md:px-8 lg:top-0" role="tablist" aria-label="Lead sections">
        <div className="scrollbar-none flex gap-1 overflow-x-auto py-2">
          {tabsFor(role).map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => setParams(t.id === 'overview' ? {} : { tab: t.id }, { replace: true })}
              className={cn('shrink-0 rounded-md px-3 py-1.5 text-sm transition-colors', tab === t.id ? 'bg-card text-fg' : 'text-muted hover:text-fg')}
            >
              {t.label}
              {t.id === 'communication' && data.communications.length > 0 && <span className="ml-1.5 font-mono text-[11px] text-subtle">{data.communications.length}</span>}
              {t.id === 'notes' && data.notes.length > 0 && <span className="ml-1.5 font-mono text-[11px] text-subtle">{data.notes.length}</span>}
            </button>
          ))}
        </div>
      </div>

      {tab === 'overview' && (
        <div className="grid gap-6 lg:grid-cols-5">
          <Panel title="Original inquiry" description="Submitted through the website contact form. Never modified." className="lg:col-span-3">
            <dl className="grid gap-4 sm:grid-cols-2">
              {[
                ['Full name', message.full_name],
                ['Email', message.email],
                ['Phone', message.phone ? formatPhone(message.phone) : null],
                ['Company', message.company],
                ['Project type', message.project_type],
                ['Budget', message.budget],
                ['Preferred contact', message.preferred_contact],
                ['Received', formatDate(message.created_at, { dateStyle: 'medium', timeStyle: 'short' })],
                ['Source', 'Website contact form'],
              ].map(([k, v]) => (
                <div key={k} className="min-w-0">
                  <dt className="text-xs text-subtle">{k}</dt>
                  <dd className="mt-0.5 break-words text-[15px]">{v || '—'}</dd>
                </div>
              ))}
            </dl>
            <div className="mt-5 border-t border-line pt-5">
              <p className="text-xs text-subtle">Message</p>
              <p className="mt-1.5 whitespace-pre-wrap break-words text-[15px] leading-relaxed">{message.message}</p>
            </div>
          </Panel>
          <div className="space-y-6 lg:col-span-2">
            <Panel title="Contact the client" description="Nothing is sent automatically. Record what you send in Communication.">
              <div className="grid gap-2">
                <Button variant="secondary" size="sm" icon={Copy} onClick={copyEmail}>
                  Copy email address
                </Button>
                <Button href={mailto} variant="secondary" size="sm" icon={Mail}>
                  Open email draft
                </Button>
                {message.phone && (
                  <Button href={telLink(message.phone)} variant="secondary" size="sm" icon={Phone}>
                    Call {formatPhone(message.phone)}
                  </Button>
                )}
                {wa && (
                  <Button href={wa} target="_blank" rel="noopener noreferrer" variant="secondary" size="sm">
                    <WhatsappIcon /> WhatsApp
                  </Button>
                )}
              </div>
            </Panel>
            {assignment?.admin_note && (
              <Panel title="Note from admin">
                <p className="whitespace-pre-wrap text-[15px] leading-relaxed">{assignment.admin_note}</p>
              </Panel>
            )}
            {isModerator && assignment && moderatorNextStatuses(assignment.status).length > 0 && (
              <Panel title="Update status">
                <div className="flex gap-2">
                  <label htmlFor="next-status" className="sr-only">
                    New status
                  </label>
                  <div className="min-w-0 flex-1">
                    <Select id="next-status" value={nextStatus} onChange={(e) => setNextStatus(e.target.value as LeadStatus)} className="h-10">
                      <option value="" disabled>
                        Choose a status
                      </option>
                      {moderatorNextStatuses(assignment.status).map((s) => (
                        <option key={s} value={s}>
                          {LEAD_STATUS[s].label}
                        </option>
                      ))}
                    </Select>
                  </div>
                  <Button
                    size="md"
                    className="h-10"
                    disabled={!nextStatus}
                    loading={busy}
                    onClick={() => nextStatus && void run(() => moderatorSetStatus(assignment.id, nextStatus), `Status updated to ${LEAD_STATUS[nextStatus].label}.`, () => setNextStatus(''))}
                  >
                    Update
                  </Button>
                </div>
                <p className="mt-2 text-[13px] text-subtle">{LEAD_STATUS[assignment.status].hint}</p>
              </Panel>
            )}
          </div>
        </div>
      )}

      {tab === 'client' && (
        <ClientInfoForm
          messageId={messageId}
          client={data.client}
          originalCompany={message.company}
          editable={editable}
          onSaved={(client) => update({ client })}
        />
      )}

      {tab === 'brief' &&
        (editable ? (
          <BriefForm
            messageId={messageId}
            brief={data.brief}
            editable
            onSaved={(brief) => update({ brief })}
            prefill={briefPrefill}
            onPrefillApplied={() => setBriefPrefill(null)}
          />
        ) : (
          <BriefView brief={data.brief} />
        ))}

      {tab === 'communication' && (
        <CommunicationPanel
          messageId={messageId}
          records={data.communications}
          canAdd={canLog}
          authorRole={role}
          onAdded={(r) => update({ communications: [...data.communications, r] })}
        />
      )}

      {tab === 'notes' && (
        <NotesPanel messageId={messageId} notes={data.notes} role={role} canAdd={!!assignment || role === 'admin'} onAdded={(n) => update({ notes: [...data.notes, n] })} />
      )}

      {tab === 'history' && (
        <div className="grid gap-6 lg:grid-cols-2">
          {role === 'admin' && (
            <Panel title="Assignment history" bodyClassName="p-0">
              {!extras.data?.[0]?.length ? (
                <p className="px-5 py-8 text-center text-sm text-muted">Never assigned.</p>
              ) : (
                <ul className="divide-y divide-line">
                  {extras.data[0].map((h) => (
                    <li key={h.id} className="px-5 py-3 text-sm">
                      <p className="font-medium">{h.moderator?.full_name ?? 'Moderator'}</p>
                      <p className="text-muted">
                        {formatDate(h.assigned_at, { dateStyle: 'medium', timeStyle: 'short' })}
                        {h.released_at
                          ? ` → ${formatDate(h.released_at, { dateStyle: 'medium', timeStyle: 'short' })} (${(h.release_reason ?? '').replace(/_/g, ' ')})`
                          : ' → current'}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          )}
          <Panel title="Activity" bodyClassName="p-0" className={role === 'admin' ? undefined : 'lg:col-span-2'}>
            <ActivityList items={data.activity} names={names} compact={isModerator} />
          </Panel>
        </div>
      )}

      {tab === 'questionnaire' && isModerator && (
        <QuestionnairePanel
          messageId={messageId}
          clientName={message.full_name}
          clientEmail={message.email}
          editable={editable}
          onApplyToBrief={requestBriefPrefill}
          onChanged={ws.reload}
        />
      )}

      {/* Dialogs */}
      <Modal
        open={!!prefillConflict}
        onClose={busy ? () => {} : () => setPrefillConflict(null)}
        dismissible={!busy}
        title="Some brief fields already have your text"
        description="Choose how to use the questionnaire answers. Nothing is saved until you save the brief."
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setPrefillConflict(null)} disabled={busy}>
              Cancel
            </Button>
            <Button variant="secondary" loading={busy} onClick={() => prefillConflict && void applyBriefPrefill(prefillConflict.values, 'all')}>
              Replace these fields
            </Button>
            <Button loading={busy} onClick={() => prefillConflict && void applyBriefPrefill(prefillConflict.values, 'empty')}>
              Fill empty fields only
            </Button>
          </>
        }
      >
        <p className="text-sm text-muted">These fields already contain different text:</p>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
          {prefillConflict?.fields.map((k) => <li key={k}>{BRIEF_FIELD_LABELS[k]}</li>)}
        </ul>
      </Modal>
      <Modal
        open={dialog === 'submit'}
        onClose={busy ? () => {} : () => setDialog(null)}
        dismissible={!busy}
        title="Submit brief to admin?"
        description="The brief is locked while the admin reviews it. If more information is needed, it will come back to you."
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setDialog(null)} disabled={busy}>
              Cancel
            </Button>
            <Button icon={Send} loading={busy} onClick={() => assignment && void run(() => submitBrief(assignment.id), 'Brief submitted. The admin has been notified.')}>
              Submit to Admin
            </Button>
          </>
        }
      />
      <Modal
        open={dialog === 'approve'}
        onClose={busy ? () => {} : () => setDialog(null)}
        dismissible={!busy}
        title="Approve this project brief?"
        description="The moderator is notified and the lead moves to Approved."
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setDialog(null)} disabled={busy}>
              Cancel
            </Button>
            <Button icon={CheckCircle2} loading={busy} onClick={() => assignment && void run(() => reviewBrief(assignment.id, 'approve'), 'Brief approved.')}>
              Approve
            </Button>
          </>
        }
      />
      <ReasonDialog
        open={dialog === 'changes'}
        title="Request more information"
        description="The lead returns to the moderator with your note."
        label="What is missing?"
        confirmLabel="Send request"
        required
        busy={busy}
        onClose={() => setDialog(null)}
        onConfirm={(note) => assignment && void run(() => reviewBrief(assignment.id, 'request_changes', note), 'Sent back to the moderator.')}
      />
      <ReasonDialog
        open={dialog === 'return'}
        title="Return this lead to the admin?"
        description="You will lose access to it. Your notes, brief and communication history are kept."
        label="Reason"
        confirmLabel="Return lead"
        required
        danger
        busy={busy}
        onClose={() => setDialog(null)}
        onConfirm={(reason) => assignment && void run(() => moderatorReturnLead(assignment.id, reason), 'Lead returned to the admin.')}
      />
      <ReasonDialog
        open={dialog === 'retrieve'}
        title="Retrieve this lead?"
        description="It returns to the unassigned inbox and the moderator loses access. All history is kept."
        label="Reason (shared with the moderator)"
        confirmLabel="Retrieve lead"
        danger
        busy={busy}
        onClose={() => setDialog(null)}
        onConfirm={(reason) => assignment && void run(() => returnLead(assignment.id, reason), 'Lead returned to the unassigned inbox.')}
      />
      <ModeratorPickerDialog
        open={dialog === 'transfer'}
        title="Transfer lead"
        description="Client data, brief and history move with the lead. The current moderator loses access."
        confirmLabel="Transfer"
        excludeId={assignment?.moderator_id}
        busy={busy}
        onClose={() => setDialog(null)}
        onConfirm={(id, note) => assignment && void run(() => transferLead(assignment.id, id, note), 'Lead transferred.')}
      />
      <ModeratorPickerDialog
        open={dialog === 'assign'}
        title="Assign to moderator"
        confirmLabel="Assign"
        busy={busy}
        onClose={() => setDialog(null)}
        onConfirm={(id, note) => void run(() => assignLead(messageId, id, note), 'Lead assigned.')}
      />
      <Modal
        open={dialog === 'override'}
        onClose={busy ? () => {} : () => setDialog(null)}
        dismissible={!busy}
        title="Override status"
        description="Admins can set any status. The change is logged and the moderator is notified."
        footer={
          <>
            <Button variant="secondary" onClick={() => setDialog(null)} disabled={busy}>
              Cancel
            </Button>
            <Button
              loading={busy}
              disabled={!override.status || override.status === assignment?.status}
              onClick={() => assignment && override.status && void run(() => adminSetStatus(assignment.id, override.status as LeadStatus, override.note), 'Status updated.')}
            >
              Set status
            </Button>
          </>
        }
      >
        <div className="grid gap-5">
          <FormField label="Status" htmlFor="override-status">
            <Select id="override-status" value={override.status} onChange={(e) => setOverride((o) => ({ ...o, status: e.target.value as LeadStatus }))}>
              {LEAD_STATUS_ORDER.map((s) => (
                <option key={s} value={s}>
                  {LEAD_STATUS[s].label}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField label="Note for the moderator" htmlFor="override-note" optional>
            <Textarea id="override-note" rows={3} maxLength={2000} value={override.note} onChange={(e) => setOverride((o) => ({ ...o, note: e.target.value }))} />
          </FormField>
        </div>
      </Modal>
    </div>
  );
}
