import { db, publicDb } from '@/lib/supabase';
import { unwrap } from '@/lib/errors';
import type { Testimonial } from '@/types/database';

export type TestimonialInput = Omit<Testimonial, 'id' | 'created_at' | 'updated_at'>;

export async function listPublishedTestimonials(): Promise<Testimonial[]> {
  const res = await publicDb().from('testimonials').select('*').eq('is_published', true).order('display_order');
  return unwrap(res) as Testimonial[];
}

export async function listAllTestimonials(): Promise<Testimonial[]> {
  const res = await db().from('testimonials').select('*').order('display_order').order('created_at', { ascending: false });
  return unwrap(res) as Testimonial[];
}

export async function createTestimonial(input: TestimonialInput): Promise<Testimonial> {
  return unwrap(await db().from('testimonials').insert(input).select('*').single()) as Testimonial;
}

export async function updateTestimonial(id: string, input: Partial<TestimonialInput>): Promise<Testimonial> {
  return unwrap(await db().from('testimonials').update(input).eq('id', id).select('*').single()) as Testimonial;
}

export async function deleteTestimonial(id: string): Promise<void> {
  const rows = unwrap(await db().from('testimonials').delete().eq('id', id).select('id')) as { id: string }[];
  if (!rows.length) throw new Error('The testimonial could not be deleted (not found or not permitted).');
}
