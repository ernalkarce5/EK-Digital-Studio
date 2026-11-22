import { Link } from 'react-router';
import { motion } from 'framer-motion';
import { ClipboardCheck, ClipboardList, Inbox, MessagesSquare, Sparkles } from 'lucide-react';
import { AdminPageHeader, Panel } from '@/components/admin/AdminUI';
import { ErrorState, Skeleton } from '@/components/common/Feedback';
import { ActivityList } from '@/components/leads/ActivityList';
import { LeadStatusBadge } from '@/components/leads/LeadStatusBadge';
import { useAuth } from '@/contexts/AuthContext';
import { useAsync } from '@/hooks/useAsync';
import { listCurrentAssignments, listLeadActivity } from '@/services/leads';
import { formatRelative } from '@/lib/utils';

export default function ModeratorOverviewPage() {
  const { user } = useAuth();
  const leads = useAsync(() => listCurrentAssignments(), []);
  const activity = useAsync(() => listLeadActivity({ limit: 10 }), []);
  const all = leads.data ?? [];
  const count = (statuses: string[]) => all.filter((l) => statuses.includes(l.status)).length;

  const cards = [
    { label: 'Total assigned', value: all.filter((l) => l.status !== 'archived').length, icon: Inbox, to: '/moderator/leads' },
    { label: 'New assignments', value: count(['new_assignment']), icon: Sparkles, to: '/moderator/leads', highlight: true },
    { label: 'Active conversations', value: count(['contacted', 'in_discussion', 'waiting_for_client']), icon: MessagesSquare, to: '/moderator/communication' },
    { label: 'Pending briefs', value: count(['brief_in_progress', 'changes_requested', 'brief_completed', 'admin_review']), icon: ClipboardList, to: '/moderator/briefs' },
    { label: 'Completed briefs', value: count(['approved', 'archived']), icon: ClipboardCheck, to: '/moderator/archive' },
  ];
  const latest = [...all].sort((a, b) => b.assigned_at.localeCompare(a.assigned_at)).slice(0, 5);
  const firstName = (user?.user_metadata?.full_name as string | undefined)?.split(' ')[0];

  return (
    <>
      <AdminPageHeader title={firstName ? `Welcome back, ${firstName}` : 'Overview'} description="Your assigned clients and what needs attention." />
      {leads.error ? (
        <ErrorState message={leads.error} onRetry={leads.reload} />
      ) : (
        <ul className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
          {leads.loading
            ? Array.from({ length: 5 }).map((_, i) => (
                <li key={i}>
                  <Skeleton className="h-28" />
                </li>
              ))
            : cards.map((c, i) => (
                <motion.li key={c.label} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}>
                  <Link to={c.to} className="flex h-full flex-col rounded-xl border border-line bg-card p-4 transition-colors hover:border-line-strong">
                    <span className="flex items-center justify-between text-[13px] text-muted">
                      {c.label}
                      <c.icon className={c.highlight && c.value > 0 ? 'size-4 text-accent' : 'size-4'} aria-hidden />
                    </span>
                    <span className="mt-4 text-3xl font-medium tracking-tight">{c.value}</span>
                  </Link>
                </motion.li>
              ))}
        </ul>
      )}

      <div className="mt-6 grid gap-6 lg:grid-cols-5">
        <Panel
          title="Latest assignments"
          className="lg:col-span-3"
          bodyClassName="p-0"
          actions={
            <Link to="/moderator/leads" className="text-sm text-muted hover:text-fg">
              View all
            </Link>
          }
        >
          {leads.loading ? (
            <div className="space-y-3 p-5">
              <Skeleton className="h-12" />
              <Skeleton className="h-12" />
            </div>
          ) : !latest.length ? (
            <p className="px-5 py-10 text-center text-sm text-muted">No leads assigned yet. New assignments appear here and in your notifications.</p>
          ) : (
            <ul className="divide-y divide-line">
              {latest.map((l) => (
                <li key={l.id}>
                  <Link to={`/moderator/leads/${l.message_id}`} className="flex items-center gap-3 px-5 py-3.5 hover:bg-fg/[0.02]">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{l.message?.full_name}</span>
                      <span className="block truncate text-sm text-muted">{l.message?.project_type}</span>
                    </span>
                    <LeadStatusBadge status={l.status} />
                    <span className="hidden shrink-0 text-xs text-subtle sm:block">{formatRelative(l.assigned_at)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Panel>
        <Panel title="Recent activity" className="lg:col-span-2" bodyClassName="p-0">
          {activity.loading ? (
            <div className="space-y-3 p-5">
              <Skeleton className="h-8" />
              <Skeleton className="h-8" />
            </div>
          ) : activity.error ? (
            <ErrorState className="m-5" message={activity.error} onRetry={activity.reload} />
          ) : (
            <ActivityList items={activity.data ?? []} compact leadHref={(id) => `/moderator/leads/${id}`} />
          )}
        </Panel>
      </div>
    </>
  );
}
