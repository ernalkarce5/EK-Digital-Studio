import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from '@/lib/zod';
import { AlertCircle } from 'lucide-react';
import { Button } from '@/components/common/Button';
import { LoadingBlock } from '@/components/common/Feedback';
import { FormField, Input } from '@/components/forms/Field';
import { AREA_PATHS, useAuth, type AuthArea } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import { finishAuthLink, resolveAuthLink, type LinkResult, type LinkType } from '@/lib/authLink';
import { toErrorMessage } from '@/lib/errors';
import { AuthShell } from './AuthShell';

const schema = z
  .object({
    password: z.string().min(10, 'Use at least 10 characters.').max(72, 'Use at most 72 characters.'),
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, { path: ['confirm'], message: 'Passwords do not match.' });
type Values = z.infer<typeof schema>;

/** Moderators arrive here from an invitation or a password reset; admins only from a reset. */
const ALLOWED_LINKS: Record<AuthArea, readonly LinkType[]> = {
  admin: ['recovery'],
  moderator: ['invite', 'recovery'],
};

/**
 * Password reset page, also used as the moderator invitation landing page ("Set your password").
 * The form is shown only after the email link itself established a session that the Auth server
 * confirms. An unrelated session already stored in the browser is never used.
 */
export default function ResetPasswordPage({ area = 'admin' }: { area?: AuthArea }) {
  const { updatePassword } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const [link, setLink] = useState<LinkResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<Values>({ resolver: zodResolver(schema) });

  useEffect(() => {
    let active = true;
    resolveAuthLink(ALLOWED_LINKS[area])
      .catch((err: unknown): LinkResult => ({ status: 'invalid', reason: toErrorMessage(err) }))
      .then((r) => active && setLink(r));
    return () => {
      active = false;
    };
  }, [area]);

  const onSubmit = handleSubmit(async ({ password }) => {
    setError(null);
    try {
      await updatePassword(password);
      finishAuthLink();
      toast.success(area === 'moderator' && link?.status === 'ready' && link.type === 'invite' ? 'Password set. Welcome!' : 'Password updated.');
      navigate(AREA_PATHS[area].home, { replace: true });
    } catch (err) {
      // The link session was signed out or revoked meanwhile (e.g. Logout in another tab).
      setError(
        (err as { name?: string })?.name === 'AuthSessionMissingError'
          ? 'This link session has ended. Request a new link and try again.'
          : toErrorMessage(err),
      );
    }
  });

  const isInvite = link?.status === 'ready' && link.type === 'invite';
  const newLink = `${AREA_PATHS[area].home}/forgot-password`;

  return (
    <AuthShell title={area === 'moderator' ? 'Set your password' : 'Choose a new password'}>
      {!link ? (
        <LoadingBlock className="min-h-24" label="Verifying link…" />
      ) : link.status !== 'ready' ? (
        <div className="text-center" role="alert">
          <p className="text-sm text-muted">
            {link.status === 'expired'
              ? 'This link has expired or has already been used. Each link works only once.'
              : link.status === 'missing'
                ? 'Open this page from the link in your email.'
                : link.reason}
          </p>
          {area === 'moderator' && (
            <p className="mt-2 text-[13px] text-subtle">Request a new link below, or ask the administrator to send the invitation again.</p>
          )}
          <Button to={newLink} variant="secondary" className="mt-6 w-full">
            Request new link
          </Button>
        </div>
      ) : (
        <form onSubmit={onSubmit} noValidate className="space-y-5">
          <p className="text-sm text-muted">
            {isInvite ? 'Choose a password for' : 'Choose a new password for'} <strong className="font-medium text-fg">{link.user.email}</strong>.
          </p>
          <FormField label="New password" htmlFor="password" error={errors.password?.message} hint="At least 10 characters.">
            <Input id="password" type="password" autoComplete="new-password" invalid={!!errors.password} {...register('password')} />
          </FormField>
          <FormField label="Confirm password" htmlFor="confirm" error={errors.confirm?.message}>
            <Input id="confirm" type="password" autoComplete="new-password" invalid={!!errors.confirm} {...register('confirm')} />
          </FormField>
          {error && (
            <p role="alert" className="flex gap-2 text-sm text-danger">
              <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
              {error}
            </p>
          )}
          <Button type="submit" className="w-full" loading={isSubmitting}>
            {isInvite ? 'Set password' : 'Update password'}
          </Button>
        </form>
      )}
    </AuthShell>
  );
}
