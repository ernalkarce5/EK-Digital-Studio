import { useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from '@/lib/zod';
import { AnimatePresence, motion } from 'framer-motion';
import { AlertCircle, CheckCircle2, Send } from 'lucide-react';
import { Button } from '@/components/common/Button';
import { FormField, Input, Select, Textarea } from './Field';
import { Link } from 'react-router';
import { submitContactMessage } from '@/services/messages';
import { publicErrorMessage } from '@/lib/errors';
import { isValidPhone, normalizePhone } from '@/lib/phone';
import { CONTACT_BUDGETS, CONTACT_METHODS, CONTACT_PROJECT_TYPES } from '@/lib/constants';

const PHONE_METHODS = ['phone', 'whatsapp'];

export const contactSchema = z
  .object({
  fullName: z.string().trim().min(2, 'Please enter your full name.').max(100, 'Name is too long.'),
  email: z.string().trim().max(254, 'Email is too long.').email('Please enter a valid email address.'),
  company: z.string().trim().max(120, 'Company name is too long.').optional(),
  projectType: z.enum(CONTACT_PROJECT_TYPES, { message: 'Please choose a project type.' }),
  budget: z.string().max(60).optional(),
  message: z
    .string()
    .trim()
    .min(20, 'Please describe your project in at least 20 characters.')
    .max(5000, 'Please keep the description under 5000 characters.'),
  preferredContact: z.string().optional(),
  phone: z.string().trim().max(30, 'Phone number is too long.').optional(),
  website: z.string().optional(),
  })
  // Phone is required (and validated) only for phone / WhatsApp contact. Mirrors the server rule.
  .superRefine((v, ctx) => {
    const needsPhone = PHONE_METHODS.includes(v.preferredContact ?? '');
    if (!needsPhone) return;
    if (!v.phone) {
      ctx.addIssue({ code: 'custom', path: ['phone'], message: 'Please enter a phone number so I can contact you that way.' });
    } else if (!isValidPhone(v.phone)) {
      ctx.addIssue({ code: 'custom', path: ['phone'], message: 'Please enter a valid phone number, e.g. +387 61 234 567.' });
    }
  });

type ContactValues = z.input<typeof contactSchema>;

const FIELD_MAP: Record<string, keyof ContactValues> = {
  fullName: 'fullName',
  email: 'email',
  projectType: 'projectType',
  message: 'message',
  phone: 'phone',
};

export function ContactForm({ defaultType }: { defaultType?: string }) {
  const renderedAt = useRef(Date.now());
  const [status, setStatus] = useState<'idle' | 'success'>('idle');
  const [serverError, setServerError] = useState<string | null>(null);

  const initialType = (CONTACT_PROJECT_TYPES as readonly string[]).includes(defaultType ?? '')
    ? (defaultType as ContactValues['projectType'])
    : undefined;

  const {
    register,
    handleSubmit,
    reset,
    setError,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<ContactValues>({
    resolver: zodResolver(contactSchema),
    defaultValues: { projectType: initialType, preferredContact: 'email' },
    mode: 'onTouched',
  });

  const messageLength = watch('message')?.length ?? 0;
  const preferredContact = watch('preferredContact');
  const showPhone = PHONE_METHODS.includes(preferredContact ?? '');

  const onSubmit = handleSubmit(async (values) => {
    setServerError(null);
    try {
      const result = await submitContactMessage({
        ...values,
        projectType: values.projectType,
        // Only sent when the visitor chose to be contacted by phone or WhatsApp.
        phone: showPhone && values.phone ? normalizePhone(values.phone) : undefined,
        elapsedMs: Date.now() - renderedAt.current,
      });
      if (result.ok) {
        setStatus('success');
        reset({ preferredContact: 'email' });
        return;
      }
      const field = result.field ? FIELD_MAP[result.field] : undefined;
      if (field) setError(field, { message: result.message }, { shouldFocus: true });
      else setServerError(result.message);
    } catch (err) {
      setServerError(publicErrorMessage(err, 'Your message could not be sent. Please try again or email directly.'));
    }
  });

  return (
    <AnimatePresence mode="wait" initial={false}>
      {status === 'success' ? (
        <motion.div
          key="success"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          role="status"
          className="flex flex-col items-start rounded-2xl border border-success/30 bg-success/[0.05] p-8 md:p-10"
        >
          <CheckCircle2 className="size-8 text-success" aria-hidden />
          <h2 className="mt-6 text-2xl font-medium tracking-tight">Thank you, your message has been sent.</h2>
          <p className="mt-3 max-w-md leading-relaxed text-muted">
            Your inquiry was received and saved. I will review the details and reply using your preferred contact method.
          </p>
          <Button
            variant="secondary"
            className="mt-8"
            onClick={() => {
              renderedAt.current = Date.now();
              setStatus('idle');
            }}
          >
            Send another message
          </Button>
        </motion.div>
      ) : (
        <motion.form
          key="form"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onSubmit={onSubmit}
          noValidate
          className="grid gap-5 sm:grid-cols-2"
          aria-describedby={serverError ? 'contact-server-error' : undefined}
        >
          <FormField label="Full name" htmlFor="fullName" required error={errors.fullName?.message}>
            <Input id="fullName" autoComplete="name" invalid={!!errors.fullName} {...register('fullName')} />
          </FormField>
          <FormField label="Email address" htmlFor="email" required error={errors.email?.message}>
            <Input id="email" type="email" autoComplete="email" inputMode="email" invalid={!!errors.email} {...register('email')} />
          </FormField>
          <FormField label="Company name" htmlFor="company" optional error={errors.company?.message}>
            <Input id="company" autoComplete="organization" invalid={!!errors.company} {...register('company')} />
          </FormField>
          <FormField label="Project type" htmlFor="projectType" required error={errors.projectType?.message}>
            <Select id="projectType" invalid={!!errors.projectType} defaultValue={initialType ?? ''} {...register('projectType')}>
              <option value="" disabled>
                Select a project type
              </option>
              {CONTACT_PROJECT_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField label="Estimated budget" htmlFor="budget" optional>
            <Select id="budget" defaultValue="" {...register('budget')}>
              <option value="">Prefer not to say</option>
              {CONTACT_BUDGETS.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField label="Preferred contact method" htmlFor="preferredContact" optional>
            <Select id="preferredContact" {...register('preferredContact')}>
              {CONTACT_METHODS.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </Select>
          </FormField>
          <AnimatePresence initial={false}>
            {showPhone && (
              <motion.div
                key="phone"
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.25 }}
                className="-m-1 overflow-hidden p-1 sm:col-span-2"
              >
                <FormField
                  label="Phone number"
                  htmlFor="phone"
                  required
                  error={errors.phone?.message}
                  hint={preferredContact === 'whatsapp' ? 'The number you use for WhatsApp, with country code.' : 'Include the country code, e.g. +387 61 234 567.'}
                  className="sm:max-w-[calc(50%-0.625rem)]"
                >
                  <Input id="phone" type="tel" autoComplete="tel" inputMode="tel" placeholder="+387 61 234 567" invalid={!!errors.phone} {...register('phone')} />
                </FormField>
              </motion.div>
            )}
          </AnimatePresence>
          <FormField
            label="Project description"
            htmlFor="message"
            required
            error={errors.message?.message}
            hint={`${messageLength}/5000 · Goals, timeline, links to examples you like…`}
            className="sm:col-span-2"
          >
            <Textarea id="message" rows={6} invalid={!!errors.message} {...register('message')} />
          </FormField>

          {/* Honeypot: hidden from people and assistive tech, attractive to bots. */}
          <div aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
            <label htmlFor="website">Website</label>
            <input id="website" type="text" tabIndex={-1} autoComplete="off" {...register('website')} />
          </div>

          {serverError && (
            <p
              id="contact-server-error"
              role="alert"
              className="flex gap-2.5 rounded-lg border border-danger/30 bg-danger/[0.06] p-3.5 text-sm text-danger sm:col-span-2"
            >
              <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
              {serverError}
            </p>
          )}

          <div className="flex flex-col gap-4 sm:col-span-2 sm:flex-row sm:items-center sm:justify-between">
            <p className="max-w-md text-xs leading-relaxed text-subtle">
              Your details are stored securely and used only to respond to this inquiry. See the{' '}
              <Link to="/privacy" className="text-muted underline underline-offset-2 hover:text-fg">
                Privacy Policy
              </Link>
              .
            </p>
            <Button type="submit" size="lg" icon={Send} loading={isSubmitting} className="w-full sm:w-auto">
              {isSubmitting ? 'Sending…' : 'Send message'}
            </Button>
          </div>
        </motion.form>
      )}
    </AnimatePresence>
  );
}
