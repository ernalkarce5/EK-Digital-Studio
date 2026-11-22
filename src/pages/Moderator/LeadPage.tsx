import { useParams } from 'react-router';
import { LeadWorkspace } from '@/components/leads/LeadWorkspace';

export default function ModeratorLeadPage() {
  const { messageId = '' } = useParams();
  return <LeadWorkspace key={messageId} messageId={messageId} role="moderator" backTo="/moderator/leads" backLabel="Assigned leads" />;
}
