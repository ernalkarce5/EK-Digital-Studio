import { useEffect, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from '@/lib/zod';
import { ArrowDown, ArrowUp, Pencil, Plus, Shapes, Trash2 } from 'lucide-react';
import { AdminPageHeader, IconButton, PublishBadge } from '@/components/admin/AdminUI';
import { Button } from '@/components/common/Button';
import { ConfirmDialog, Modal } from '@/components/common/Modal';
import { EmptyState, ErrorState, LoadingBlock } from '@/components/common/Feedback';
import { SERVICE_ICONS, ServiceIcon } from '@/components/common/ServiceIcon';
import { FormField, Input, Select, Switch, Textarea } from '@/components/forms/Field';
import { useToast } from '@/contexts/ToastContext';
import { useAsync } from '@/hooks/useAsync';
import { createService, deleteService, listAllServices, updateService } from '@/services/studioServices';
import { toErrorMessage } from '@/lib/errors';
import { cn, linesToList, listToLines, slugify, SLUG_PATTERN } from '@/lib/utils';
import type { Service } from '@/types/database';

const schema = z.object({
  title: z.string().trim().min(1, 'Title is required.').max(120),
  slug: z.string().trim().min(1, 'Slug is required.').max(120).regex(SLUG_PATTERN, 'Lowercase letters, numbers and hyphens only.'),
  summary: z.string().trim().min(1, 'A short summary is required.').max(400, 'Max 400 characters.'),
  description: z.string().max(5000, 'Max 5000 characters.'),
  benefits: z.string().max(3000),
  features: z.string().max(3000),
  icon: z.string(),
  is_published: z.boolean(),
});
type Values = z.infer<typeof schema>;

// Inputs start controlled (avoids React's uncontrolled → controlled warning).
const EMPTY_SERVICE: Values = {
  title: '',
  slug: '',
  summary: '',
  description: '',
  benefits: '',
  features: '',
  icon: 'layout',
  is_published: true,
};

function ServiceModal({
  open,
  service,
  nextOrder,
  onClose,
  onSaved,
}: {
  open: boolean;
  service: Service | null;
  nextOrder: number;
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const {
    register,
    handleSubmit,
    reset,
    control,
    setValue,
    watch,
    formState: { errors, isSubmitting, dirtyFields },
  } = useForm<Values>({ resolver: zodResolver(schema), defaultValues: EMPTY_SERVICE });

  useEffect(() => {
    if (!open) return;
    reset(
      service
        ? {
            title: service.title,
            slug: service.slug,
            summary: service.summary,
            description: service.description,
            benefits: listToLines(service.benefits),
            features: listToLines(service.features),
            icon: service.icon,
            is_published: service.is_published,
          }
        : EMPTY_SERVICE,
    );
  }, [open, service, reset]);

  const onSubmit = handleSubmit(async (v) => {
    const input = {
      title: v.title.trim(),
      slug: v.slug.trim(),
      summary: v.summary.trim(),
      description: v.description.trim(),
      benefits: linesToList(v.benefits),
      features: linesToList(v.features),
      icon: v.icon,
      is_published: v.is_published,
    };
    try {
      if (service) await updateService(service.id, input);
      else await createService({ ...input, display_order: nextOrder });
      toast.success(service ? 'Service updated.' : 'Service created.');
      onSaved();
      onClose();
    } catch (err) {
      toast.error(toErrorMessage(err));
    }
  });

  const icon = watch('icon');

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={service ? 'Edit service' : 'New service'}
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
        <FormField label="Title" htmlFor="svc-title" required error={errors.title?.message}>
          <Input
            id="svc-title"
            invalid={!!errors.title}
            {...register('title', {
              onChange: (e) => {
                if (!service && !dirtyFields.slug) setValue('slug', slugify(e.target.value));
              },
            })}
          />
        </FormField>
        <FormField label="Slug" htmlFor="svc-slug" required error={errors.slug?.message} hint="Anchor link on the Services page.">
          <Input id="svc-slug" invalid={!!errors.slug} {...register('slug')} />
        </FormField>
        <FormField label="Summary" htmlFor="svc-summary" required error={errors.summary?.message} className="sm:col-span-2">
          <Textarea id="svc-summary" rows={2} invalid={!!errors.summary} {...register('summary')} />
        </FormField>
        <FormField label="Description" htmlFor="svc-desc" error={errors.description?.message} hint="Separate paragraphs with a blank line." className="sm:col-span-2">
          <Textarea id="svc-desc" rows={5} {...register('description')} />
        </FormField>
        <FormField label="Benefits" htmlFor="svc-benefits" hint="One per line." error={errors.benefits?.message}>
          <Textarea id="svc-benefits" rows={5} {...register('benefits')} />
        </FormField>
        <FormField label="Included functionality" htmlFor="svc-features" hint="One per line." error={errors.features?.message}>
          <Textarea id="svc-features" rows={5} {...register('features')} />
        </FormField>
        <FormField label="Icon" htmlFor="svc-icon">
          <div className="flex items-center gap-3">
            <span className="grid size-11 shrink-0 place-items-center rounded-lg border border-line-strong bg-card text-accent-2">
              <ServiceIcon name={icon ?? 'layout'} className="size-5" />
            </span>
            <div className="flex-1">
              <Select id="svc-icon" {...register('icon')}>
                {Object.entries(SERVICE_ICONS).map(([key, { label }]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </Select>
            </div>
          </div>
        </FormField>
        <div className="flex items-end pb-2">
          <Controller
            control={control}
            name="is_published"
            render={({ field }) => <Switch checked={field.value} onChange={field.onChange} label="Published" />}
          />
        </div>
        <button type="submit" hidden />
      </form>
    </Modal>
  );
}

export default function ServicesAdminPage() {
  const toast = useToast();
  const { data, loading, error, reload, setData } = useAsync(listAllServices, []);
  const [editing, setEditing] = useState<Service | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [toDelete, setToDelete] = useState<Service | null>(null);
  const [busy, setBusy] = useState(false);
  const services = data ?? [];

  const open = (s: Service | null) => {
    setEditing(s);
    setModalOpen(true);
  };

  const move = async (index: number, delta: number) => {
    const next = [...services];
    const [item] = next.splice(index, 1);
    next.splice(index + delta, 0, item);
    setData(() => next.map((s, i) => ({ ...s, display_order: i + 1 })));
    setBusy(true);
    try {
      await Promise.all(next.map((s, i) => updateService(s.id, { display_order: i + 1 })));
    } catch (err) {
      toast.error(toErrorMessage(err, 'Could not save the new order.'));
      reload();
    } finally {
      setBusy(false);
    }
  };

  const togglePublish = async (s: Service) => {
    setBusy(true);
    try {
      await updateService(s.id, { is_published: !s.is_published });
      setData((list) => list?.map((x) => (x.id === s.id ? { ...x, is_published: !s.is_published } : x)));
      toast.success(s.is_published ? 'Service unpublished.' : 'Service published.');
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
      await deleteService(toDelete.id);
      setData((list) => list?.filter((x) => x.id !== toDelete.id));
      toast.success('Service deleted.');
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
        title="Services"
        description="Services shown on the home and Services pages. Describe what you offer honestly, without guarantees you cannot keep."
        actions={
          <Button size="sm" icon={Plus} onClick={() => open(null)}>
            New service
          </Button>
        }
      />
      {loading ? (
        <LoadingBlock />
      ) : error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : !services.length ? (
        <EmptyState icon={Shapes} title="No services yet" action={<Button size="sm" icon={Plus} onClick={() => open(null)}>New service</Button>} />
      ) : (
        <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-card">
          {services.map((s, i) => (
            <li key={s.id} className={cn('flex flex-col gap-3 p-3 sm:flex-row sm:items-center', busy && 'opacity-80')}>
              <div className="flex min-w-0 flex-1 items-center gap-3">
                <span className="grid size-10 shrink-0 place-items-center rounded-lg border border-line-strong text-accent-2">
                  <ServiceIcon name={s.icon} className="size-4" />
                </span>
                <div className="min-w-0">
                  <p className="truncate font-medium">{s.title}</p>
                  <p className="truncate text-sm text-muted">{s.summary}</p>
                </div>
              </div>
              <div className="flex items-center gap-0.5 self-end sm:self-auto">
                <PublishBadge published={s.is_published} />
                <IconButton label="Move up" onClick={() => void move(i, -1)} disabled={i === 0 || busy}>
                  <ArrowUp className="size-4" />
                </IconButton>
                <IconButton label="Move down" onClick={() => void move(i, 1)} disabled={i === services.length - 1 || busy}>
                  <ArrowDown className="size-4" />
                </IconButton>
                <Button size="sm" variant="ghost" onClick={() => void togglePublish(s)} disabled={busy}>
                  {s.is_published ? 'Unpublish' : 'Publish'}
                </Button>
                <IconButton label={`Edit ${s.title}`} onClick={() => open(s)}>
                  <Pencil className="size-4" />
                </IconButton>
                <IconButton label={`Delete ${s.title}`} tone="danger" onClick={() => setToDelete(s)} disabled={busy}>
                  <Trash2 className="size-4" />
                </IconButton>
              </div>
            </li>
          ))}
        </ul>
      )}
      <ServiceModal
        open={modalOpen}
        service={editing}
        nextOrder={(services.at(-1)?.display_order ?? 0) + 1}
        onClose={() => setModalOpen(false)}
        onSaved={reload}
      />
      <ConfirmDialog
        open={!!toDelete}
        title="Delete service?"
        message={<><strong className="text-fg">{toDelete?.title}</strong> will be permanently deleted.</>}
        busy={busy}
        onConfirm={() => void confirmDelete()}
        onCancel={() => setToDelete(null)}
      />
    </>
  );
}
