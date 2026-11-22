import { useEffect, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from '@/lib/zod';
import { Info, MessageSquareQuote, Pencil, Plus, Trash2 } from 'lucide-react';
import { AdminPageHeader, IconButton, PublishBadge } from '@/components/admin/AdminUI';
import { ImageField } from '@/components/admin/MediaFields';
import { Button } from '@/components/common/Button';
import { ConfirmDialog, Modal } from '@/components/common/Modal';
import { EmptyState, ErrorState, LoadingBlock } from '@/components/common/Feedback';
import { SmartImage } from '@/components/common/SmartImage';
import { FormField, Input, Select, Switch, Textarea } from '@/components/forms/Field';
import { useToast } from '@/contexts/ToastContext';
import { useAsync } from '@/hooks/useAsync';
import { createTestimonial, deleteTestimonial, listAllTestimonials, updateTestimonial } from '@/services/testimonials';
import { listAllProjects } from '@/services/projects';
import { toErrorMessage } from '@/lib/errors';
import type { Testimonial } from '@/types/database';

const schema = z.object({
  author_name: z.string().trim().min(1, 'Name is required.').max(100),
  author_role: z.string().max(120),
  company: z.string().max(120),
  content: z.string().trim().min(1, 'Testimonial text is required.').max(1500, 'Max 1500 characters.'),
  avatar_path: z.string().nullable(),
  project_id: z.string(),
  display_order: z.number({ message: 'Enter a number.' }).int(),
  is_published: z.boolean(),
  confirmed: z.boolean(),
});
type Values = z.infer<typeof schema>;

// Inputs start controlled (avoids React's uncontrolled → controlled warning).
const EMPTY_TESTIMONIAL: Values = {
  author_name: '',
  author_role: '',
  company: '',
  content: '',
  avatar_path: null,
  project_id: '',
  display_order: 0,
  is_published: false,
  confirmed: false,
};

function TestimonialModal({
  open,
  item,
  onClose,
  onSaved,
}: {
  open: boolean;
  item: Testimonial | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const projects = useAsync(() => (open ? listAllProjects() : Promise.resolve([])), [open]);
  const {
    register,
    handleSubmit,
    reset,
    control,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<Values>({ resolver: zodResolver(schema), defaultValues: EMPTY_TESTIMONIAL });

  useEffect(() => {
    if (!open) return;
    reset(
      item
        ? { ...item, project_id: item.project_id ?? '', confirmed: true }
        : EMPTY_TESTIMONIAL,
    );
  }, [open, item, reset]);

  const onSubmit = handleSubmit(async ({ confirmed, ...v }) => {
    if (v.is_published && !confirmed) {
      setError('confirmed', { message: 'Confirm this is a genuine testimonial before publishing.' });
      return;
    }
    const input = { ...v, project_id: v.project_id || null };
    try {
      if (item) await updateTestimonial(item.id, input);
      else await createTestimonial(input);
      toast.success(item ? 'Testimonial updated.' : 'Testimonial added.');
      onSaved();
      onClose();
    } catch (err) {
      toast.error(toErrorMessage(err));
    }
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={item ? 'Edit testimonial' : 'New testimonial'}
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => void onSubmit()} loading={isSubmitting}>
            Save
          </Button>
        </>
      }
    >
      <form onSubmit={onSubmit} noValidate className="grid gap-5 sm:grid-cols-2">
        <FormField label="Author name" htmlFor="t-name" required error={errors.author_name?.message}>
          <Input id="t-name" invalid={!!errors.author_name} {...register('author_name')} />
        </FormField>
        <FormField label="Role" htmlFor="t-role" optional>
          <Input id="t-role" placeholder="Owner, Marketing lead…" {...register('author_role')} />
        </FormField>
        <FormField label="Company" htmlFor="t-company" optional>
          <Input id="t-company" {...register('company')} />
        </FormField>
        <FormField label="Related project" htmlFor="t-project" optional>
          <Select id="t-project" {...register('project_id')}>
            <option value="">None</option>
            {projects.data?.map((p) => (
              <option key={p.id} value={p.id}>
                {p.title}
              </option>
            ))}
          </Select>
        </FormField>
        <FormField label="Testimonial" htmlFor="t-content" required error={errors.content?.message} className="sm:col-span-2">
          <Textarea id="t-content" rows={5} invalid={!!errors.content} {...register('content')} />
        </FormField>
        <Controller
          control={control}
          name="avatar_path"
          render={({ field }) => (
            <ImageField label="Photo (optional)" value={field.value} onChange={field.onChange} folder="testimonials" aspect="aspect-square max-w-40" />
          )}
        />
        <div className="flex flex-col gap-5">
          <FormField label="Display order" htmlFor="t-order">
            <Input id="t-order" type="number" {...register('display_order', { valueAsNumber: true })} />
          </FormField>
          <Controller
            control={control}
            name="is_published"
            render={({ field }) => <Switch checked={field.value} onChange={field.onChange} label="Published" />}
          />
          <div>
            <label className="flex cursor-pointer items-start gap-3 text-sm">
              <input type="checkbox" className="mt-1 size-4 accent-[var(--accent)]" {...register('confirmed')} />
              <span className="text-muted">
                This testimonial was given by a real client, and I have permission to publish it.
              </span>
            </label>
            {errors.confirmed && <p role="alert" className="mt-1.5 text-[13px] text-danger">{errors.confirmed.message}</p>}
          </div>
        </div>
        <button type="submit" hidden />
      </form>
    </Modal>
  );
}

export default function TestimonialsPage() {
  const toast = useToast();
  const { data, loading, error, reload, setData } = useAsync(listAllTestimonials, []);
  const [editing, setEditing] = useState<Testimonial | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [toDelete, setToDelete] = useState<Testimonial | null>(null);
  const [busy, setBusy] = useState(false);

  const open = (t: Testimonial | null) => {
    setEditing(t);
    setModalOpen(true);
  };

  const togglePublish = async (t: Testimonial) => {
    setBusy(true);
    try {
      await updateTestimonial(t.id, { is_published: !t.is_published });
      setData((list) => list?.map((x) => (x.id === t.id ? { ...x, is_published: !t.is_published } : x)));
      toast.success(t.is_published ? 'Testimonial unpublished.' : 'Testimonial published.');
    } catch (err) {
      toast.error(toErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const confirmDelete = async () => {
    if (!toDelete) return;
    setBusy(true);
    try {
      await deleteTestimonial(toDelete.id);
      setData((list) => list?.filter((x) => x.id !== toDelete.id));
      toast.success('Testimonial deleted.');
      setToDelete(null);
    } catch (err) {
      toast.error(toErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <AdminPageHeader
        title="Testimonials"
        description="Published testimonials appear on the home page. The section stays hidden until at least one is published."
        actions={
          <Button size="sm" icon={Plus} onClick={() => open(null)}>
            New testimonial
          </Button>
        }
      />
      <p className="mb-6 flex gap-2.5 rounded-lg border border-line bg-card p-3.5 text-sm text-muted">
        <Info className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden />
        Only add testimonials you actually received, with the client&apos;s permission. Never publish invented recommendations.
      </p>
      {loading ? (
        <LoadingBlock />
      ) : error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : !data?.length ? (
        <EmptyState icon={MessageSquareQuote} title="No testimonials yet" description="Add one when a client shares feedback you are allowed to publish." />
      ) : (
        <ul className="grid gap-4 md:grid-cols-2">
          {data.map((t) => (
            <li key={t.id} className="flex flex-col rounded-xl border border-line bg-card p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  {t.avatar_path && <SmartImage path={t.avatar_path} alt="" className="size-10 rounded-full" />}
                  <div>
                    <p className="font-medium">{t.author_name}</p>
                    <p className="text-xs text-muted">{[t.author_role, t.company].filter(Boolean).join(', ')}</p>
                  </div>
                </div>
                <PublishBadge published={t.is_published} />
              </div>
              <p className="mt-4 line-clamp-4 flex-1 text-sm leading-relaxed text-muted">{t.content}</p>
              <div className="mt-4 flex justify-end gap-0.5 border-t border-line pt-3">
                <Button size="sm" variant="ghost" onClick={() => void togglePublish(t)} disabled={busy}>
                  {t.is_published ? 'Unpublish' : 'Publish'}
                </Button>
                <IconButton label={`Edit testimonial by ${t.author_name}`} onClick={() => open(t)}>
                  <Pencil className="size-4" />
                </IconButton>
                <IconButton label={`Delete testimonial by ${t.author_name}`} tone="danger" onClick={() => setToDelete(t)} disabled={busy}>
                  <Trash2 className="size-4" />
                </IconButton>
              </div>
            </li>
          ))}
        </ul>
      )}
      <TestimonialModal open={modalOpen} item={editing} onClose={() => setModalOpen(false)} onSaved={reload} />
      <ConfirmDialog
        open={!!toDelete}
        title="Delete testimonial?"
        message={<>The testimonial by <strong className="text-fg">{toDelete?.author_name}</strong> will be permanently deleted.</>}
        busy={busy}
        onConfirm={() => void confirmDelete()}
        onCancel={() => setToDelete(null)}
      />
    </>
  );
}
