import { useEffect } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from '@/lib/zod';
import { Save } from 'lucide-react';
import { AdminPageHeader, FormActions, Panel, SectionNav } from '@/components/admin/AdminUI';
import { ImageField } from '@/components/admin/MediaFields';
import { Button } from '@/components/common/Button';
import { ErrorState, LoadingBlock } from '@/components/common/Feedback';
import { FormField, Input, Select, Textarea } from '@/components/forms/Field';
import { DEFAULT_SETTINGS, useSite } from '@/contexts/SiteContext';
import { useToast } from '@/contexts/ToastContext';
import { useAsync } from '@/hooks/useAsync';
import { getSiteSettings, saveSiteSettings } from '@/services/site';
import { toErrorMessage } from '@/lib/errors';
import { AVAILABILITY_LABELS, SOCIAL_KEYS, SOCIAL_LABELS } from '@/lib/constants';
import { formatPhone, isValidPhone, normalizePhone } from '@/lib/phone';
import type { SiteSettings, SocialLinks } from '@/types/database';

const optionalEmail = z.union([z.literal(''), z.string().trim().email('Enter a valid email address.')]);

// Site Settings are the single source for social links, contact details and availability.
const socialUrl = z
  .string()
  .trim()
  .refine((v) => !v || /^https:\/\/[^\s]+\.[^\s]+$/i.test(v), 'Enter a full URL starting with https://');
const socialSchema = z.object(
  Object.fromEntries(SOCIAL_KEYS.map((k) => [k, socialUrl])) as Record<(typeof SOCIAL_KEYS)[number], typeof socialUrl>,
);
type SocialValues = z.infer<typeof socialSchema>;
const toSocialValues = (links: SocialLinks | null | undefined): SocialValues =>
  Object.fromEntries(SOCIAL_KEYS.map((k) => [k, links?.[k] ?? ''])) as SocialValues;
const fromSocialValues = (v: SocialValues): SocialLinks =>
  Object.fromEntries(SOCIAL_KEYS.filter((k) => v[k]?.trim()).map((k) => [k, v[k].trim()])) as SocialLinks;

const SECTIONS = [
  { id: 'settings-brand', label: 'Brand' },
  { id: 'settings-hero', label: 'Hero' },
  { id: 'settings-availability', label: 'Availability' },
  { id: 'settings-contact', label: 'Contact' },
  { id: 'settings-social', label: 'Social media' },
  { id: 'settings-seo', label: 'SEO & sharing' },
  { id: 'settings-images', label: 'Logo & icons' },
];

const schema = z.object({
  website_name: z.string().trim().min(1, 'Required.').max(80),
  studio_name: z.string().trim().min(1, 'Required.').max(80),
  tagline: z.string().max(160),
  description: z.string().max(500, 'Max 500 characters.'),
  hero_heading: z.string().trim().min(1, 'Required.').max(160, 'Max 160 characters.'),
  hero_subheading: z.string().max(400, 'Max 400 characters.'),
  logo_path: z.string().nullable(),
  favicon_path: z.string().nullable(),
  og_image_path: z.string().nullable(),
  seo_title: z.string().max(80, 'Max 80 characters (≈60 recommended).'),
  seo_description: z.string().max(200, 'Max 200 characters (≈155 recommended).'),
  contact_email: optionalEmail,
  contact_phone: z.string().max(40),
  whatsapp_number: z
    .string()
    .trim()
    .refine(
      (v) => !v || (isValidPhone(v) && !normalizePhone(v).replace(/^\+/, '').startsWith('0')),
      'Use international format with country code, e.g. +387 61 234 567.',
    ),
  location: z.string().max(120),
  footer_text: z.string().max(300),
  availability_status: z.enum(['available', 'limited', 'unavailable']),
  availability_note: z.string().max(160, 'Max 160 characters.'),
  social: socialSchema,
});
type Values = z.infer<typeof schema>;

