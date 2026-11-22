import { useParams } from 'react-router';
import { LeadWorkspace } from '@/components/leads/LeadWorkspace';

export default function AdminLeadPage() {
  const { messageId = '' } = useParams();
  return <LeadWorkspace key={messageId} messageId={messageId} role="admin" backTo="/admin/assignments" backLabel="All assignments" />;
}
