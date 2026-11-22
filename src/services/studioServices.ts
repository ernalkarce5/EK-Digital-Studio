// Data access for the `services` table (the studio's service offerings).
import { db, publicDb } from '@/lib/supabase';
import { unwrap } from '@/lib/errors';
import type { Service } from '@/types/database';

export type ServiceInput = Omit<Service, 'id' | 'created_at' | 'updated_at'>;

export async function listPublishedServices(): Promise<Service[]> {
  const res = await publicDb().from('services').select('*').eq('is_published', true).order('display_order');
  return unwrap(res) as Service[];
}

export async function listAllServices(): Promise<Service[]> {
  const res = await db().from('services').select('*').order('display_order').order('title');
  return unwrap(res) as Service[];
}

export async function createService(input: ServiceInput): Promise<Service> {
  return unwrap(await db().from('services').insert(input).select('*').single()) as Service;
}

export async function updateService(id: string, input: Partial<ServiceInput>): Promise<Service> {
  return unwrap(await db().from('services').update(input).eq('id', id).select('*').single()) as Service;
}

export async function deleteService(id: string): Promise<void> {
  const rows = unwrap(await db().from('services').delete().eq('id', id).select('id')) as { id: string }[];
  if (!rows.length) throw new Error('The service could not be deleted (not found or not permitted).');
}
