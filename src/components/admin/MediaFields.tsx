import { useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Folder, FolderOpen, ImagePlus, Images, Trash2, Upload, X } from 'lucide-react';
import { Button } from '@/components/common/Button';
import { Modal } from '@/components/common/Modal';
import { SmartImage } from '@/components/common/SmartImage';
import { EmptyState, ErrorState, LoadingBlock } from '@/components/common/Feedback';
import { useToast } from '@/contexts/ToastContext';
import { useAsync } from '@/hooks/useAsync';
import { listMedia, uploadImage, MEDIA_FOLDERS } from '@/services/media';
import { ACCEPTED_IMAGE_TYPES } from '@/lib/storage';
import { toErrorMessage } from '@/lib/errors';
import { cn } from '@/lib/utils';

const ACCEPT = ACCEPTED_IMAGE_TYPES.join(',');

/** Modal to pick an existing image from the media library. */
export function MediaPickerModal({
  open,
  onClose,
  onSelect,
  initialFolder,
}: {
  open: boolean;
  onClose: () => void;
  onSelect: (path: string) => void;
  initialFolder: string;
}) {
  const [folder, setFolder] = useState(initialFolder);
  const { data, loading, error, reload } = useAsync(
    () => (open ? listMedia(folder) : Promise.resolve([])),
    [folder, open],
  );
  const parent = folder.includes('/') ? folder.slice(0, folder.lastIndexOf('/')) : '';

  return (
    <Modal open={open} onClose={onClose} title="Choose from media library" description={`/${folder || ''}`} size="lg">
      <div className="mb-4 flex flex-wrap gap-1.5">
        {folder && (
          <Button size="sm" variant="ghost" icon={ArrowLeft} onClick={() => setFolder(parent)}>
            Up
          </Button>
        )}
        {MEDIA_FOLDERS.map((f) => (
          <Button key={f} size="sm" variant={folder === f ? 'secondary' : 'ghost'} onClick={() => setFolder(f)}>
            {f}
          </Button>
        ))}
      </div>
      {loading ? (
        <LoadingBlock />
      ) : error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : !data?.length ? (
        <EmptyState icon={Images} title="No images in this folder" description="Upload images from the field or Media Library." />
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
          {data.map((entry) =>
            entry.isFolder ? (
              <li key={entry.path}>
                <button
                  type="button"
                  onClick={() => setFolder(entry.path)}
                  className="flex aspect-square w-full flex-col items-center justify-center gap-2 rounded-lg border border-line bg-bg-2 p-2 text-xs text-muted hover:border-line-strong hover:text-fg"
                >
                  <Folder className="size-6" aria-hidden />
                  <span className="w-full truncate text-center">{entry.name}</span>
                </button>
              </li>
            ) : (
              <li key={entry.path}>
                <button
                  type="button"
                  onClick={() => {
                    onSelect(entry.path);
                    onClose();
                  }}
                  className="group block w-full overflow-hidden rounded-lg border border-line text-left hover:border-accent"
                >
                  <SmartImage path={entry.path} alt={entry.name} className="aspect-square w-full" />
                  <span className="block truncate px-2 py-1.5 text-[11px] text-muted group-hover:text-fg">{entry.name}</span>
                </button>
              </li>
            ),
          )}
        </ul>
      )}
    </Modal>
  );
}

