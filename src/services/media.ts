import { db, MEDIA_BUCKET } from '@/lib/supabase';
import { unwrap } from '@/lib/errors';
import { buildStoragePath, MAX_UPLOAD_BYTES, optimizeImage, validateImageFile } from '@/lib/storage';
import { formatBytes } from '@/lib/utils';

export interface MediaEntry {
  /** Full path inside the bucket. */
  path: string;
  name: string;
  isFolder: boolean;
  size: number | null;
  mimeType: string | null;
  createdAt: string | null;
}

/** Top-level folders used to organise uploads. */
export const MEDIA_FOLDERS = ['projects', 'profile', 'site', 'testimonials', 'general'] as const;

export async function listMedia(folder: string): Promise<MediaEntry[]> {
  const { data, error } = await db()
    .storage.from(MEDIA_BUCKET)
    .list(folder, { limit: 1000, sortBy: { column: 'created_at', order: 'desc' } });
  if (error) throw error;
  return (data ?? [])
    .filter((o) => o.name !== '.emptyFolderPlaceholder')
    .map((o) => {
      const meta = (o.metadata ?? null) as { size?: number; mimetype?: string } | null;
      return {
        path: folder ? `${folder}/${o.name}` : o.name,
        name: o.name,
        isFolder: o.id === null,
        size: meta?.size ?? null,
        mimeType: meta?.mimetype ?? null,
        createdAt: o.created_at ?? null,
      };
    });
}

/** Validates, optimises (JPEG/PNG → WebP) and uploads an image. Returns its storage path. */
export async function uploadImage(file: File, folder: string): Promise<string> {
  const invalid = validateImageFile(file);
  if (invalid) throw new Error(invalid);
  const optimized = await optimizeImage(file);
  if (optimized.size > MAX_UPLOAD_BYTES) {
    throw new Error(`"${file.name}" is ${formatBytes(optimized.size)} after compression; the limit is 5 MB.`);
  }
  const path = buildStoragePath(folder, optimized.name);
  const { error } = await db().storage.from(MEDIA_BUCKET).upload(path, optimized, {
    cacheControl: '31536000',
    contentType: optimized.type,
    upsert: false,
  });
  if (error) throw error;
  return path;
}

/** Map of storage path → human-readable description of where it is used. */
export async function getMediaUsage(): Promise<Map<string, string[]>> {
  const rows = unwrap(await db().rpc('media_usage')) as { path: string; used_by: string }[];
  const map = new Map<string, string[]>();
  for (const r of rows ?? []) map.set(r.path, [...(map.get(r.path) ?? []), r.used_by]);
  return map;
}

/**
 * Deletes an image. The database policy refuses to delete images that are
 * referenced by content; Storage reports that as "nothing deleted", which we
 * surface as an error instead of failing silently.
 */
export async function deleteMedia(path: string): Promise<void> {
  const usedBy = unwrap(await db().rpc('media_in_use', { p_path: path })) as string | null;
  if (usedBy) throw new Error(`This image is used by ${usedBy}. Remove it there first.`);
  const { data, error } = await db().storage.from(MEDIA_BUCKET).remove([path]);
  if (error) throw error;
  if (!data || data.length === 0) {
    throw new Error('The image could not be deleted. It may be in use or already removed.');
  }
}