const toValues = (s: SiteSettings): Values => ({
  website_name: s.website_name,
  studio_name: s.studio_name,
  tagline: s.tagline,
  description: s.description,
  hero_heading: s.hero_heading,
  hero_subheading: s.hero_subheading,
  logo_path: s.logo_path,
  favicon_path: s.favicon_path,
  og_image_path: s.og_image_path,
  seo_title: s.seo_title,
  seo_description: s.seo_description,
  contact_email: s.contact_email ?? '',
  contact_phone: s.contact_phone ?? '',
  whatsapp_number: s.whatsapp_number ? formatPhone(s.whatsapp_number, { international: true }) : '',
  location: s.location ?? '',
  footer_text: s.footer_text,
  availability_status: s.availability_status,
  availability_note: s.availability_note,
  social: toSocialValues(s.social_links),
});

export default function SettingsPage() {
  const { refresh } = useSite();
  const toast = useToast();
  const settings = useAsync(getSiteSettings, []);
  const {
    register,
    control,
    handleSubmit,
    reset,
    watch,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<Values>({ resolver: zodResolver(schema), defaultValues: toValues(DEFAULT_SETTINGS) });

  useEffect(() => {
    if (settings.data) reset(toValues(settings.data));
  }, [settings.data, reset]);

  const onSubmit = handleSubmit(
    async ({ social, ...v }) => {
      try {
        const saved = await saveSiteSettings({
          ...v,
          contact_email: v.contact_email || null,
          contact_phone: v.contact_phone.trim() || null,
          // Stored in international form without formatting (wa.me needs the country code).
          whatsapp_number: v.whatsapp_number ? normalizePhone(v.whatsapp_number).replace(/^\+/, '') : null,
          location: v.location.trim() || null,
          social_links: fromSocialValues(social),
        });
        reset(toValues(saved));
        await refresh();
        toast.success('Site settings saved. The public website is updated.');
      } catch (err) {
        toast.error(toErrorMessage(err, 'Settings could not be saved.'));
      }
    },
    () => toast.error('Please fix the highlighted fields.'),
  );

  if (settings.loading) return <LoadingBlock />;
  if (settings.error) return <ErrorState message={settings.error} onRetry={settings.reload} />;

  const seoTitle = watch('seo_title') ?? '';
  const seoDesc = watch('seo_description') ?? '';

  return (
    <form onSubmit={onSubmit} noValidate>
      <AdminPageHeader title="Site Settings" description="Global branding, availability, contact details, social links and search engine defaults." />
      <SectionNav sections={SECTIONS} />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="min-w-0 space-y-6 lg:col-span-2">
          <Panel id="settings-brand" title="Brand">
            <div className="grid gap-5 sm:grid-cols-2">
              <FormField label="Website name" htmlFor="website_name" required error={errors.website_name?.message}>
                <Input id="website_name" invalid={!!errors.website_name} {...register('website_name')} />
              </FormField>
              <FormField label="Studio name" htmlFor="studio_name" required error={errors.studio_name?.message}>
                <Input id="studio_name" invalid={!!errors.studio_name} {...register('studio_name')} />
              </FormField>
              <FormField label="Tagline" htmlFor="tagline" className="sm:col-span-2">
                <Input id="tagline" {...register('tagline')} />
              </FormField>
              <FormField label="Website description" htmlFor="description" error={errors.description?.message} hint="Used in the footer and as a fallback introduction." className="sm:col-span-2">
                <Textarea id="description" rows={3} {...register('description')} />
              </FormField>
            </div>
          </Panel>
          <Panel id="settings-hero" title="Home page hero">
            <div className="grid gap-5">
              <FormField label="Heading" htmlFor="hero_heading" required error={errors.hero_heading?.message} hint="The last word is set in the accent serif style.">
                <Input id="hero_heading" invalid={!!errors.hero_heading} {...register('hero_heading')} />
              </FormField>
              <FormField label="Supporting text" htmlFor="hero_subheading" error={errors.hero_subheading?.message}>
                <Textarea id="hero_subheading" rows={3} {...register('hero_subheading')} />
              </FormField>
            </div>
          </Panel>
          <Panel id="settings-availability" title="Availability" description="Shown as an indicator in the hero, on the About page and on the Contact page.">
            <div className="grid gap-5 sm:grid-cols-2">
              <FormField label="Status" htmlFor="availability_status">
                <Select id="availability_status" {...register('availability_status')}>
                  {Object.entries(AVAILABILITY_LABELS).map(([k, label]) => (
                    <option key={k} value={k}>
                      {label}
                    </option>
                  ))}
                </Select>
              </FormField>
              <FormField
                label="Custom message"
                htmlFor="availability_note"
                optional
                error={errors.availability_note?.message}
                hint="Overrides the default label, e.g. “Booking projects for March”."
              >
                <Input id="availability_note" {...register('availability_note')} />
              </FormField>
            </div>
          </Panel>
          <Panel id="settings-contact" title="Contact details" description="Shown in the footer and on the Contact page. Leave empty to hide.">
            <div className="grid gap-5 sm:grid-cols-2">
              <FormField label="Contact email" htmlFor="contact_email" error={errors.contact_email?.message}>
                <Input id="contact_email" type="email" invalid={!!errors.contact_email} {...register('contact_email')} />
              </FormField>
              <FormField label="Phone" htmlFor="contact_phone">
                <Input id="contact_phone" type="tel" {...register('contact_phone')} />
              </FormField>
              <FormField label="WhatsApp number" htmlFor="whatsapp_number" optional error={errors.whatsapp_number?.message} hint="With country code, e.g. +387 61 234 567. Creates a wa.me link.">
                <Input id="whatsapp_number" type="tel" invalid={!!errors.whatsapp_number} {...register('whatsapp_number')} />
              </FormField>
              <FormField label="Location" htmlFor="location">
                <Input id="location" {...register('location')} />
              </FormField>
              <FormField label="Footer text" htmlFor="footer_text" className="sm:col-span-2">
                <Input id="footer_text" {...register('footer_text')} />
              </FormField>
            </div>
          </Panel>
          <Panel id="settings-social" title="Social media" description="Shown in the footer, on the About page and on the Contact page.">
            <div className="grid gap-5 sm:grid-cols-2">
              {SOCIAL_KEYS.map((k) => (
                <FormField key={k} label={SOCIAL_LABELS[k]} htmlFor={`social-${k}`} optional error={errors.social?.[k]?.message}>
                  <Input id={`social-${k}`} type="url" placeholder="https://" invalid={!!errors.social?.[k]} {...register(`social.${k}`)} />
                </FormField>
              ))}
            </div>
          </Panel>
          <Panel id="settings-seo" title="Search engines & sharing">
            <div className="grid gap-5">
              <FormField label="SEO title" htmlFor="seo_title" error={errors.seo_title?.message} hint={`${seoTitle.length}/60 recommended. Used for the home page title.`}>
                <Input id="seo_title" {...register('seo_title')} />
              </FormField>
              <FormField label="SEO description" htmlFor="seo_description" error={errors.seo_description?.message} hint={`${seoDesc.length}/155 recommended.`}>
                <Textarea id="seo_description" rows={3} {...register('seo_description')} />
              </FormField>
            </div>
          </Panel>
        </div>
        <div className="min-w-0 space-y-6">
          <Panel id="settings-images" title="Logo">
            <Controller
              control={control}
              name="logo_path"
              render={({ field }) => (
                <ImageField label="Logo" value={field.value} onChange={field.onChange} folder="site" aspect="aspect-[3/1]" hint="Replaces the EK wordmark. Transparent PNG or WebP, height ≥ 64px." />
              )}
            />
          </Panel>
          <Panel title="Favicon">
            <Controller
              control={control}
              name="favicon_path"
              render={({ field }) => (
                <ImageField label="Favicon" value={field.value} onChange={field.onChange} folder="site" aspect="aspect-square max-w-32" hint="Square PNG or ICO, at least 64×64." />
              )}
            />
          </Panel>
          <Panel title="Social share image">
            <Controller
              control={control}
              name="og_image_path"
              render={({ field }) => (
                <ImageField
                  label="Open Graph image"
                  value={field.value}
                  onChange={field.onChange}
                  folder="site"
                  aspect="aspect-[1200/630]"
                  hint="1200×630 recommended. If empty, the built-in default share image is used."
                />
              )}
            />
          </Panel>
        </div>
      </div>
      <FormActions>
        <Button variant="secondary" onClick={() => settings.data && reset(toValues(settings.data))} disabled={!isDirty || isSubmitting}>
          Discard changes
        </Button>
        <Button type="submit" icon={Save} loading={isSubmitting}>
          Save settings
        </Button>
      </FormActions>
    </form>
  );
}
