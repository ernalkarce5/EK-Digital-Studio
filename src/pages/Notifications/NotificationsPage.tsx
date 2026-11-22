import { useNavigate } from 'react-router';
import { Bell, CheckCheck } from 'lucide-react';
import { AdminPageHeader } from '@/components/admin/AdminUI';
import { Badge } from '@/components/common/Badge';
import { Button } from '@/components/common/Button';
import { EmptyState, ErrorState, LoadingBlock } from '@/components/common/Feedback';
import { useToast } from '@/contexts/ToastContext';
import { useAsync } from '@/hooks/useAsync';
import { listNotifications, markAllNotificationsRead, markNotificationRead, notifyNotificationsChanged } from '@/services/notifications';
import { NOTIFICATION_LABELS } from '@/lib/leads';
import { toErrorMessage } from '@/lib/errors';
import { cn, formatRelative } from '@/lib/utils';
import type { InternalNotification } from '@/types/database';

/** Notification centre for admins and moderators (recipient-only via RLS). */
export default function NotificationsPage({ area }: { area: 'admin' | 'moderator' }) {
  const toast = useToast();
  const navigate = useNavigate();
  const { data, loading, error, reload, setData } = useAsync(() => listNotifications(), []);
  const unread = (data ?? []).filter((n) => !n.read_at).length;

  const leadPath = (n: InternalNotification) =>
    n.message_id ? `/${area}/leads/${n.message_id}` : area === 'admin' ? '/admin/moderators' : '/moderator/leads';

  const open = async (n: InternalNotification) => {
    if (!n.read_at) {
      try {
        await markNotificationRead(n.id);
        setData((list) => list?.map((x) => (x.id === n.id ? { ...x, read_at: new Date().toISOString() } : x)));
        notifyNotificationsChanged();
      } catch {
        /* navigation still useful even if marking fails */
      }
    }
    navigate(leadPath(n));
  };

  const markAll = async () => {
    try {
      await markAllNotificationsRead();
      const now = new Date().toISOString();
      setData((list) => list?.map((x) => ({ ...x, read_at: x.read_at ?? now })));
      notifyNotificationsChanged();
      toast.success('All notifications marked as read.');
    } catch (err) {
      toast.error(toErrorMessage(err));
    }
  };

  return (
    <>
      <AdminPageHeader
        title="Notifications"
        description={unread ? `${unread} unread` : 'You are all caught up.'}
        actions={
          unread > 0 ? (
            <Button size="sm" variant="secondary" icon={CheckCheck} onClick={() => void markAll()}>
              Mark all as read
            </Button>
          ) : undefined
        }
      />
      {loading ? (
        <LoadingBlock />
      ) : error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : !data?.length ? (
        <EmptyState icon={Bell} title="No notifications yet" />
      ) : (
        <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-card" aria-label="Notifications">
          {data.map((n) => (
            <li key={n.id}>
              <button
                type="button"
                onClick={() => void open(n)}
                className={cn('flex w-full items-start gap-3 px-4 py-3.5 text-left transition-colors hover:bg-fg/[0.03]', !n.read_at && 'bg-accent-soft')}
              >
                <span className={cn('mt-2 size-2 shrink-0 rounded-full', n.read_at ? 'bg-transparent' : 'bg-accent')} aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className={cn('text-sm', !n.read_at && 'font-semibold')}>{n.title}</span>
                    <Badge>{NOTIFICATION_LABELS[n.type]}</Badge>
                    {!n.read_at && <span className="sr-only">(unread)</span>}
                  </span>
                  {n.body && <span className="mt-0.5 line-clamp-2 block text-sm text-muted">{n.body}</span>}
                </span>
                <time className="shrink-0 text-xs text-subtle" dateTime={n.created_at}>
                  {formatRelative(n.created_at)}
                </time>
              </button>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
