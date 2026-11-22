import { db, publicDb } from '@/lib/supabase';
import { unwrap } from '@/lib/errors';
import type { Category } from '@/types/database';

export type CategoryInput = Pick<Category, 'name' | 'slug' | 'description' | 'display_order' | 'is_published'>;
export type CategoryWithCount = Category & { project_count: number };

export async function listPublishedCategories(): Promise<Category[]> {
  const res = await publicDb()
    .from('categories')
    .select('*')
    .eq('is_published', true)
    .order('display_order')
    .order('name');
  return unwrap(res) as Category[];
}

export async function listCategoriesWithCounts(): Promise<CategoryWithCount[]> {
  const res = await db().from('categories').select('*, projects(count)').order('display_order').order('name');
  const rows = unwrap(res) as (Category & { projects: { count: number }[] })[];
  return rows.map(({ projects, ...c }) => ({ ...c, project_count: projects?.[0]?.count ?? 0 }));
}

export async function createCategory(input: CategoryInput): Promise<Category> {
  return unwrap(await db().from('categories').insert(input).select('*').single()) as Category;
}

export async function updateCategory(id: string, input: Partial<CategoryInput>): Promise<Category> {
  return unwrap(await db().from('categories').update(input).eq('id', id).select('*').single()) as Category;
}

export async function deleteCategory(id: string): Promise<void> {
  const { count, error } = await db()
    .from('projects')
    .select('id', { count: 'exact', head: true })
    .eq('category_id', id);
  if (error) throw error;
  if (count && count > 0) {
    throw new Error(`This category is assigned to ${count} project${count === 1 ? '' : 's'}. Reassign them first.`);
  }
  const rows = unwrap(await db().from('categories').delete().eq('id', id).select('id')) as { id: string }[];
  if (!rows.length) throw new Error('The category could not be deleted (not found or not permitted).');
}
