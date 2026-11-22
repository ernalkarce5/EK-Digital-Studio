import { Badge } from '@/components/common/Badge';
import { LEAD_STATUS } from '@/lib/leads';
import type { LeadStatus } from '@/types/database';

export function LeadStatusBadge({ status, className }: { status: LeadStatus; className?: string }) {
  const s = LEAD_STATUS[status];
  return (
    <Badge tone={s.tone} title={s.hint} className={className}>
      {s.label}
    </Badge>
  );
}