/** Single image field: upload or pick, preview, clear. Stores the storage path. */
export function ImageField({
  label,
  value,
  onChange,
  folder,
  aspect = 'aspect-video',
  hint,
}: {
  label: string;
  value: string | null;
  onChange: (path: string | null) => void;
  folder: string;
  aspect?: string;
  hint?: string;
}) {
  const toast = useToast();
  const input = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [picker, setPicker] = useState(false);

  const upload = async (file: File | undefined) => {
    if (!file) return;
    setUploading(true);
    try {
      const path = await uploadImage(file, folder);
      onChange(path);
      toast.success('Image uploaded.');
    } catch (err) {
      toast.error(toErrorMessage(err, 'Upload failed.'));
    } finally {
      setUploading(false);
      if (input.current) input.current.value = '';
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <span className="text-sm font-medium">{label}</span>
      <div className={cn('relative overflow-hidden rounded-lg border border-line-strong bg-bg-2', aspect)}>
        {value ? (
          <SmartImage path={value} alt={label} className="size-full" imgClassName="object-contain" />
        ) : (
          <button
            type="button"
            onClick={() => input.current?.click()}
            className="flex size-full flex-col items-center justify-center gap-2 text-sm text-muted hover:text-fg"
          >
            <ImagePlus className="size-6" aria-hidden />
            Upload image
          </button>
        )}
        {uploading && <LoadingBlock label="Uploading…" className="absolute inset-0 min-h-0 bg-bg/80" />}
      </div>
      <div className="flex flex-wrap gap-1.5">
        <Button size="sm" variant="secondary" icon={Upload} onClick={() => input.current?.click()} disabled={uploading}>
          {value ? 'Replace' : 'Upload'}
        </Button>
        <Button size="sm" variant="ghost" icon={FolderOpen} onClick={() => setPicker(true)} disabled={uploading}>
          Library
        </Button>
        {value && (
          <Button size="sm" variant="ghost" icon={X} onClick={() => onChange(null)} disabled={uploading}>
            Remove
          </Button>
        )}
      </div>
      {hint && <p className="text-[13px] text-subtle">{hint}</p>}
      <input
        ref={input}
        type="file"
        accept={ACCEPT}
        className="sr-only"
        tabIndex={-1}
        aria-label={`Upload ${label}`}
        onChange={(e) => void upload(e.target.files?.[0])}
      />
      <MediaPickerModal open={picker} onClose={() => setPicker(false)} onSelect={onChange} initialFolder={folder} />
    </div>
  );
}

/** Ordered list of gallery images with multi-upload, picking, reordering and removal. */
export function GalleryField({
  value,
  onChange,
  folder,
}: {
  value: string[];
  onChange: (paths: string[]) => void;
  folder: string;
}) {
  const toast = useToast();
  const input = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(0);
  const [picker, setPicker] = useState(false);

  const upload = async (files: FileList | null) => {
    if (!files?.length) return;
    const list = Array.from(files);
    setUploading(list.length);
    const added: string[] = [];
    for (const file of list) {
      try {
        added.push(await uploadImage(file, folder));
      } catch (err) {
        toast.error(toErrorMessage(err, `Upload of ${file.name} failed.`));
      } finally {
        setUploading((n) => n - 1);
      }
    }
    if (added.length) {
      onChange([...value, ...added]);
      toast.success(`${added.length} image${added.length === 1 ? '' : 's'} added.`);
    }
    if (input.current) input.current.value = '';
  };

  const move = (i: number, d: number) => {
    const next = [...value];
    const [item] = next.splice(i, 1);
    next.splice(i + d, 0, item);
    onChange(next);
  };

  return (
    <div className="flex flex-col gap-3">
      {value.length > 0 ? (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {value.map((path, i) => (
            <li key={path} className="overflow-hidden rounded-lg border border-line bg-bg-2">
              <SmartImage path={path} alt={`Gallery image ${i + 1}`} className="aspect-video w-full" />
              <div className="flex items-center justify-between px-1.5 py-1">
                <span className="pl-1 font-mono text-[11px] text-subtle">#{i + 1}</span>
                <div className="flex">
                  <button type="button" className="rounded p-1.5 text-muted hover:text-fg disabled:opacity-30" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Move image earlier">
                    <ArrowLeft className="size-3.5" />
                  </button>
                  <button type="button" className="rounded p-1.5 text-muted hover:text-fg disabled:opacity-30" onClick={() => move(i, 1)} disabled={i === value.length - 1} aria-label="Move image later">
                    <ArrowRight className="size-3.5" />
                  </button>
                  <button type="button" className="rounded p-1.5 text-muted hover:text-danger" onClick={() => onChange(value.filter((p) => p !== path))} aria-label="Remove image from gallery">
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="rounded-lg border border-dashed border-line-strong px-4 py-6 text-center text-sm text-muted">
          No gallery images yet.
        </p>
      )}
      <div className="flex flex-wrap gap-1.5">
        <Button size="sm" variant="secondary" icon={Upload} onClick={() => input.current?.click()} loading={uploading > 0}>
          {uploading > 0 ? `Uploading ${uploading}…` : 'Upload images'}
        </Button>
        <Button size="sm" variant="ghost" icon={FolderOpen} onClick={() => setPicker(true)}>
          Add from library
        </Button>
      </div>
      <input
        ref={input}
        type="file"
        multiple
        accept={ACCEPT}
        className="sr-only"
        tabIndex={-1}
        aria-label="Upload gallery images"
        onChange={(e) => void upload(e.target.files)}
      />
      <MediaPickerModal
        open={picker}
        onClose={() => setPicker(false)}
        onSelect={(p) => !value.includes(p) && onChange([...value, p])}
        initialFolder={folder}
      />
    </div>
  );
}
