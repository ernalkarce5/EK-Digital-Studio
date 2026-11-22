import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { ArrowDownLeft, ArrowUpRight, MessagesSquare, StickyNote } from 'lucide-react';
import { AdminPageHeader, Panel } from '@/components/admin/AdminUI';
import { Badge } from '@/components/common/Badge';
import { EmptyState, ErrorState, LoadingBlock } from '@/components/common/Feedback';
import { Select } from '@/components/forms/Field';
import { useAsync } from '@/hooks/useAsync';
import { listCommunications, listCurrentAssignments } from '@/services/leads';
import { CHANNELS, DIRECTIONS } from '@/lib/leads';
import { formatDate } from '@/lib/utils';

const ICON = { outgoing: ArrowUpRight, incoming: ArrowDownLeft, note: StickyNote } as const;

/** Communication across all of the moderator's leads (newest first). Records are added inside each lead. */
export default function ModeratorCommunicationPage() {
  const navigate = useNavigate();
  const { data, loading, error, reload } = useAsync(() => Promise.all([listCommunications(300), listCurrentAssignments()]), []);
  const [channel, setChannel] = useState('all');
  const leads = useMemo(() => new Map((data?.[1] ?? []).map((l) => [l.message_id, l])), [data]);
  const records = (data?.[0] ?? []).filter((r) => channel === 'all' || r.channel === channel);
  const activeLeads = (data?.[1] ?? []).filter((l) => l.status !== 'archived');

  return (
    <>
      <AdminPageHeader title="Client Communication" description="A record of every email, message and call you logged. Nothing is sent automatically from here." />
      {loading ? (
        <LoadingBlock />
      ) : error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : (
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="min-w-0 lg:col-span-2">
            <div className="mb-4 max-w-xs">
              <label htmlFor="comm-filter" className="sr-only">
                Filter by channel
              </label>
              <Select id="comm-filter" value={channel} onChange={(e) => setChannel(e.target.value)} className="h-10">
                <option value="all">All channels</option>
                {Object.entries(CHANNELS).map(([k, label]) => (
                  <option key={k} value={k}>
                    {label}
                  </option>
                ))}
              </Select>
            </div>
            {!records.length ? (
              <EmptyState icon={MessagesSquare} title="No communication recorded" description="Open a lead and use its Communication tab to record what you send and receive." />
            ) : (
              <ol className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-card" aria-label="All communication">
                {records.map((r) => {
                  const Icon = ICON[r.direction];
                  const lead = leads.get(r.message_id);
                  return (
                    <li key={r.id} className="flex gap-3 px-4 py-3.5">
                      <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-full border border-line-strong text-muted">
                        <Icon className="size-3.5" aria-hidden />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2 text-xs">
                          <Link to={`/moderator/leads/${r.message_id}?tab=communication`} className="text-sm font-medium hover:text-accent-2">
                            {lead?.message?.full_name ?? 'Lead'}
                          </Link>
                          <Badge tone={r.direction === 'incoming' ? 'success' : r.direction === 'outgoing' ? 'accent' : 'neutral'}>{DIRECTIONS[r.direction]}</Badge>
                          <span className="text-muted">{CHANNELS[r.channel]}</span>
                          <time className="text-subtle" dateTime={r.occurred_at}>
                            {formatDate(r.occurred_at, { dateStyle: 'medium', timeStyle: 'short' })}
                          </time>
                        </div>
                        <p className="mt-1 line-clamp-3 whitespace-pre-wrap text-[15px] text-muted">{r.summary}</p>
                      </div>
                    </li>
                  );
                })}
              </ol>
            )}
          </div>
          <Panel title="Record new communication" description="Pick a client to open their communication log.">
            {!activeLeads.length ? (
              <p className="text-sm text-muted">You have no active leads.</p>
            ) : (
              <>
                <label htmlFor="comm-lead" className="sr-only">
                  Client
                </label>
                <Select id="comm-lead" defaultValue="" onChange={(e) => e.target.value && navigate(`/moderator/leads/${e.target.value}?tab=communication`)}>
                  <option value="" disabled>
                    Choose a client
                  </option>
                  {activeLeads.map((l) => (
                    <option key={l.id} value={l.message_id}>
                      {l.message?.full_name}
                    </option>
                  ))}
                </Select>
              </>
            )}
          </Panel>
        </div>
      )}
    </>
  );
}
