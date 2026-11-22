import { db, publicDb } from '@/lib/supabase';
import { unwrap } from '@/lib/errors';
import type { Project, ProjectWithCategory } from '@/types/database';

const WITH_CATEGORY = '*, category:categories(id, name, slug)';

export type ProjectInput = Omit<Project, 'id' | 'created_at' | 'updated_at' | 'published_at'>;

// ── Public ───────────────────────────────────────────────────────

export async function listPublishedProjects(): Promise<ProjectWithCategory[]> {
  const res = await publicDb()
    .from('projects')
    .select(WITH_CATEGORY)
    .eq('status', 'published')
    .order('display_order', { ascending: true })
    .order('published_at', { ascending: false });
  return unwrap(res) as ProjectWithCategory[];
}

export async function listFeaturedProjects(limit = 4): Promise<ProjectWithCategory[]> {
  const res = await publicDb()
    .from('projects')
    .select(WITH_CATEGORY)
    .eq('status', 'published')
    .eq('is_featured', true)
    .order('display_order', { ascending: true })
    .order('published_at', { ascending: false })
    .limit(limit);
  return unwrap(res) as ProjectWithCategory[];
}

export interface ProjectDetailsResult {
  project: ProjectWithCategory | null;
  previous: Pick<Project, 'slug' | 'title'> | null;
  next: Pick<Project, 'slug' | 'title'> | null;
}

export async function getPublishedProject(slug: string): Promise<ProjectDetailsResult> {
  const [projectRes, orderRes] = await Promise.all([
    publicDb().from('projects').select(WITH_CATEGORY).eq('status', 'published').eq('slug', slug).maybeSingle(),
    publicDb()
      .from('projects')
      .select('slug, title')
      .eq('status', 'published')
      .order('display_order', { ascending: true })
      .order('published_at', { ascending: false }),
  ]);
  const project = unwrap(projectRes) as ProjectWithCategory | null;
  const order = (unwrap(orderRes) ?? []) as Pick<Project, 'slug' | 'title'>[];
  const index = order.findIndex((p) => p.slug === slug);
  return {
    project,
    previous: index > 0 ? order[index - 1] : null,
    next: index >= 0 && index < order.length - 1 ? order[index + 1] : null,
  };
}

// ── Admin ────────────────────────────────────────────────────────

export async function listAllProjects(): Promise<ProjectWithCategory[]> {
  const res = await db()
    .from('projects')
    .select(WITH_CATEGORY)
    .order('display_order', { ascending: true })
    .order('created_at', { ascending: false });
  return unwrap(res) as ProjectWithCategory[];
}

export async function getProjectById(id: string): Promise<Project | null> {
  const res = await db().from('projects').select('*').eq('id', id).maybeSingle();
  return unwrap(res) as Project | null;
}

export async function isProjectSlugTaken(slug: string, excludeId?: string): Promise<boolean> {
  let q = db().from('projects').select('id').eq('slug', slug).limit(1);
  if (excludeId) q = q.neq('id', excludeId);
  const rows = unwrap(await q) as { id: string }[];
  return rows.length > 0;
}

export async function createProject(input: ProjectInput & { id?: string }): Promise<Project> {
  const res = await db().from('projects').insert(input).select('*').single();
  return unwrap(res) as Project;
}

export async function updateProject(id: string, input: Partial<ProjectInput>): Promise<Project> {
  const res = await db().from('projects').update(input).eq('id', id).select('*').single();
  return unwrap(res) as Project;
}

export async function deleteProject(id: string): Promise<void> {
  const res = await db().from('projects').delete().eq('id', id).select('id');
  const rows = unwrap(res) as { id: string }[];
  if (!rows.length) throw new Error('The project could not be deleted (not found or not permitted).');
}

/** Persists a new ordering: display_order = index * 10. */
export async function saveProjectOrder(ids: string[]): Promise<void> {
  const results = await Promise.all(
    ids.map((id, i) => db().from('projects').update({ display_order: i * 10 }).eq('id', id)),
  );
  const failed = results.find((r) => r.error);
  if (failed?.error) throw failed.error;
}
