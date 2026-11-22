import { db } from '@/lib/supabase';
import { unwrap } from '@/lib/errors';
import type { ActivityLog, ContactMessage } from '@/types/database';

export interface DashboardStats {
  totalProjects: number;
  publishedProjects: number;
  draftProjects: number;
  totalMessages: number;
  unreadMessages: number;
}

async function count(table: string, filter?: [string, string]): Promise<number> {
  let q = db().from(table).select('id', { count: 'exact', head: true });
  if (filter) q = q.eq(filter[0], filter[1]);
  const { count: n, error } = await q;
  if (error) throw error;
  return n ?? 0;
}

export async function getDashboardStats(): Promise<DashboardStats> {
  const [totalProjects, publishedProjects, draftProjects, totalMessages, unreadMessages] = await Promise.all([
    count('projects'),
    count('projects', ['status', 'published']),
    count('projects', ['status', 'draft']),
    count('contact_messages'),
    count('contact_messages', ['status', 'new']),
  ]);
  return { totalProjects, publishedProjects, draftProjects, totalMessages, unreadMessages };
}

export async function getRecentMessages(limit = 5): Promise<ContactMessage[]> {
  const res = await db()
    .from('contact_messages')
    .select('id, full_name, email, company, project_type, budget, message, preferred_contact, phone, status, read_at, created_at, updated_at')
    .order('created_at', { ascending: false })
    .limit(limit);
  return unwrap(res) as ContactMessage[];
}

export async function getRecentActivity(limit = 12): Promise<ActivityLog[]> {
  const res = await db()
    .from('admin_activity_logs')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);
  return unwrap(res) as ActivityLog[];
}
