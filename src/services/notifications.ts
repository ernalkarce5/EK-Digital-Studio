// Internal notifications: created by database functions, read/marked by the recipient (RLS).
import { db } from '@/lib/supabase';
import { unwrap } from '@/lib/errors';
import type { InternalNotification } from '@/types/database';

export async function listNotifications(limit = 100): Promise<InternalNotification[]> {
  const res = await db().from('internal_notifications').select('*').order('created_at', { ascending: false }).limit(limit);
  return unwrap(res) as InternalNotification[];
}

export async function countUnreadNotifications(): Promise<number> {
  const { count, error } = await db()
    .from('internal_notifications')
    .select('id', { count: 'exact', head: true })
    .is('read_at', null);
  if (error) throw error;
  return count ?? 0;
}

export async function markNotificationRead(id: number): Promise<void> {
  const res = await db().from('internal_notifications').update({ read_at: new Date().toISOString() }).eq('id', id).select('id');
  unwrap(res);
}

export async function markAllNotificationsRead(): Promise<void> {
  const res = await db().from('internal_notifications').update({ read_at: new Date().toISOString() }).is('read_at', null).select('id');
  unwrap(res);
}

export const notifyNotificationsChanged = () => window.dispatchEvent(new Event('ek:notifications-changed'));
