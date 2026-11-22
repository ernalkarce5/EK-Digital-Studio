import { useMemo } from 'react';
import { AdminPageHeader, Panel } from '@/components/admin/AdminUI';
import { ErrorState, LoadingBlock } from '@/components/common/Feedback';
import { LeadList } from '@/components/leads/LeadList';
import { useAsync } from '@/hooks/useAsync';
import { listBriefs, listCurrentAssignments } from '@/services/leads';
import { ACTIVE_STATUSES, REVIEW_STATUSES } from '@/lib/leads';

/** Briefs grouped by where they are in the workflow. */
export default function ModeratorBriefsPage() {
  const { data, loading, error, reload } = useAsync(async () => {
    const leads = await listCurrentAssignments({ statuses: [...ACTIVE_STATUSES, ...REVIEW_STATUSES, 'approved'] });
    const briefs = await listBriefs(leads.map((l) => l.message_id));
    return { leads, briefs: new Map(briefs.map((b) => [b.message_id, b])) };
  }, []);

  const groups = useMemo(() => {
    const leads = data?.leads ?? [];
    return [
      { title: 'Changes requested', items: leads.filter((l) => l.status === 'changes_requested'), empty: 'Nothing needs changes.' },
      { title: 'Drafts in progress', items: leads.filter((l) => ACTIVE_STATUSES.includes(l.status) && l.status !== 'changes_requested'), empty: 'No drafts. Open a lead to start its brief.' },
      { title: 'Submitted for review', items: leads.filter((l) => REVIEW_STATUSES.includes(l.status)), empty: 'No briefs waiting for the admin.' },
      { title: 'Approved', items: leads.filter((l) => l.status === 'approved'), empty: 'No approved briefs yet.' },
    ];
  }, [data]);

  return (
    <>
      <AdminPageHeader title="Project Briefs" description="Draft, complete and submit a structured brief for each client. Drafts can be saved at any time." />
      {loading ? (
        <LoadingBlock />
      ) : error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : (
        <div className="space-y-8">
          {groups.map((g) => (
            <Panel key={g.title} title={`${g.title} (${g.items.length})`} bodyClassName="p-4">
              <LeadList leads={g.items} briefs={data?.briefs} linkTo={(l) => `/moderator/leads/${l.message_id}?tab=brief`} label={g.title} emptyTitle={g.empty} />
            </Panel>
          ))}
        </div>
      )}
    </>
  );
}
