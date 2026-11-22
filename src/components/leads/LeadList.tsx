import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { ChevronRight, Inbox, Search } from 'lucide-react';
import { EmptyState } from '@/components/common/Feedback';
import { LeadStatusBadge } from './LeadStatusBadge';
import { LEAD_STATUS, BRIEF_PROJECT_TYPES } from '@/lib/leads';
import { cn, formatRelative } from '@/lib/utils';
import type { LeadStatus, ProjectBrief } from '@/types/database';
import type { LeadSummary } from '@/services/leads';

/**
 * Searchable, filterable list of leads. Rows on desktop, cards on mobile.
 * Search matches client name, email, company and project type (inquiry + brief).
 */
export function LeadList({
  leads,
  linkTo,
  showModerator = false,
  briefs,
  statusOptions,
  emptyTitle = 'No leads here',
  emptyDescription,
  label = 'Leads',
}: {
  leads: LeadSummary[];
  linkTo: (lead: LeadSummary) => string;
  showModerator?: boolean;
  /** Optional briefs (by message) to search and display the brief's project type. */
  briefs?: Map<string, ProjectBrief>;
  statusOptions?: LeadStatus[];
  emptyTitle?: string;
  emptyDescription?: string;
  label?: string;
}) {
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<LeadStatus | 'all'>('all');
  const [projectType, setProjectType] = useState('all');

  const projectTypes = useMemo(() => {
    const set = new Set<string>();
    for (const l of leads) {
      const t = briefs?.get(l.message_id)?.project_type;
      set.add(t ? BRIEF_PROJECT_TYPES[t] : (l.message?.project_type ?? ''));
    }
    return [...set].filter(Boolean).sort();
  }, [leads, briefs]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return leads.filter((l) => {
      const briefType = briefs?.get(l.message_id)?.project_type;
      const typeLabel = briefType ? BRIEF_PROJECT_TYPES[briefType] : (l.message?.project_type ?? '');
      if (status !== 'all' && l.status !== status) return false;
      if (projectType !== 'all' && typeLabel !== projectType) return false;
      if (!q) return true;
      return [l.message?.full_name, l.message?.email, l.message?.company, l.message?.project_type, typeLabel, l.moderator?.full_name]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(q);
    });
  }, [leads, query, status, projectType, briefs]);

  const statuses = statusOptions ?? [...new Set(leads.map((l) => l.status))];

  return (
    <div>
      <div className="mb-4 grid gap-2 sm:grid-cols-[1fr_auto_auto]">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-subtle" aria-hidden />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name, email, company or project type"
            aria-label={`Search ${label.toLowerCase()}`}
            className="h-10 w-full rounded-lg border border-line-strong bg-bg-2 pl-9 pr-3 text-[15px] focus:border-accent focus:outline-none sm:text-sm"
          />
        </div>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value as LeadStatus | 'all')}
          aria-label="Filter by status"
          className="h-10 rounded-lg border border-line-strong bg-bg-2 px-3 text-sm focus:border-accent focus:outline-none"
        >
          <option value="all">All statuses</option>
          {statuses.map((s) => (
            <option key={s} value={s}>
              {LEAD_STATUS[s].label}
            </option>
          ))}
        </select>
        <select
          value={projectType}
          onChange={(e) => setProjectType(e.target.value)}
          aria-label="Filter by project type"
          className="h-10 rounded-lg border border-line-strong bg-bg-2 px-3 text-sm focus:border-accent focus:outline-none"
        >
          <option value="all">All project types</option>
          {projectTypes.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </div>

      {!leads.length ? (
        <EmptyState icon={Inbox} title={emptyTitle} description={emptyDescription} />
      ) : !filtered.length ? (
        <EmptyState icon={Search} title="No leads match your filters" />
      ) : (
        <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-card" aria-label={label}>
          {filtered.map((l) => {
            const briefType = briefs?.get(l.message_id)?.project_type;
            return (
              <li key={l.id}>
                <Link
                  to={linkTo(l)}
                  className="group flex items-center gap-3 px-4 py-3.5 transition-colors hover:bg-fg/[0.03]"
                  aria-label={`Open lead: ${l.message?.full_name ?? 'Unknown client'}`}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className={cn('truncate font-medium', l.status === 'new_assignment' && 'text-fg')}>
                        {l.message?.full_name ?? 'Unknown client'}
                      </span>
                      <LeadStatusBadge status={l.status} />
                    </div>
                    <p className="mt-1 truncate text-sm text-muted">
                      {[briefType ? BRIEF_PROJECT_TYPES[briefType] : l.message?.project_type, l.message?.company, l.message?.email]
                        .filter(Boolean)
                        .join(' · ')}
                    </p>
                    <p className="mt-0.5 text-xs text-subtle">
                      {showModerator && l.moderator && <span>{l.moderator.full_name} · </span>}
                      Updated {formatRelative(l.updated_at)}
                    </p>
                  </div>
                  <ChevronRight className="size-4 shrink-0 text-subtle transition-transform group-hover:translate-x-0.5" aria-hidden />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
