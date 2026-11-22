import { useMemo, useState } from 'react';
import { AdminPageHeader } from '@/components/admin/AdminUI';
import { ErrorState, LoadingBlock } from '@/components/common/Feedback';
import { LeadList } from '@/components/leads/LeadList';
import { useAsync } from '@/hooks/useAsync';
import { listCurrentAssignments } from '@/services/leads';
import { LEAD_STATUS_ORDER } from '@/lib/leads';

/** All current assignments (who owns what). Each row opens the admin lead workspace. */
export default function AssignmentsPage() {
  const { data, loading, error, reload } = useAsync(() => listCurrentAssignments(), []);
  const [moderator, setModerator] = useState('all');
  const moderators = useMemo(() => {
    const map = new Map<string, string>();
    for (const a of data ?? []) if (a.moderator) map.set(a.moderator.id, a.moderator.full_name);
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [data]);
  const leads = (data ?? []).filter((a) => moderator === 'all' || a.moderator_id === moderator);

  return (
    <>
      <AdminPageHeader
        title="Assignments"
        description="Every inquiry currently assigned to a moderator. Open one to transfer it, retrieve it, change its status or review its brief."
        actions={
          moderators.length > 1 ? (
            <select
              value={moderator}
              onChange={(e) => setModerator(e.target.value)}
              aria-label="Filter by moderator"
              className="h-9 rounded-lg border border-line-strong bg-bg-2 px-3 text-sm focus:border-accent focus:outline-none"
            >
              <option value="all">All moderators</option>
              {moderators.map(([id, name]) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </select>
          ) : undefined
        }
      />
      {loading ? (
        <LoadingBlock />
      ) : error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : (
        <LeadList
          leads={leads}
          showModerator
          statusOptions={LEAD_STATUS_ORDER}
          linkTo={(l) => `/admin/leads/${l.message_id}`}
          label="Assignments"
          emptyTitle="No assignments yet"
          emptyDescription="Assign an inquiry from Messages to get started."
        />
      )}
    </>
  );
}
