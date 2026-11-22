import { useMemo, useRef, useState } from 'react';
import { ArrowLeft, Copy, Folder, Images, Lock, Trash2, Upload } from 'lucide-react';
import { AdminPageHeader } from '@/components/admin/AdminUI';
import { Button } from '@/components/common/Button';
import { ConfirmDialog, Modal } from '@/components/common/Modal';
import { EmptyState, ErrorState, LoadingBlock } from '@/components/common/Feedback';
import { useToast } from '@/contexts/ToastContext';
import { useAsync } from '@/hooks/useAsync';
import { deleteMedia, getMediaUsage, listMedia, MEDIA_FOLDERS, uploadImage, type MediaEntry } from '@/services/media';
import { listAllProjects } from '@/services/projects';
import { ACCEPTED_IMAGE_TYPES, MAX_UPLOAD_BYTES, mediaUrl } from '@/lib/storage';
import { toErrorMessage } from '@/lib/errors';
import { cn, formatBytes, formatDate } from '@/lib/utils';

const FOLDER_LABELS: Record<string, string> = {
  projects: 'Projects',
  profile: 'Profile',
  site: 'Site (logo, favicon)',
  testimonials: 'Testimonials',
  general: 'General',
};

function MediaTile({
  entry,
  usedBy,
  onOpen,
}: {
  entry: MediaEntry;
  usedBy: string[] | undefined;
  onOpen: (dims: string | null) => void;
}) {
  const [dims, setDims] = useState<string | null>(null);
  return (
    <button
      type="button"
      onClick={() => onOpen(dims)}
      className="group flex w-full flex-col overflow-hidden rounded-lg border border-line bg-card text-left transition-colors hover:border-line-strong"
    >
      <div className="relative aspect-square w-full overflow-hidden bg-bg-2">
        <img
          src={mediaUrl(entry.path) ?? ''}
          alt={entry.name}
          loading="lazy"
          onLoad={(e) => setDims(`${e.currentTarget.naturalWidth}×${e.currentTarget.naturalHeight}`)}
          className="size-full object-cover transition-transform duration-500 group-hover:scale-105"
        />
        {usedBy && (
          <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded bg-bg/85 px-1.5 py-0.5 text-[10px] text-fg backdrop-blur">
            <Lock className="size-3" aria-hidden /> In use
          </span>
        )}
      </div>
      <div className="px-2.5 py-2">
        <p className="truncate text-xs" title={entry.name}>
          {entry.name}
        </p>
        <p className="mt-0.5 font-mono text-[10px] text-subtle">
          {[dims, entry.size != null ? formatBytes(entry.size) : null].filter(Boolean).join(' · ') || '…'}
        </p>
      </div>
    </button>
  );
}

