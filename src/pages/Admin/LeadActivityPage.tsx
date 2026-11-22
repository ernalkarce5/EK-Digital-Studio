import { useMemo } from 'react';
import { useSearchParams } from 'react-router';
import { AdminPageHeader, Panel } from '@/components/admin/AdminUI';
import { ErrorState, LoadingBlock } from '@/components/common/Feedback';
import { ActivityList } from '@/components/leads/ActivityList';
import { useAsync } from '@/hooks/useAsync';
import { listLeadActivity } from '@/services/leads';
import { listModerators } from '@/services/moderators';
import { ACTIVITY_LABELS } from '@/lib/leads';

/** Append-only audit log of the moderator workflow (cannot be edited by anyone through the app). */
export default function LeadActivityPage() {
  const [params, setParams] = useSearchParams();
  const moderatorId = params.get('moderator') ?? '';
  const action = params.get('action') ?? '';
  const logs = useAsync(() => listLeadActivity({ limit: 300, moderatorId: moderatorId || undefined, action: action || undefined }), [moderatorId, action]);
  const moderators = useAsync(listModerators, []);
  const names = useMemo(() => new Map((moderators.data ?? []).map((m) => [m.id, m.full_name])), [moderators.data]);

  const set = (key: 'moderator' | 'action', value: string) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (value) next.set(key, value);
        else next.delete(key);
        return next;
      },
      { replace: true },
    );

  return (
    <>
      <AdminPageHeader title="Activity Logs" description="A permanent record of assignments, status changes, briefs and communication. Entries cannot be edited or deleted." />
      <div className="mb-4 grid gap-2 sm:grid-cols-2 lg:max-w-xl">
        <select
          value={moderatorId}
          onChange={(e) => set('moderator', e.target.value)}
          aria-label="Filter by moderator"
          className="h-10 rounded-lg border border-line-strong bg-bg-2 px-3 text-sm focus:border-accent focus:outline-none"
        >
          <option value="">All moderators</option>
          {(moderators.data ?? []).map((m) => (
            <option key={m.id} value={m.id}>
              {m.full_name}
            </option>
          ))}
        </select>
        <select
          value={action}
          onChange={(e) => set('action', e.target.value)}
          aria-label="Filter by action"
          className="h-10 rounded-lg border border-line-strong bg-bg-2 px-3 text-sm focus:border-accent focus:outline-none"
        >
          <option value="">All actions</option>
          {Object.entries(ACTIVITY_LABELS).map(([k, label]) => (
            <option key={k} value={k}>
              {label}
            </option>
          ))}
        </select>
      </div>
      {logs.loading ? (
        <LoadingBlock />
      ) : logs.error ? (
        <ErrorState message={logs.error} onRetry={logs.reload} />
      ) : (
        <Panel bodyClassName="p-0">
          <ActivityList items={logs.data ?? []} names={names} leadHref={(id) => `/admin/leads/${id}`} />
        </Panel>
      )}
    </>
  );
}
