import { useState } from 'react';
import { ArrowDownLeft, ArrowUpRight, MessageSquarePlus, StickyNote } from 'lucide-react';
import { Panel } from '@/components/admin/AdminUI';
import { Button } from '@/components/common/Button';
import { Badge } from '@/components/common/Badge';
import { FormField, Input, Select, Textarea } from '@/components/forms/Field';
import { useToast } from '@/contexts/ToastContext';
import { addCommunication, notifyLeadsChanged } from '@/services/leads';
import { CHANNELS, DIRECTIONS } from '@/lib/leads';
import { toErrorMessage } from '@/lib/errors';
import { formatDate } from '@/lib/utils';
import type { CommunicationChannel, CommunicationDirection, CommunicationLog } from '@/types/database';

const pad = (n: number) => String(n).padStart(2, '0');
function nowLocal(): string {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const DIRECTION_ICON = { outgoing: ArrowUpRight, incoming: ArrowDownLeft, note: StickyNote } as const;

/** Manual correspondence records (no messages are sent by the system). */
export function CommunicationPanel({
  messageId,
  records,
  canAdd,
  authorRole,
  onAdded,
}: {
  messageId: string;
  records: CommunicationLog[];
  canAdd: boolean;
  authorRole: 'admin' | 'moderator';
  onAdded: (r: CommunicationLog) => void;
}) {
  const toast = useToast();
  const [channel, setChannel] = useState<CommunicationChannel>('email');
  const [direction, setDirection] = useState<CommunicationDirection>('outgoing');
  const [occurredAt, setOccurredAt] = useState(nowLocal);
  const [summary, setSummary] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!summary.trim()) {
      setError('Describe what was sent or received.');
      return;
    }
    const when = new Date(occurredAt);
    if (Number.isNaN(when.getTime()) || when.getTime() > Date.now() + 5 * 60_000) {
      setError('Use the date and time it actually happened (not in the future).');
      return;
    }
    setBusy(true);
    try {
      const rec = await addCommunication({ messageId, channel, direction, occurredAt: when.toISOString(), summary, authorRole });
      onAdded(rec);
      notifyLeadsChanged();
      setSummary('');
      setOccurredAt(nowLocal());
      setError(null);
      toast.success('Communication recorded.');
    } catch (err) {
      toast.error(toErrorMessage(err, 'The record could not be saved.'));
    } finally {
      setBusy(false);
    }
  };

  const sorted = [...records].sort((a, b) => a.occurred_at.localeCompare(b.occurred_at) || a.created_at.localeCompare(b.created_at));

  return (
    <div className="grid gap-6 lg:grid-cols-5">
      <Panel title="History" description="Oldest first." className="lg:col-span-3" bodyClassName="p-0">
        {!sorted.length ? (
          <p className="px-5 py-8 text-center text-sm text-muted">No communication recorded yet.</p>
        ) : (
          <ol className="divide-y divide-line" aria-label="Communication history">
            {sorted.map((r) => {
              const Icon = DIRECTION_ICON[r.direction];
              return (
                <li key={r.id} className="flex gap-3 px-5 py-4">
                  <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-full border border-line-strong text-muted">
                    <Icon className="size-3.5" aria-hidden />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <Badge tone={r.direction === 'incoming' ? 'success' : r.direction === 'outgoing' ? 'accent' : 'neutral'}>
                        {DIRECTIONS[r.direction]}
                      </Badge>
                      <span className="text-muted">{CHANNELS[r.channel]}</span>
                      <time className="text-subtle" dateTime={r.occurred_at}>
                        {formatDate(r.occurred_at, { dateStyle: 'medium', timeStyle: 'short' })}
                      </time>
                      {r.author_role === 'admin' && <span className="text-subtle">· by admin</span>}
                    </div>
                    <p className="mt-1.5 whitespace-pre-wrap break-words text-[15px] leading-relaxed">{r.summary}</p>
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </Panel>

      {canAdd && (
        <Panel title="Record communication" description="Log emails, Instagram messages, calls and replies." className="lg:col-span-2">
          <form onSubmit={submit} noValidate className="grid gap-4">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
              <FormField label="Type" htmlFor="comm-direction">
                <Select id="comm-direction" value={direction} onChange={(e) => setDirection(e.target.value as CommunicationDirection)}>
                  {Object.entries(DIRECTIONS).map(([k, label]) => (
                    <option key={k} value={k}>
                      {label}
                    </option>
                  ))}
                </Select>
              </FormField>
              <FormField label="Channel" htmlFor="comm-channel">
                <Select id="comm-channel" value={channel} onChange={(e) => setChannel(e.target.value as CommunicationChannel)}>
                  {Object.entries(CHANNELS).map(([k, label]) => (
                    <option key={k} value={k}>
                      {label}
                    </option>
                  ))}
                </Select>
              </FormField>
            </div>
            <FormField label="Date and time" htmlFor="comm-when">
              <Input id="comm-when" type="datetime-local" value={occurredAt} onChange={(e) => setOccurredAt(e.target.value)} />
            </FormField>
            <FormField label="Summary" htmlFor="comm-summary" required error={error ?? undefined}>
              <Textarea
                id="comm-summary"
                rows={4}
                maxLength={5000}
                value={summary}
                invalid={!!error}
                onChange={(e) => {
                  setSummary(e.target.value);
                  setError(null);
                }}
                placeholder="What was said, asked or agreed?"
              />
            </FormField>
            <Button type="submit" icon={MessageSquarePlus} loading={busy}>
              Add record
            </Button>
          </form>
        </Panel>
      )}
    </div>
  );
}