export default function MediaPage() {
  const toast = useToast();
  const input = useRef<HTMLInputElement>(null);
  const [folder, setFolder] = useState<string>('projects');
  const [uploading, setUploading] = useState(0);
  const [preview, setPreview] = useState<{ entry: MediaEntry; dims: string | null } | null>(null);
  const [toDelete, setToDelete] = useState<MediaEntry | null>(null);
  const [deleting, setDeleting] = useState(false);

  const listing = useAsync(() => listMedia(folder), [folder]);
  const usage = useAsync(getMediaUsage, []);
  const projects = useAsync(listAllProjects, []);
  const projectTitles = useMemo(() => new Map((projects.data ?? []).map((p) => [p.id, p.title])), [projects.data]);

  const root = folder.split('/')[0];
  const isRootProjects = folder === 'projects';
  const folderLabel = (entry: MediaEntry) =>
    root === 'projects' ? (projectTitles.get(entry.name) ?? `Project ${entry.name.slice(0, 8)}… (deleted?)`) : entry.name;
  const title = folder.startsWith('projects/') ? (projectTitles.get(folder.split('/')[1]) ?? folder) : FOLDER_LABELS[folder] ?? folder;

  const upload = async (files: FileList | null) => {
    if (!files?.length) return;
    const list = Array.from(files);
    setUploading(list.length);
    let ok = 0;
    for (const f of list) {
      try {
        await uploadImage(f, folder);
        ok++;
      } catch (err) {
        toast.error(toErrorMessage(err, `Upload of ${f.name} failed.`));
      } finally {
        setUploading((n) => n - 1);
      }
    }
    if (ok) toast.success(`${ok} image${ok === 1 ? '' : 's'} uploaded.`);
    if (input.current) input.current.value = '';
    listing.reload();
  };

  const confirmDelete = async () => {
    if (!toDelete) return;
    setDeleting(true);
    try {
      await deleteMedia(toDelete.path);
      listing.setData((l) => l?.filter((e) => e.path !== toDelete.path));
      toast.success('Image deleted.');
      setToDelete(null);
      setPreview(null);
    } catch (err) {
      toast.error(toErrorMessage(err));
    } finally {
      setDeleting(false);
    }
  };

  const files = (listing.data ?? []).filter((e) => !e.isFolder);
  const folders = (listing.data ?? []).filter((e) => e.isFolder);
  const previewUsedBy = preview ? usage.data?.get(preview.entry.path) : undefined;

  return (
    <>
      <AdminPageHeader
        title="Media Library"
        description={`Images stored in Supabase Storage. JPG, PNG, WebP, AVIF, GIF or ICO, up to ${formatBytes(MAX_UPLOAD_BYTES)} after compression. Images used by content cannot be deleted.`}
        actions={
          !isRootProjects && (
            <Button size="sm" icon={Upload} onClick={() => input.current?.click()} loading={uploading > 0}>
              {uploading > 0 ? `Uploading ${uploading}…` : 'Upload images'}
            </Button>
          )
        }
      />
      <input
        ref={input}
        type="file"
        multiple
        accept={ACCEPTED_IMAGE_TYPES.join(',')}
        className="sr-only"
        tabIndex={-1}
        aria-label="Upload images"
        onChange={(e) => void upload(e.target.files)}
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[220px_1fr]">
        <nav aria-label="Media folders" className="min-w-0">
          <ul className="flex gap-1 overflow-x-auto lg:flex-col">
            {MEDIA_FOLDERS.map((f) => (
              <li key={f} className="shrink-0">
                <button
                  type="button"
                  onClick={() => setFolder(f)}
                  className={cn(
                    'flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm transition-colors',
                    root === f ? 'bg-card text-fg' : 'text-muted hover:bg-fg/[0.04] hover:text-fg',
                  )}
                >
                  <Folder className="size-4" aria-hidden /> {FOLDER_LABELS[f]}
                </button>
              </li>
            ))}
          </ul>
        </nav>

        <section aria-label={title} className="min-w-0">
          <div className="mb-4 flex items-center gap-2">
            {folder.includes('/') && (
              <Button size="sm" variant="ghost" icon={ArrowLeft} onClick={() => setFolder(root)}>
                Back
              </Button>
            )}
            <h2 className="font-medium">{title}</h2>
          </div>
          {isRootProjects && (
            <p className="mb-4 text-sm text-muted">
              Project images are organised in one folder per project. Upload them from the project editor, or open a folder here.
            </p>
          )}

          {listing.loading ? (
            <LoadingBlock />
          ) : listing.error ? (
            <ErrorState message={listing.error} onRetry={listing.reload} />
          ) : !folders.length && !files.length ? (
            <EmptyState icon={Images} title="This folder is empty" description={isRootProjects ? 'Images uploaded in the project editor will appear here.' : 'Upload images to get started.'} />
          ) : (
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
              {folders.map((f) => (
                <li key={f.path}>
                  <button
                    type="button"
                    onClick={() => setFolder(f.path)}
                    className="flex aspect-square w-full flex-col items-center justify-center gap-2 rounded-lg border border-line bg-card p-3 text-center text-xs text-muted transition-colors hover:border-line-strong hover:text-fg"
                  >
                    <Folder className="size-7" aria-hidden />
                    <span className="line-clamp-2">{folderLabel(f)}</span>
                  </button>
                </li>
              ))}
              {files.map((entry) => (
                <li key={entry.path}>
                  <MediaTile entry={entry} usedBy={usage.data?.get(entry.path)} onOpen={(dims) => setPreview({ entry, dims })} />
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <Modal open={!!preview} onClose={() => setPreview(null)} title={preview?.entry.name ?? ''} size="lg">
        {preview && (
          <div className="grid gap-5 md:grid-cols-[1fr_220px]">
            <img src={mediaUrl(preview.entry.path) ?? ''} alt={preview.entry.name} className="max-h-[60dvh] w-full rounded-lg bg-bg object-contain" />
            <div className="space-y-4 text-sm">
              <dl className="space-y-3">
                <div>
                  <dt className="text-xs text-subtle">Dimensions</dt>
                  <dd>{preview.dims ?? 'Unknown'}</dd>
                </div>
                <div>
                  <dt className="text-xs text-subtle">Size</dt>
                  <dd>{preview.entry.size != null ? formatBytes(preview.entry.size) : 'Unknown'}</dd>
                </div>
                <div>
                  <dt className="text-xs text-subtle">Type</dt>
                  <dd>{preview.entry.mimeType ?? 'Unknown'}</dd>
                </div>
                <div>
                  <dt className="text-xs text-subtle">Uploaded</dt>
                  <dd>{formatDate(preview.entry.createdAt)}</dd>
                </div>
                <div>
                  <dt className="text-xs text-subtle">Used by</dt>
                  <dd>{previewUsedBy?.length ? previewUsedBy.join(', ') : 'Not used'}</dd>
                </div>
              </dl>
              <div className="flex flex-col gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  icon={Copy}
                  onClick={() => {
                    navigator.clipboard
                      .writeText(mediaUrl(preview.entry.path) ?? '')
                      .then(() => toast.success('URL copied.'))
                      .catch(() => toast.error('Could not copy the URL.'));
                  }}
                >
                  Copy URL
                </Button>
                <Button
                  size="sm"
                  variant="danger"
                  icon={Trash2}
                  disabled={!!previewUsedBy?.length}
                  onClick={() => setToDelete(preview.entry)}
                >
                  Delete
                </Button>
                {!!previewUsedBy?.length && <p className="text-xs text-subtle">Remove it from the content above before deleting.</p>}
              </div>
            </div>
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={!!toDelete}
        title="Delete image?"
        message={<><strong className="text-fg">{toDelete?.name}</strong> will be permanently removed from storage.</>}
        busy={deleting}
        onConfirm={() => void confirmDelete()}
        onCancel={() => setToDelete(null)}
      />
    </>
  );
}
