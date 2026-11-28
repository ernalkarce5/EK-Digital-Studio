import { useState } from 'react';
import { CheckCircle2, ClipboardList, Copy, FileInput, KeyRound, Link2, Mail, RefreshCw, Send, ShieldOff } from 'lucide-react';
import { Panel } from '@/components/admin/AdminUI';
import { Badge } from '@/components/common/Badge';
import { Button } from '@/components/common/Button';
import { ConfirmDialog } from '@/components/common/Modal';
import { ErrorState, LoadingBlock } from '@/components/common/Feedback';
import { FormField, Textarea } from '@/components/forms/Field';
import { QuestionnaireAnswersView } from '@/components/questionnaire/QuestionnaireAnswersView';
import { useSite } from '@/contexts/SiteContext';
import { useToast } from '@/contexts/ToastContext';
import { useAsync } from '@/hooks/useAsync';
import {
  generateQuestionnaireLink,
  getQuestionnaire,
  linkActive,
  markQuestionnaireReviewed,
  markQuestionnaireSent,
  revokeQuestionnaire,
} from '@/services/questionnaires';
import { notifyLeadsChanged } from '@/services/leads';
import { answersToBrief, preparedMessage, QUESTIONNAIRE_STATUS, questionnaireUrl, type BriefPrefill } from '@/lib/questionnaire';
import { toErrorMessage } from '@/lib/errors';
import { cn, formatDate } from '@/lib/utils';

type Channel = 'email' | 'instagram';
const when = (v: string | null | undefined) => (v ? formatDate(v, { dateStyle: 'medium', timeStyle: 'short' }) : null);

/**
 * Moderator-only questionnaire management for one lead. Every change goes through the approved
 * database functions; the raw link exists only in this browser tab, right after it is generated.
 */
