import { AdminPageHeader } from '@/components/admin/AdminUI';
import { ErrorState, LoadingBlock } from '@/components/common/Feedback';
import { LeadList } from '@/components/leads/LeadList';
import { useAsync } from '@/hooks/useAsync';
import { listCurrentAssignments } from '@/services/leads';
import { ACTIVE_STATUSES, REVIEW_STATUSES } from '@/lib/leads';

const OPEN = [...ACTIVE_STATUSES, ...REVIEW_STATUSES];

export default function ModeratorLeadsPage() {
  const { data, loading, error, reload } = useAsync(() => listCurrentAssignments({ statuses: OPEN }), []);
  return (
    <>
      <AdminPageHeader title="Assigned Leads" description="Clients assigned to you. Open one to see the original inquiry, record communication and build the project brief." />
      {loading ? (
        <LoadingBlock />
      ) : error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : (
        <LeadList
          leads={data ?? []}
          statusOptions={OPEN}
          linkTo={(l) => `/moderator/leads/${l.message_id}`}
          label="Assigned leads"
          emptyTitle="No assigned leads"
          emptyDescription="When the admin assigns an inquiry to you, it appears here."
        />
      )}
    </>
  );
}
