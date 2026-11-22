import { useEffect } from 'react';
import { Link } from 'react-router';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from '@/lib/zod';
import { Info, Save, UserX } from 'lucide-react';
import { AdminPageHeader, FormActions, Panel, SectionNav } from '@/components/admin/AdminUI';
import { ImageField } from '@/components/admin/MediaFields';
import { TagInput } from '@/components/admin/TagInput';
import { Button } from '@/components/common/Button';
import { EmptyState, ErrorState, LoadingBlock } from '@/components/common/Feedback';
import { FormField, Input, Switch, Textarea } from '@/components/forms/Field';
import { useAuth } from '@/contexts/AuthContext';
import { useSite } from '@/contexts/SiteContext';
import { useToast } from '@/contexts/ToastContext';
import { useAsync } from '@/hooks/useAsync';
import { getOwnProfile, updateOwnProfile } from '@/services/site';
import { toErrorMessage } from '@/lib/errors';
import type { Profile } from '@/types/database';

// Contact email, location, social links and availability are managed in
// Site Settings only (single source of truth).
const schema = z.object({
  full_name: z.string().trim().min(1, 'Name is required.').max(120),
  professional_title: z.string().max(160),
  short_intro: z.string().max(800, 'Max 800 characters.'),
  biography: z.string().max(6000, 'Max 6000 characters.'),
  background: z.string().max(4000, 'Max 4000 characters.'),
  experience: z.string().max(4000, 'Max 4000 characters.'),
  approach: z.string().max(4000, 'Max 4000 characters.'),
  philosophy: z.string().max(4000, 'Max 4000 characters.'),
  technologies: z.array(z.string()),
  avatar_path: z.string().nullable(),
  is_public: z.boolean(),
});
type Values = z.infer<typeof schema>;

const toValues = (p: Profile): Values => ({
  full_name: p.full_name,
  professional_title: p.professional_title,
  short_intro: p.short_intro,
  biography: p.biography,
  background: p.background,
  experience: p.experience,
  approach: p.approach,
  philosophy: p.philosophy,
  technologies: p.technologies,
  avatar_path: p.avatar_path,
  is_public: p.is_public,
});

const SECTIONS = [
  { id: 'profile-identity', label: 'Identity' },
  { id: 'profile-about', label: 'About page' },
  { id: 'profile-image', label: 'Image' },
  { id: 'profile-visibility', label: 'Visibility' },
];

export default function ProfilePage() {
  const { user } = useAuth();
  const { refresh } = useSite();
  const toast = useToast();
  const profile = useAsync(() => getOwnProfile(user!.id), [user?.id]);
  const {
    register,
    control,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<Values>({ resolver: zodResolver(schema) });

  useEffect(() => {
    if (profile.data) reset(toValues(profile.data));
  }, [profile.data, reset]);

  const onSubmit = handleSubmit(
    async (v) => {
      try {
        const saved = await updateOwnProfile(user!.id, v);
        reset(toValues(saved));
        await refresh();
        toast.success('Profile saved.');
      } catch (err) {
        toast.error(toErrorMessage(err, 'The profile could not be saved.'));
      }
    },
    () => toast.error('Please fix the highlighted fields.'),
  );

  if (profile.loading) return <LoadingBlock />;
  if (profile.error) return <ErrorState message={profile.error} onRetry={profile.reload} />;
  if (!profile.data) {
    return <EmptyState icon={UserX} title="No profile row found" description="Run the admin setup SQL from the README to create your profile." />;
  }

  return (
    <form onSubmit={onSubmit} noValidate>
      <AdminPageHeader title="Profile" description="Your personal information, shown on the Home and About pages." />
      <p className="mb-6 flex gap-2.5 rounded-lg border border-line bg-card p-3.5 text-sm text-muted">
        <Info className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden />
        <span>
          Contact email, location, social links and availability are managed in{' '}
          <Link to="/admin/settings" className="text-fg underline underline-offset-2">
            Site Settings
          </Link>
          .
        </span>
      </p>
      <SectionNav sections={SECTIONS} />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="min-w-0 space-y-6 lg:col-span-2">
          <Panel id="profile-identity" title="Identity">
            <div className="grid gap-5 sm:grid-cols-2">
              <FormField label="Name" htmlFor="full_name" required error={errors.full_name?.message}>
                <Input id="full_name" invalid={!!errors.full_name} {...register('full_name')} />
              </FormField>
              <FormField label="Professional title" htmlFor="professional_title">
                <Input id="professional_title" {...register('professional_title')} />
              </FormField>
              <FormField label="Short introduction" htmlFor="short_intro" error={errors.short_intro?.message} hint="Shown on the home page introduction." className="sm:col-span-2">
                <Textarea id="short_intro" rows={3} {...register('short_intro')} />
              </FormField>
              <FormField label="Biography" htmlFor="biography" error={errors.biography?.message} hint="Separate paragraphs with a blank line." className="sm:col-span-2">
                <Textarea id="biography" rows={6} {...register('biography')} />
              </FormField>
            </div>
          </Panel>
          <Panel id="profile-about" title="About page sections" description="Leave a section empty to hide it. Only include facts you can stand behind.">
            <div className="grid gap-5">
              <FormField label="Professional background" htmlFor="background" error={errors.background?.message}>
                <Textarea id="background" rows={4} {...register('background')} />
              </FormField>
              <FormField label="Programming & web development experience" htmlFor="experience" error={errors.experience?.message}>
                <Textarea id="experience" rows={4} {...register('experience')} />
              </FormField>
              <FormField label="Approach to projects" htmlFor="approach" error={errors.approach?.message}>
                <Textarea id="approach" rows={4} {...register('approach')} />
              </FormField>
              <FormField label="Working philosophy" htmlFor="philosophy" error={errors.philosophy?.message}>
                <Textarea id="philosophy" rows={4} {...register('philosophy')} />
              </FormField>
              <FormField label="Technologies I work with" htmlFor="technologies">
                <Controller
                  control={control}
                  name="technologies"
                  render={({ field }) => <TagInput id="technologies" value={field.value ?? []} onChange={field.onChange} />}
                />
              </FormField>
            </div>
          </Panel>
        </div>
        <div className="min-w-0 space-y-6">
          <Panel id="profile-image" title="Profile image">
            <Controller
              control={control}
              name="avatar_path"
              render={({ field }) => (
                <ImageField label="Portrait" value={field.value ?? null} onChange={field.onChange} folder="profile" aspect="aspect-[4/5]" />
              )}
            />
          </Panel>
          <Panel id="profile-visibility" title="Visibility">
            <Controller
              control={control}
              name="is_public"
              render={({ field }) => (
                <Switch checked={!!field.value} onChange={field.onChange} label="Show on public website" description="Only one profile can be public." />
              )}
            />
          </Panel>
        </div>
      </div>
      <FormActions>
        <Button variant="secondary" onClick={() => profile.data && reset(toValues(profile.data))} disabled={!isDirty || isSubmitting}>
          Discard changes
        </Button>
        <Button type="submit" icon={Save} loading={isSubmitting}>
          Save profile
        </Button>
      </FormActions>
    </form>
  );
}
