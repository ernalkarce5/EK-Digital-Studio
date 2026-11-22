import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from '@/lib/zod';
import { ArrowLeft, ExternalLink, FileX, Info, Save, Send } from 'lucide-react';
import { AdminPageHeader, FormActions, Panel, PublishBadge, SectionNav } from '@/components/admin/AdminUI';
import { GalleryField, ImageField } from '@/components/admin/MediaFields';
import { TagInput } from '@/components/admin/TagInput';
import { Button } from '@/components/common/Button';
import { EmptyState, ErrorState, LoadingBlock } from '@/components/common/Feedback';
import { FormField, Input, Select, Switch, Textarea } from '@/components/forms/Field';
import { useToast } from '@/contexts/ToastContext';
import { useAsync } from '@/hooks/useAsync';
import { listCategoriesWithCounts } from '@/services/categories';
import { createProject, getProjectById, isProjectSlugTaken, updateProject, type ProjectInput } from '@/services/projects';
import { PROJECT_TYPE_HINTS, PROJECT_TYPE_LABELS } from '@/lib/constants';
import { toErrorMessage } from '@/lib/errors';
import { cn, linesToList, listToLines, slugify, SLUG_PATTERN } from '@/lib/utils';
import type { Project, PublicationStatus } from '@/types/database';

const schema = z.object({
  title: z.string().trim().min(1, 'Title is required.').max(140, 'Max 140 characters.'),
  slug: z
    .string()
    .trim()
    .min(1, 'Slug is required.')
    .max(120, 'Max 120 characters.')
    .regex(SLUG_PATTERN, 'Use lowercase letters, numbers and single hyphens (e.g. my-project).'),
  short_description: z.string().trim().min(1, 'A short description is required.').max(300, 'Max 300 characters.'),
  full_description: z.string().max(10000, 'Max 10,000 characters.'),
  objectives: z.string().max(5000),
  features: z.string().max(5000),
  category_id: z.string(),
  project_type: z.enum(['demo', 'personal', 'client']),
  technologies: z.array(z.string()),
  cover_image_path: z.string().nullable(),
  cover_image_alt: z.string().max(200, 'Max 200 characters.'),
  gallery_images: z.array(z.string()),
  live_demo_url: z
    .string()
    .trim()
    .refine((v) => !v || /^https?:\/\/[^\s]+\.[^\s]+$/i.test(v), 'Enter a full URL starting with https://'),
  is_featured: z.boolean(),
  display_order: z.number({ message: 'Enter a number.' }).int('Whole numbers only.').min(-100000).max(100000),
});
type Values = z.infer<typeof schema>;

const EDITOR_SECTIONS = [
  { id: 'project-type', label: 'Type' },
  { id: 'project-content', label: 'Content' },
  { id: 'project-images', label: 'Images' },
  { id: 'project-classification', label: 'Classification' },
  { id: 'project-display', label: 'Display' },
];

const EMPTY: Values = {
  title: '',
  slug: '',
  short_description: '',
  full_description: '',
  objectives: '',
  features: '',
  category_id: '',
  project_type: 'demo',
  technologies: [],
  cover_image_path: null,
  cover_image_alt: '',
  gallery_images: [],
  live_demo_url: '',
  is_featured: false,
  display_order: 0,
};

function toValues(p: Project): Values {
  return {
    title: p.title,
    slug: p.slug,
    short_description: p.short_description,
    full_description: p.full_description,
    objectives: listToLines(p.objectives),
    features: listToLines(p.features),
    category_id: p.category_id ?? '',
    project_type: p.project_type,
    technologies: p.technologies,
    cover_image_path: p.cover_image_path,
    cover_image_alt: p.cover_image_alt,
    gallery_images: p.gallery_images,
    live_demo_url: p.live_demo_url ?? '',
    is_featured: p.is_featured,
    display_order: p.display_order,
  };
}

function toInput(v: Values, status: PublicationStatus): ProjectInput {
  return {
    title: v.title.trim(),
    slug: v.slug.trim(),
    short_description: v.short_description.trim(),
    full_description: v.full_description.trim(),
    objectives: linesToList(v.objectives),
    features: linesToList(v.features),
    category_id: v.category_id || null,
    project_type: v.project_type,
    technologies: v.technologies,
    cover_image_path: v.cover_image_path,
    cover_image_alt: v.cover_image_alt.trim(),
    gallery_images: v.gallery_images,
    live_demo_url: v.live_demo_url.trim() || null,
    is_featured: v.is_featured,
    display_order: v.display_order,
    status,
  };
}

