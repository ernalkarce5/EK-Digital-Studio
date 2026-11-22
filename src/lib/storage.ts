import { MEDIA_BUCKET, SUPABASE_URL } from './supabase';
import { slugify } from './utils';

export const ACCEPTED_IMAGE_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/avif',
  'image/gif',
  'image/x-icon',
  'image/vnd.microsoft.icon',
] as const;

/** Bucket limit (enforced by Supabase Storage as well). */
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
/** Originals up to this size are accepted and compressed in the browser before upload. */
export const MAX_SOURCE_BYTES = 15 * 1024 * 1024;
const MAX_DIMENSION = 2400;

/** Public URL for a storage path in the media bucket. Absolute URLs pass through. */
export function mediaUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  if (/^https?:\/\//i.test(path)) return path;
  if (!SUPABASE_URL) return null;
  const encoded = path.split('/').map(encodeURIComponent).join('/');
  return `${SUPABASE_URL}/storage/v1/object/public/${MEDIA_BUCKET}/${encoded}`;
}

export function validateImageFile(file: File): string | null {
  if (!(ACCEPTED_IMAGE_TYPES as readonly string[]).includes(file.type)) {
    return `"${file.name}" is not a supported image. Use JPG, PNG, WebP, AVIF, GIF or ICO.`;
  }
  if (file.size > MAX_SOURCE_BYTES) {
    return `"${file.name}" is larger than 15 MB.`;
  }
  return null;
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error(`Could not read "${file.name}".`));
    };
    img.src = url;
  });
}

/**
 * Converts large JPEG/PNG images to WebP and caps their dimensions, so the
 * public site serves lighter images. Returns the original if conversion
 * does not reduce the size or is unsupported.
 */
export async function optimizeImage(file: File): Promise<File> {
  if (!['image/jpeg', 'image/png'].includes(file.type)) return file;
  try {
    const img = await loadImage(file);
    const scale = Math.min(1, MAX_DIMENSION / Math.max(img.naturalWidth, img.naturalHeight));
    const width = Math.round(img.naturalWidth * scale);
    const height = Math.round(img.naturalHeight * scale);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;
    ctx.drawImage(img, 0, 0, width, height);
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/webp', 0.86));
    if (!blob || blob.type !== 'image/webp' || blob.size >= file.size) return file;
    const name = file.name.replace(/\.[^.]+$/, '') + '.webp';
    return new File([blob], name, { type: 'image/webp' });
  } catch {
    return file;
  }
}

export function buildStoragePath(folder: string, fileName: string): string {
  const ext = (fileName.match(/\.([a-z0-9]+)$/i)?.[1] ?? 'bin').toLowerCase();
  const base = slugify(fileName.replace(/\.[^.]+$/, '')) || 'image';
  const stamp = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 6);
  return `${folder.replace(/^\/+|\/+$/g, '')}/${base}-${stamp}${rand}.${ext}`;
}

export function readImageDimensions(src: string): Promise<{ width: number; height: number } | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => resolve(null);
    img.src = src;
  });
}
