import { useEffect, useState } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from '@/lib/zod';
import { Pencil, Plus, Tags, Trash2 } from 'lucide-react';
import { AdminPageHeader, IconButton, PublishBadge } from '@/components/admin/AdminUI';
import { Button } from '@/components/common/Button';
import { ConfirmDialog, Modal } from '@/components/common/Modal';
import { EmptyState, ErrorState, LoadingBlock } from '@/components/common/Feedback';
import { FormField, Input, Switch, Textarea } from '@/components/forms/Field';
import { useToast } from '@/contexts/ToastContext';
import { useAsync } from '@/hooks/useAsync';
import {
  createCategory,
  deleteCategory,
  listCategoriesWithCounts,
  updateCategory,
  type CategoryWithCount,
} from '@/services/categories';
import { toErrorMessage } from '@/lib/errors';
import { slugify, SLUG_PATTERN } from '@/lib/utils';

const schema = z.object({
  name: z.string().trim().min(1, 'Name is required.').max(60, 'Max 60 characters.'),
  slug: z.string().trim().min(1, 'Slug is required.').max(80).regex(SLUG_PATTERN, 'Lowercase letters, numbers and hyphens only.'),
  description: z.string().max(500, 'Max 500 characters.'),
  display_order: z.number({ message: 'Enter a number.' }).int(),
  is_published: z.boolean(),
});
type Values = z.infer<typeof schema>;

// Inputs start controlled (avoids React's uncontrolled → controlled warning).
const EMPTY_CATEGORY: Values = { name: '', slug: '', description: '', display_order: 0, is_published: true };

