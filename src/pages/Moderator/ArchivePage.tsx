import { AdminPageHeader } from '@/components/admin/AdminUI';
import { ErrorState, LoadingBlock } from '@/components/common/Feedback';
import { LeadList } from '@/components/leads/LeadList';
import { useAsync } from '@/hooks/useAsync';
import { listBriefs, listCurrentAssignments } from '@/services/leads';
import { DONE_STATUSES } from '@/lib/leads';

/** Completed and archived leads, with their full history kept. */
export default function ModeratorArchivePage() {
  const { data, loading, error, reload } = useAsync(async () => {
    const leads = await listCurrentAssignments({ statuses: DONE_STATUSES });
    const briefs = await listBriefs(leads.map((l) => l.message_id));
    return { leads, briefs: new Map(briefs.map((b) => [b.message_id, b])) };
  }, []);
  return (
    <>
      <AdminPageHeader title="Archive" description="Approved and archived leads. Each keeps its original inquiry, client details, brief and communication history." />
      {loading ? (
        <LoadingBlock />
      ) : error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : (
        <LeadList
          leads={data?.leads ?? []}
          briefs={data?.briefs}
          statusOptions={DONE_STATUSES}
          linkTo={(l) => `/moderator/leads/${l.message_id}`}
          label="Archive"
          emptyTitle="Nothing archived yet"
          emptyDescription="Approved leads appear here."
        />
      )}
    </>
  );
}