export default function ProjectEditorPage() {
  const { id } = useParams();
  const isNew = !id;
  const navigate = useNavigate();
  const toast = useToast();
  // New projects get their id up front so uploads can be organised under projects/<id>.
  const [projectId] = useState(() => id ?? crypto.randomUUID());
  const [slugTouched, setSlugTouched] = useState(!isNew);
  const [currentStatus, setCurrentStatus] = useState<PublicationStatus>('draft');

  const project = useAsync(() => (isNew ? Promise.resolve(null) : getProjectById(id)), [id]);
  const categories = useAsync(listCategoriesWithCounts, []);

  const {
    register,
    control,
    handleSubmit,
    reset,
    setValue,
    setError,
    watch,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<Values>({ resolver: zodResolver(schema), defaultValues: EMPTY });

  useEffect(() => {
    if (project.data) {
      reset(toValues(project.data));
      setCurrentStatus(project.data.status);
    }
  }, [project.data, reset]);

  const title = watch('title');
  useEffect(() => {
    if (!slugTouched) setValue('slug', slugify(title ?? ''), { shouldValidate: false });
  }, [title, slugTouched, setValue]);

  useEffect(() => {
    if (!isDirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [isDirty]);

  const save = (status: PublicationStatus) =>
    handleSubmit(async (values) => {
      try {
        if (await isProjectSlugTaken(values.slug.trim(), isNew ? undefined : projectId)) {
          setError('slug', { message: 'This slug is already used by another project.' }, { shouldFocus: true });
          return;
        }
        const input = toInput(values, status);
        if (isNew) {
          await createProject({ ...input, id: projectId });
          toast.success(status === 'published' ? 'Project created and published.' : 'Project saved as draft.');
          reset(values);
          navigate(`/admin/projects/${projectId}`, { replace: true });
        } else {
          const saved = await updateProject(projectId, input);
          setCurrentStatus(saved.status);
          reset(toValues(saved));
          toast.success(
            status === currentStatus ? 'Changes saved.' : status === 'published' ? 'Project published.' : 'Project moved to drafts.',
          );
        }
      } catch (err) {
        toast.error(toErrorMessage(err, 'The project could not be saved.'));
      }
    }, () => toast.error('Please fix the highlighted fields.'));

  if (project.loading) return <LoadingBlock />;
  if (project.error) return <ErrorState message={project.error} onRetry={project.reload} />;
  if (!isNew && !project.data) {
    return (
      <EmptyState
        icon={FileX}
        title="Project not found"
        description="It may have been deleted."
        action={
          <Button to="/admin/projects" size="sm" variant="secondary">
            Back to projects
          </Button>
        }
      />
    );
  }

  const folder = `projects/${projectId}`;
  const slug = watch('slug');
  const projectType = watch('project_type');

  return (
    <form onSubmit={(e) => e.preventDefault()} noValidate>
      <Link to="/admin/projects" className="mb-4 inline-flex items-center gap-2 text-sm text-muted hover:text-fg">
        <ArrowLeft className="size-4" aria-hidden /> All projects
      </Link>
      <AdminPageHeader
        title={isNew ? 'New project' : 'Edit project'}
        description={
          isNew ? (
            'New projects are saved as drafts unless you publish them.'
          ) : (
            <span className="inline-flex items-center gap-2">
              Status: <PublishBadge published={currentStatus === 'published'} />
            </span>
          )
        }
        actions={
          !isNew && currentStatus === 'published' ? (
            <Button href={`/projects/${slug}`} target="_blank" rel="noopener noreferrer" size="sm" variant="secondary" icon={ExternalLink}>
              View live
            </Button>
          ) : undefined
        }
      />

      <SectionNav sections={EDITOR_SECTIONS} />

      {/* Project type first and prominent: it decides how the project is labelled publicly. */}
      <Panel
        id="project-type"
        title="Project type"
        description="Shown as a badge on the project card and page, so visitors know exactly what kind of work this is."
        className="mb-6"
      >
        {isNew && (
          <p className="mb-4 flex gap-2.5 rounded-lg border border-warning/30 bg-warning/[0.06] p-3 text-sm text-muted">
            <Info className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
            <span>
              New projects start as <strong className="text-fg">Demo Project</strong>, the safe default. Change it to
              Personal or Client Project if that is what this work is.
            </span>
          </p>
        )}
        <div role="radiogroup" aria-label="Project type" className="grid gap-3 sm:grid-cols-3">
          {(['demo', 'personal', 'client'] as const).map((t) => (
            <label
              key={t}
              className={cn(
                'relative flex cursor-pointer flex-col gap-1 rounded-lg border p-4 transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-accent',
                projectType === t ? 'border-accent bg-accent-soft' : 'border-line-strong hover:border-fg/30',
              )}
            >
              <input type="radio" value={t} className="sr-only" {...register('project_type')} />
              <span className="flex items-center justify-between gap-2">
                <span className="font-medium">{PROJECT_TYPE_LABELS[t]}</span>
                <span
                  className={cn(
                    'grid size-4 place-items-center rounded-full border',
                    projectType === t ? 'border-accent bg-accent' : 'border-line-strong',
                  )}
                  aria-hidden
                >
                  {projectType === t && <span className="size-1.5 rounded-full bg-white" />}
                </span>
              </span>
              <span className="text-[13px] leading-snug text-muted">{PROJECT_TYPE_HINTS[t]}</span>
            </label>
          ))}
        </div>
      </Panel>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="min-w-0 space-y-6 lg:col-span-2">
          <Panel id="project-content" title="Content">
            <div className="grid gap-5">
              <FormField label="Title" htmlFor="title" required error={errors.title?.message}>
                <Input id="title" invalid={!!errors.title} {...register('title')} />
              </FormField>
              <FormField
                label="Slug"
                htmlFor="slug"
                required
                error={errors.slug?.message}
                hint={`URL: /projects/${slug || 'your-slug'}`}
              >
                <Input
                  id="slug"
                  invalid={!!errors.slug}
                  {...register('slug', { onChange: () => setSlugTouched(true) })}
                />
              </FormField>
              <FormField
                label="Short description"
                htmlFor="short_description"
                required
                error={errors.short_description?.message}
                hint="Shown on project cards and in search results. Max 300 characters."
              >
                <Textarea id="short_description" rows={3} invalid={!!errors.short_description} {...register('short_description')} />
              </FormField>
              <FormField
                label="Full description"
                htmlFor="full_description"
                error={errors.full_description?.message}
                hint="Separate paragraphs with a blank line."
              >
                <Textarea id="full_description" rows={8} {...register('full_description')} />
              </FormField>
              <FormField label="Project objectives" htmlFor="objectives" hint="One objective per line.">
                <Textarea id="objectives" rows={4} {...register('objectives')} />
              </FormField>
              <FormField label="Implemented features" htmlFor="features" hint="One feature per line.">
                <Textarea id="features" rows={5} {...register('features')} />
              </FormField>
            </div>
          </Panel>

          <Panel id="project-images" title="Images" description="JPEG and PNG uploads are converted to WebP automatically.">
            <div className="grid gap-6">
              <Controller
                control={control}
                name="cover_image_path"
                render={({ field }) => (
                  <ImageField label="Cover image" value={field.value} onChange={field.onChange} folder={folder} hint="Recommended 1600×1000 or larger." />
                )}
              />
              <FormField label="Cover image alt text" htmlFor="cover_image_alt" error={errors.cover_image_alt?.message} hint="Describe the image for screen readers.">
                <Input id="cover_image_alt" {...register('cover_image_alt')} />
              </FormField>
              <div>
                <p className="mb-2 text-sm font-medium">Gallery images</p>
                <Controller
                  control={control}
                  name="gallery_images"
                  render={({ field }) => <GalleryField value={field.value} onChange={field.onChange} folder={folder} />}
                />
              </div>
            </div>
          </Panel>
        </div>

        <div className="min-w-0 space-y-6">
          <Panel id="project-classification" title="Classification">
            <div className="grid gap-5">
              <FormField
                label="Category"
                htmlFor="category_id"
                error={categories.error ?? undefined}
                hint={<Link to="/admin/categories" className="underline-offset-2 hover:underline">Manage categories</Link>}
              >
                <Select id="category_id" disabled={categories.loading} {...register('category_id')}>
                  <option value="">Uncategorized</option>
                  {categories.data?.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                      {!c.is_published ? ' (hidden)' : ''}
                    </option>
                  ))}
                </Select>
              </FormField>
              <FormField label="Technologies" htmlFor="technologies" hint="Press Enter or comma to add.">
                <Controller
                  control={control}
                  name="technologies"
                  render={({ field }) => <TagInput id="technologies" value={field.value} onChange={field.onChange} placeholder="React, Supabase…" />}
                />
              </FormField>
            </div>
          </Panel>

          <Panel id="project-display" title="Display">
            <div className="grid gap-5">
              <FormField label="Live demo URL" htmlFor="live_demo_url" optional error={errors.live_demo_url?.message}>
                <Input id="live_demo_url" type="url" placeholder="https://" invalid={!!errors.live_demo_url} {...register('live_demo_url')} />
              </FormField>
              <FormField label="Display order" htmlFor="display_order" error={errors.display_order?.message} hint="Lower numbers appear first.">
                <Input id="display_order" type="number" step={1} invalid={!!errors.display_order} {...register('display_order', { valueAsNumber: true })} />
              </FormField>
              <Controller
                control={control}
                name="is_featured"
                render={({ field }) => (
                  <Switch checked={field.value} onChange={field.onChange} label="Featured project" description="Shown in Selected Work on the home page." />
                )}
              />
            </div>
          </Panel>
        </div>
      </div>

      <FormActions>
        {!isNew && currentStatus === 'published' ? (
          <>
            <Button variant="ghost" onClick={() => void save('draft')()} disabled={isSubmitting}>
              Unpublish
            </Button>
            <Button icon={Save} onClick={() => void save('published')()} loading={isSubmitting}>
              Save changes
            </Button>
          </>
        ) : (
          <>
            <Button variant="secondary" icon={Save} onClick={() => void save('draft')()} loading={isSubmitting}>
              Save draft
            </Button>
            <Button icon={Send} onClick={() => void save('published')()} disabled={isSubmitting}>
              Publish
            </Button>
          </>
        )}
      </FormActions>
    </form>
  );
}