export function QuestionnairePanel({
  messageId,
  clientName,
  clientEmail,
  editable,
  onApplyToBrief,
  onChanged,
}: {
  messageId: string;
  clientName: string;
  clientEmail: string;
  /** The lead is in an editable status (link generation, sending and brief changes allowed). */
  editable: boolean;
  onApplyToBrief: (prefill: BriefPrefill) => void;
  /** Lead data changed (communication log / activity). */
  onChanged: () => void;
}) {
  const toast = useToast();
  const { settings } = useSite();
  const q = useAsync(() => getQuestionnaire(messageId), [messageId]);
  const [fresh, setFresh] = useState<{ url: string; expiresAt: string } | null>(null);
  const [channel, setChannel] = useState<Channel>('email');
  const [busy, setBusy] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<null | 'replace' | 'revoke'>(null);

  const firstName = clientName.split(/\s+/)[0] ?? '';
  const row = q.data ?? null;
  const active = linkActive(row);
  const submitted = !!row?.submitted_at;
  const message = fresh ? preparedMessage(firstName, fresh.url, fresh.expiresAt, settings.studio_name) : '';

  async function act<T>(key: string, fn: () => Promise<T>, success: string, after?: (r: T) => void) {
    setBusy(key);
    try {
      const r = await fn();
      after?.(r);
      toast.success(success);
      setConfirm(null);
      notifyLeadsChanged();
      q.reload();
      onChanged();
    } catch (err) {
      toast.error(toErrorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  const generate = () =>
    act('generate', () => generateQuestionnaireLink(messageId), row ? 'New link created. The previous link no longer works.' : 'Questionnaire link created.', (r) =>
      setFresh({ url: questionnaireUrl(r.token), expiresAt: r.expires_at }),
    );
  const copy = (text: string, what: string) =>
    navigator.clipboard
      .writeText(text)
      .then(() => toast.success(`${what} copied.`))
      .catch(() => toast.error('Could not copy. Select the text and copy it manually.'));

  if (q.loading && !q.data) return <LoadingBlock />;
  if (q.error) return <ErrorState message={q.error} onRetry={q.reload} />;

  const status = row ? QUESTIONNAIRE_STATUS[row.status] : null;
  const timeline: Array<[string, string | null]> = row
    ? [
        ['Link created', when(row.link_generated_at)],
        ['Link expires', row.revoked_at || row.submitted_at ? null : when(row.token_expires_at)],
        ['Link disabled', when(row.revoked_at)],
        ['Sent', row.sent_at ? `${when(row.sent_at)} via ${row.sent_channel === 'instagram' ? 'Instagram' : 'email'}${row.send_count > 1 ? ` (${row.send_count} times)` : ''}` : null],
        ['First opened (approximate)', when(row.first_opened_at)],
        ['Last client activity', when(row.last_client_activity_at)],
        ['Draft saved', when(row.draft_saved_at)],
        ['Unsubmitted draft deleted', when(row.draft_purged_at)],
        ['Submitted', when(row.submitted_at)],
        ['Reviewed', when(row.reviewed_at)],
      ]
    : [];

  return (
    <div className="grid gap-6 lg:grid-cols-5">
      <div className="space-y-6 lg:col-span-3">
        <Panel
          title="Client project questionnaire"
          description="A secure, personal link where the client describes the project. No account needed."
          actions={status ? <Badge tone={status.tone}>{status.label}</Badge> : <Badge>Not created</Badge>}
        >
          {!row ? (
            <div className="flex flex-col items-start gap-4">
              <p className="text-sm text-muted">
                Create a personal link for {firstName || 'the client'}. It works for 30 days, saves their answers as they go and notifies you when
                they submit.
              </p>
              {editable ? (
                <Button icon={Link2} loading={busy === 'generate'} onClick={() => void generate()}>
                  Generate questionnaire link
                </Button>
              ) : (
                <p className="text-sm text-subtle">Questionnaires can be created while the lead is active (not in review, approved or archived).</p>
              )}
            </div>
          ) : (
            <div className="space-y-5">
              <p className="text-sm text-muted">{status?.hint}</p>

              {fresh && !submitted && (
                <div className="rounded-lg border border-accent/35 bg-accent-soft p-4">
                  <p className="flex items-center gap-2 text-sm font-medium">
                    <KeyRound className="size-4 text-accent" aria-hidden /> Questionnaire link
                  </p>
                  <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                    <label htmlFor="q-link" className="sr-only">
                      Questionnaire link
                    </label>
                    <input
                      id="q-link"
                      readOnly
                      value={fresh.url}
                      onFocus={(e) => e.currentTarget.select()}
                      className="h-10 min-w-0 flex-1 rounded-lg border border-line-strong bg-bg-2 px-3 font-mono text-[13px] text-fg"
                    />
                    <Button icon={Copy} onClick={() => copy(fresh.url, 'Link')} className="h-10 shrink-0">
                      Copy link
                    </Button>
                  </div>
                  <p className="mt-2 text-[13px] text-muted">
                    Works until {formatDate(fresh.expiresAt, { dateStyle: 'long' })}. For security it is shown only now — copy it before leaving this page.
                  </p>
                </div>
              )}

              {!fresh && !submitted && (
                <p className={cn('flex items-start gap-2 rounded-lg border p-3 text-sm', active ? 'border-line' : 'border-warning/35 bg-warning/10')}>
                  <Link2 className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden />
                  <span>
                    {active
                      ? `A link is active until ${formatDate(row.token_expires_at, { dateStyle: 'long' })}. For security it can't be shown again; generate a replacement if you need to send it again.`
                      : row.revoked_at
                        ? 'The link was disabled. Generate a new link to continue.'
                        : 'The link has expired. Generate a new link to continue.'}
                  </span>
                </p>
              )}

              {!submitted && editable && (
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="secondary" icon={RefreshCw} onClick={() => setConfirm('replace')}>
                    {active ? 'Generate replacement link' : 'Generate new link'}
                  </Button>
                  {active && (
                    <Button size="sm" variant="ghost" icon={ShieldOff} onClick={() => setConfirm('revoke')}>
                      Disable link
                    </Button>
                  )}
                </div>
              )}
              {!editable && !submitted && (
                <p className="text-[13px] text-subtle">The lead is no longer active, so the client cannot use the link and it can't be changed.</p>
              )}
            </div>
          )}
        </Panel>

        {row && !submitted && editable && (
          <Panel title="Send to the client" description="Nothing is sent automatically. Send it yourself, then record it here.">
            <div role="radiogroup" aria-label="Sending channel" className="grid grid-cols-2 gap-2 sm:max-w-sm">
              {(['email', 'instagram'] as const).map((c) => (
                <label
                  key={c}
                  className={cn(
                    'flex cursor-pointer items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-accent',
                    channel === c ? 'border-accent bg-accent-soft' : 'border-line-strong hover:border-fg/30',
                  )}
                >
                  <input type="radio" name="q-channel" value={c} checked={channel === c} onChange={() => setChannel(c)} className="sr-only" />
                  {c === 'email' ? 'Email' : 'Instagram'}
                </label>
              ))}
            </div>

            {fresh ? (
              <div className="mt-4">
                <FormField label="Prepared message" htmlFor="q-message" hint="Edit it in your email or Instagram before sending if you like.">
                  <Textarea id="q-message" readOnly rows={9} value={message} className="font-normal" />
                </FormField>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button size="sm" variant="secondary" icon={Copy} onClick={() => copy(message, 'Message')}>
                    Copy message
                  </Button>
                  {channel === 'email' && (
                    <Button
                      size="sm"
                      variant="secondary"
                      icon={Mail}
                      href={`mailto:${clientEmail}?subject=${encodeURIComponent(`Your project questionnaire — ${settings.studio_name}`)}&body=${encodeURIComponent(message)}`}
                    >
                      Open email draft
                    </Button>
                  )}
                </div>
              </div>
            ) : (
              <p className="mt-4 text-[13px] text-subtle">
                The prepared message needs the link, which is only shown when it is generated. If you already sent it, just record it below.
              </p>
            )}

            <div className="mt-5 border-t border-line pt-4">
              <Button icon={Send} loading={busy === 'sent'} disabled={!active} onClick={() => void act('sent', () => markQuestionnaireSent(messageId, channel), 'Recorded as sent.')}>
                Mark as sent via {channel === 'email' ? 'email' : 'Instagram'}
              </Button>
              <p className="mt-2 text-[13px] text-subtle">Also adds an entry to the client communication history.</p>
            </div>
          </Panel>
        )}

        {row && submitted && row.answers && (
          <Panel title="Submitted answers" description={`Submitted ${when(row.submitted_at)}. Answers can't be changed.`}>
              <div className="mb-5 flex flex-wrap gap-2">
                {editable && (
                  <Button size="sm" variant="secondary" icon={FileInput} onClick={() => onApplyToBrief(answersToBrief(row.answers!))}>
                    Apply to Project Brief
                  </Button>
                )}
                {row.status === 'submitted' && (
                  <Button size="sm" icon={CheckCircle2} loading={busy === 'review'} onClick={() => void act('review', () => markQuestionnaireReviewed(messageId), 'Questionnaire marked as reviewed.')}>
                    Mark as Reviewed
                  </Button>
                )}
              </div>
            <QuestionnaireAnswersView answers={row.answers} />
          </Panel>
        )}
      </div>

      <div className="lg:col-span-2">
        <Panel title="Timeline" bodyClassName="p-0">
          {!row ? (
            <p className="flex items-center gap-2 px-5 py-6 text-sm text-muted">
              <ClipboardList className="size-4" aria-hidden /> Nothing yet.
            </p>
          ) : (
            <dl className="divide-y divide-line" aria-label="Questionnaire timeline">
              {timeline
                .filter(([, v]) => v)
                .map(([label, value]) => (
                  <div key={label} className="flex justify-between gap-4 px-5 py-3 text-sm">
                    <dt className="text-muted">{label}</dt>
                    <dd className="text-right">{value}</dd>
                  </div>
                ))}
            </dl>
          )}
        </Panel>
      </div>

      <ConfirmDialog
        open={confirm === 'replace'}
        title={active ? 'Generate a replacement link?' : 'Generate a new link?'}
        message={
          active ? (
            <>
              The current link <strong className="text-fg">stops working immediately</strong>. The client's saved answers are kept, and you'll need to
              send them the new link.
            </>
          ) : (
            <>A new link valid for 30 days will be created. The client's saved answers are kept.</>
          )
        }
        confirmLabel={active ? 'Replace link' : 'Generate link'}
        busy={busy === 'generate'}
        onConfirm={() => void generate()}
        onCancel={() => setConfirm(null)}
      />
      <ConfirmDialog
        open={confirm === 'revoke'}
        title="Disable this link?"
        message="The client will no longer be able to open or save the questionnaire. Saved answers are kept; you can generate a new link later."
        confirmLabel="Disable link"
        busy={busy === 'revoke'}
        onConfirm={() =>
          void act('revoke', () => revokeQuestionnaire(messageId), 'Link disabled.', () => {
            setFresh(null);
          })
        }
        onCancel={() => setConfirm(null)}
      />
    </div>
  );
}
