import { Link } from 'react-router';
import { motion } from 'framer-motion';
import { Activity, FilePen, FolderCheck, FolderKanban, Inbox, Mail, MailOpen, Plus } from 'lucide-react';
import { AdminPageHeader, MessageStatusBadge, Panel } from '@/components/admin/AdminUI';
import { Button } from '@/components/common/Button';
import { EmptyState, ErrorState, Skeleton } from '@/components/common/Feedback';
import { useAsync } from '@/hooks/useAsync';
import { getDashboardStats, getRecentActivity, getRecentMessages } from '@/services/dashboard';
import { formatRelative } from '@/lib/utils';
import type { ActivityLog } from '@/types/database';

const ENTITY_LABELS: Record<string, string> = {
  projects: 'Project',
  categories: 'Category',
  services: 'Service',
  testimonials: 'Testimonial',
  contact_messages: 'Message',
  site_settings: 'Site settings',
  profiles: 'Profile',
};

function describe(log: ActivityLog): string {
  const entity = ENTITY_LABELS[log.entity_type] ?? log.entity_type;
  const label = log.entity_label ? ` “${log.entity_label}”` : '';
  switch (log.action) {
    case 'received':
      return `New inquiry from${label}`;
    case 'create':
      return `${entity}${label} created`;
    case 'delete':
      return `${entity}${label} deleted`;
    case 'publish':
      return `${entity}${label} published`;
    case 'unpublish':
      return `${entity}${label} unpublished`;
    case 'status':
      return `${entity}${label} marked ${log.details?.to ?? ''}`.trim();
    default:
      return `${entity}${label} updated`;
  }
}

export default function DashboardPage() {
  const stats = useAsync(getDashboardStats, []);
  const messages = useAsync(() => getRecentMessages(5), []);
  const activity = useAsync(() => getRecentActivity(12), []);

  const cards = stats.data
    ? [
        { label: 'Total projects', value: stats.data.totalProjects, icon: FolderKanban, to: '/admin/projects' },
        { label: 'Published', value: stats.data.publishedProjects, icon: FolderCheck, to: '/admin/projects?status=published' },
        { label: 'Drafts', value: stats.data.draftProjects, icon: FilePen, to: '/admin/projects?status=draft' },
        { label: 'Total messages', value: stats.data.totalMessages, icon: Mail, to: '/admin/messages' },
        { label: 'Unread', value: stats.data.unreadMessages, icon: MailOpen, to: '/admin/messages?status=new', highlight: stats.data.unreadMessages > 0 },
      ]
    : [];

  return (
    <>
      <AdminPageHeader
        title="Dashboard"
        description="Overview of your content and inquiries."
        actions={
          <Button to="/admin/projects/new" icon={Plus} size="sm">
            New project
          </Button>
        }
      />

      {stats.error ? (
        <ErrorState message={stats.error} onRetry={stats.reload} />
      ) : (
        <ul className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
          {stats.loading
            ? Array.from({ length: 5 }).map((_, i) => (
                <li key={i}>
                  <Skeleton className="h-28" />
                </li>
              ))
            : cards.map((c, i) => (
                <motion.li
                  key={c.label}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.04 }}
                >
                  <Link
                    to={c.to}
                    className="flex h-full flex-col rounded-xl border border-line bg-card p-4 transition-colors hover:border-line-strong"
                  >
                    <span className="flex items-center justify-between text-[13px] text-muted">
                      {c.label}
                      <c.icon className={c.highlight ? 'size-4 text-accent' : 'size-4'} aria-hidden />
                    </span>
                    <span className="mt-4 text-3xl font-medium tracking-tight">{c.value}</span>
                  </Link>
                </motion.li>
              ))}
        </ul>
      )}

      <div className="mt-6 grid gap-6 lg:grid-cols-5">
        <Panel
          title="Recent messages"
          className="lg:col-span-3"
          bodyClassName="p-0"
          actions={
            <Link to="/admin/messages" className="text-sm text-muted hover:text-fg">
              View all
            </Link>
          }
        >
          {messages.loading ? (
            <div className="space-y-3 p-5">
              <Skeleton className="h-12" />
              <Skeleton className="h-12" />
            </div>
          ) : messages.error ? (
            <ErrorState className="m-5" message={messages.error} onRetry={messages.reload} />
          ) : !messages.data?.length ? (
            <EmptyState className="m-5" icon={Inbox} title="No messages yet" description="Inquiries from the contact form will appear here." />
          ) : (
            <ul className="divide-y divide-line">
              {messages.data.map((m) => (
                <li key={m.id}>
                  <Link to={`/admin/messages?id=${m.id}`} className="flex items-start gap-3 px-5 py-3.5 hover:bg-fg/[0.02]">
                    <span className={m.status === 'new' ? 'mt-2 size-2 shrink-0 rounded-full bg-accent' : 'mt-2 size-2 shrink-0'} aria-hidden />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center justify-between gap-3">
                        <span className={m.status === 'new' ? 'truncate font-medium' : 'truncate'}>{m.full_name}</span>
                        <span className="shrink-0 text-xs text-subtle">{formatRelative(m.created_at)}</span>
                      </span>
                      <span className="mt-0.5 flex items-center gap-2">
                        <span className="truncate text-sm text-muted">
                          {m.project_type} · {m.message}
                        </span>
                      </span>
                    </span>
                    <span className="hidden sm:block">
                      <MessageStatusBadge status={m.status} />
                    </span>
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
              <Skeleton className="h-8" />
            </div>
          ) : activity.error ? (
            <ErrorState className="m-5" message={activity.error} onRetry={activity.reload} />
          ) : !activity.data?.length ? (
            <EmptyState className="m-5" icon={Activity} title="No activity yet" description="Changes you make will be listed here." />
          ) : (
            <ul className="divide-y divide-line">
              {activity.data.map((log) => (
                <li key={log.id} className="flex items-start justify-between gap-3 px-5 py-3 text-sm">
                  <span className="min-w-0 text-muted">{describe(log)}</span>
                  <time className="shrink-0 text-xs text-subtle" dateTime={log.created_at}>
                    {formatRelative(log.created_at)}
                  </time>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </>
  );
}
