import { Activity } from 'lucide-react';
import { Link } from 'react-router';
import { Badge } from '@/components/common/Badge';
import { EmptyState } from '@/components/common/Feedback';
import { ACTIVITY_LABELS, LEAD_STATUS } from '@/lib/leads';
import { formatDate, formatRelative } from '@/lib/utils';
import type { LeadActivity, LeadStatus } from '@/types/database';

function detail(a: LeadActivity, names: Map<string, string>): string {
  const m = a.metadata as Record<string, string | undefined>;
  const parts: string[] = [];
  if (m.client) parts.push(m.client);
  if (m.to && LEAD_STATUS[m.to as LeadStatus]) parts.push(`→ ${LEAD_STATUS[m.to as LeadStatus].label}`);
  if (m.to_moderator) parts.push(`to ${names.get(m.to_moderator) ?? 'another moderator'}`);
  if (m.channel) parts.push(m.channel);
  if (m.reason) parts.push(`“${m.reason}”`);
  if (m.name) parts.push(m.name);
  return parts.join(' · ');
}

/** Audit trail rows (read-only). `names` maps moderator ids to names for nicer text. */
export function ActivityList({
  items,
  names = new Map(),
  leadHref,
  compact = false,
}: {
  items: LeadActivity[];
  names?: Map<string, string>;
  leadHref?: (messageId: string) => string;
  compact?: boolean;
}) {
  if (!items.length) return <EmptyState icon={Activity} title="No activity yet" className={compact ? 'border-0' : undefined} />;
  return (
    <ul className="divide-y divide-line" aria-label="Activity">
      {items.map((a) => {
        const d = detail(a, names);
        const actor = a.actor_role === 'system' ? 'System' : a.actor_role === 'admin' ? 'Admin' : (a.actor_id && names.get(a.actor_id)) || 'Moderator';
        return (
          <li key={a.id} className="flex items-start justify-between gap-3 px-5 py-3 text-sm">
            <div className="min-w-0">
              <p className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{ACTIVITY_LABELS[a.action]}</span>
                {!compact && <Badge tone={a.actor_role === 'admin' ? 'accent' : 'neutral'}>{actor}</Badge>}
              </p>
              {d && <p className="mt-0.5 truncate text-muted">{d}</p>}
              {leadHref && a.message_id && (
                <Link to={leadHref(a.message_id)} className="mt-0.5 inline-block text-xs text-accent-2 hover:underline">
                  Open lead
                </Link>
              )}
            </div>
            <time className="shrink-0 text-xs text-subtle" dateTime={a.created_at} title={formatDate(a.created_at, { dateStyle: 'medium', timeStyle: 'short' })}>
              {formatRelative(a.created_at)}
            </time>
          </li>
        );
      })}
    </ul>
  );
}
