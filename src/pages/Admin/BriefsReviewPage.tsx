import { useMemo } from 'react';
import { AdminPageHeader, Panel } from '@/components/admin/AdminUI';
import { ErrorState, LoadingBlock } from '@/components/common/Feedback';
import { LeadList } from '@/components/leads/LeadList';
import { useAsync } from '@/hooks/useAsync';
import { listBriefs, listCurrentAssignments } from '@/services/leads';
import { DONE_STATUSES, REVIEW_STATUSES } from '@/lib/leads';

/** Submitted briefs awaiting review, and approved/archived ones. */
export default function BriefsReviewPage() {
  const { data, loading, error, reload } = useAsync(async () => {
    const leads = await listCurrentAssignments({ statuses: [...REVIEW_STATUSES, ...DONE_STATUSES] });
    const briefs = await listBriefs(leads.map((l) => l.message_id));
    return { leads, briefs: new Map(briefs.map((b) => [b.message_id, b])) };
  }, []);
  const awaiting = useMemo(() => (data?.leads ?? []).filter((l) => REVIEW_STATUSES.includes(l.status)), [data]);
  const done = useMemo(() => (data?.leads ?? []).filter((l) => DONE_STATUSES.includes(l.status)), [data]);

  return (
    <>
      <AdminPageHeader title="Completed Briefs" description="Project briefs submitted by moderators. Open one to review, approve or request more information." />
      {loading ? (
        <LoadingBlock />
      ) : error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : (
        <div className="space-y-8">
          <Panel title={`Awaiting review (${awaiting.length})`} bodyClassName="p-4">
            <LeadList
              leads={awaiting}
              briefs={data?.briefs}
              showModerator
              statusOptions={REVIEW_STATUSES}
              linkTo={(l) => `/admin/leads/${l.message_id}?tab=brief`}
              label="Briefs awaiting review"
              emptyTitle="Nothing to review"
              emptyDescription="Submitted briefs appear here and in your notifications."
            />
          </Panel>
          <Panel title={`Approved & archived (${done.length})`} bodyClassName="p-4">
            <LeadList
              leads={done}
              briefs={data?.briefs}
              showModerator
              statusOptions={DONE_STATUSES}
              linkTo={(l) => `/admin/leads/${l.message_id}?tab=brief`}
              label="Approved briefs"
              emptyTitle="No approved briefs yet"
            />
          </Panel>
        </div>
      )}
    </>
  );
}
