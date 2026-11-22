import { useState } from 'react';
import { Link } from 'react-router';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from '@/lib/zod';
import { AlertCircle, MailCheck } from 'lucide-react';
import { Button } from '@/components/common/Button';
import { FormField, Input } from '@/components/forms/Field';
import { useAuth } from '@/contexts/AuthContext';
import { toErrorMessage } from '@/lib/errors';
import { AuthShell } from './AuthShell';

const schema = z.object({ email: z.string().trim().email('Enter a valid email address.') });
type Values = z.infer<typeof schema>;

export default function ForgotPasswordPage() {
  const { sendPasswordReset } = useAuth();
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<Values>({ resolver: zodResolver(schema) });

  const onSubmit = handleSubmit(async ({ email }) => {
    setError(null);
    try {
      await sendPasswordReset(email);
      setSent(true);
    } catch (err) {
      setError(toErrorMessage(err));
    }
  });

  return (
    <AuthShell title="Reset password" description="We will email you a link to choose a new password.">
      {sent ? (
        <div role="status" className="text-center">
          <MailCheck className="mx-auto size-8 text-success" aria-hidden />
          <p className="mt-4 text-sm leading-relaxed text-muted">
            If an administrator account exists for that address, a reset link is on its way. The link expires after a
            short time.
          </p>
          <Button to="/admin/login" variant="secondary" className="mt-6 w-full">
            Back to sign in
          </Button>
        </div>
      ) : (
        <form onSubmit={onSubmit} noValidate className="space-y-5">
          <FormField label="Email" htmlFor="email" error={errors.email?.message}>
            <Input id="email" type="email" autoComplete="email" invalid={!!errors.email} {...register('email')} />
          </FormField>
          {error && (
            <p role="alert" className="flex gap-2 text-sm text-danger">
              <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
              {error}
            </p>
          )}
          <Button type="submit" className="w-full" loading={isSubmitting}>
            Send reset link
          </Button>
          <p className="text-center text-sm">
            <Link to="/admin/login" className="text-muted hover:text-fg">
              Back to sign in
            </Link>
          </p>
        </form>
      )}
    </AuthShell>
  );
}