function CategoryModal({
  open,
  category,
  onClose,
  onSaved,
}: {
  open: boolean;
  category: CategoryWithCount | null;
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
    formState: { errors, isSubmitting, dirtyFields },
  } = useForm<Values>({ resolver: zodResolver(schema), defaultValues: EMPTY_CATEGORY });

  useEffect(() => {
    if (open)
      reset(
        category
          ? { name: category.name, slug: category.slug, description: category.description, display_order: category.display_order, is_published: category.is_published }
          : EMPTY_CATEGORY,
      );
  }, [open, category, reset]);

  const onSubmit = handleSubmit(async (v) => {
    try {
      if (category) await updateCategory(category.id, v);
      else await createCategory(v);
      toast.success(category ? 'Category updated.' : 'Category created.');
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
      title={category ? 'Edit category' : 'New category'}
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
      <form onSubmit={onSubmit} noValidate className="grid gap-5">
        <FormField label="Name" htmlFor="cat-name" required error={errors.name?.message}>
          <Input
            id="cat-name"
            invalid={!!errors.name}
            {...register('name', {
              onChange: (e) => {
                if (!category && !dirtyFields.slug) setValue('slug', slugify(e.target.value));
              },
            })}
          />
        </FormField>
        <FormField label="Slug" htmlFor="cat-slug" required error={errors.slug?.message} hint="Used in filter URLs.">
          <Input id="cat-slug" invalid={!!errors.slug} {...register('slug')} />
        </FormField>
        <FormField label="Description" htmlFor="cat-desc" optional error={errors.description?.message}>
          <Textarea id="cat-desc" rows={3} {...register('description')} />
        </FormField>
        <FormField label="Display order" htmlFor="cat-order" error={errors.display_order?.message}>
          <Input id="cat-order" type="number" {...register('display_order', { valueAsNumber: true })} />
        </FormField>
        <Controller
          control={control}
          name="is_published"
          render={({ field }) => (
            <Switch checked={field.value} onChange={field.onChange} label="Visible on website" description="Hidden categories do not appear in the project filter." />
          )}
        />
        <button type="submit" hidden />
      </form>
    </Modal>
  );
}

export default function CategoriesPage() {
  const toast = useToast();
  const { data, loading, error, reload, setData } = useAsync(listCategoriesWithCounts, []);
  const [editing, setEditing] = useState<CategoryWithCount | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [toDelete, setToDelete] = useState<CategoryWithCount | null>(null);
  const [deleting, setDeleting] = useState(false);

  const openEditor = (c: CategoryWithCount | null) => {
    setEditing(c);
    setModalOpen(true);
  };

  const confirmDelete = async () => {
    if (!toDelete) return;
    setDeleting(true);
    try {
      await deleteCategory(toDelete.id);
      setData((list) => list?.filter((c) => c.id !== toDelete.id));
      toast.success('Category deleted.');
      setToDelete(null);
    } catch (err) {
      toast.error(toErrorMessage(err));
    } finally {
      setDeleting(false);
    }
  };

  return (
    <>
      <AdminPageHeader
        title="Categories"
        description="Categories group projects and power the filter on the Projects page. Categories in use cannot be deleted."
        actions={
          <Button size="sm" icon={Plus} onClick={() => openEditor(null)}>
            New category
          </Button>
        }
      />
      {loading ? (
        <LoadingBlock />
      ) : error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : !data?.length ? (
        <EmptyState icon={Tags} title="No categories" action={<Button size="sm" icon={Plus} onClick={() => openEditor(null)}>New category</Button>} />
      ) : (
        <>
        {/* Small screens: one card per category. */}
        <ul className="grid gap-3 md:hidden">
          {data.map((c) => (
            <li key={c.id} className="rounded-xl border border-line bg-card p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium">{c.name}</p>
                  <p className="mt-0.5 truncate font-mono text-xs text-muted">/{c.slug}</p>
                </div>
                <PublishBadge published={c.is_published} />
              </div>
              <div className="mt-3 flex items-center justify-between gap-3 border-t border-line pt-3">
                <p className="text-sm text-muted">
                  {c.project_count} project{c.project_count === 1 ? '' : 's'} · order {c.display_order}
                </p>
                <div className="flex">
                  <IconButton label={`Edit ${c.name}`} onClick={() => openEditor(c)}>
                    <Pencil className="size-4" />
                  </IconButton>
                  <IconButton
                    label={c.project_count > 0 ? 'In use: reassign its projects before deleting' : `Delete ${c.name}`}
                    tone="danger"
                    onClick={() => setToDelete(c)}
                    disabled={c.project_count > 0}
                  >
                    <Trash2 className="size-4" />
                  </IconButton>
                </div>
              </div>
            </li>
          ))}
        </ul>
        {/* md and up: table. */}
        <div className="hidden overflow-x-auto rounded-xl border border-line bg-card md:block">
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-subtle">
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium">Slug</th>
                <th className="px-4 py-3 font-medium">Projects</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Order</th>
                <th className="px-4 py-3"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {data.map((c) => (
                <tr key={c.id}>
                  <td className="px-4 py-3 font-medium">{c.name}</td>
                  <td className="px-4 py-3 font-mono text-xs text-muted">{c.slug}</td>
                  <td className="px-4 py-3 text-muted">{c.project_count}</td>
                  <td className="px-4 py-3"><PublishBadge published={c.is_published} /></td>
                  <td className="px-4 py-3 text-muted">{c.display_order}</td>
                  <td className="px-2 py-1.5">
                    <div className="flex justify-end">
                      <IconButton label={`Edit ${c.name}`} onClick={() => openEditor(c)}>
                        <Pencil className="size-4" />
                      </IconButton>
                      <IconButton
                        label={c.project_count > 0 ? 'In use: reassign its projects before deleting' : `Delete ${c.name}`}
                        tone="danger"
                        onClick={() => setToDelete(c)}
                        disabled={c.project_count > 0}
                      >
                        <Trash2 className="size-4" />
                      </IconButton>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        </>
      )}

      <CategoryModal open={modalOpen} category={editing} onClose={() => setModalOpen(false)} onSaved={reload} />
      <ConfirmDialog
        open={!!toDelete}
        title="Delete category?"
        message={<>The category <strong className="text-fg">{toDelete?.name}</strong> will be permanently deleted.</>}
        busy={deleting}
        onConfirm={() => void confirmDelete()}
        onCancel={() => setToDelete(null)}
      />
    </>
  );
}
