import { useState } from 'react';
import { useNavigate } from 'react-router';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from '@/lib/zod';
import { AlertCircle } from 'lucide-react';
import { Button } from '@/components/common/Button';
import { LoadingBlock } from '@/components/common/Feedback';
import { FormField, Input } from '@/components/forms/Field';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import { toErrorMessage } from '@/lib/errors';
import { AuthShell } from './AuthShell';

const schema = z
  .object({
    password: z.string().min(10, 'Use at least 10 characters.').max(72, 'Use at most 72 characters.'),
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, { path: ['confirm'], message: 'Passwords do not match.' });
type Values = z.infer<typeof schema>;

export default function ResetPasswordPage() {
  const { session, loading, updatePassword } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const [error, setError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<Values>({ resolver: zodResolver(schema) });

  const onSubmit = handleSubmit(async ({ password }) => {
    setError(null);
    try {
      await updatePassword(password);
      toast.success('Password updated.');
      navigate('/admin', { replace: true });
    } catch (err) {
      setError(toErrorMessage(err));
    }
  });

  return (
    <AuthShell title="Choose a new password">
      {loading ? (
        <LoadingBlock className="min-h-24" label="Verifying link…" />
      ) : !session ? (
        <div className="text-center">
          <p className="text-sm text-muted">This reset link is invalid or has expired. Request a new one.</p>
          <Button to="/admin/forgot-password" variant="secondary" className="mt-6 w-full">
            Request new link
          </Button>
        </div>
      ) : (
        <form onSubmit={onSubmit} noValidate className="space-y-5">
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
            Update password
          </Button>
        </form>
      )}
    </AuthShell>
  );
}
