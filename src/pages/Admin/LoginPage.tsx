import { useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from '@/lib/zod';
import { AlertCircle, LogIn } from 'lucide-react';
import { Button } from '@/components/common/Button';
import { FormField, Input } from '@/components/forms/Field';
import { useAuth } from '@/contexts/AuthContext';
import { isSupabaseConfigured } from '@/lib/supabase';
import { toErrorMessage } from '@/lib/errors';
import { AuthShell } from './AuthShell';

const schema = z.object({
  email: z.string().trim().email('Enter a valid email address.'),
  password: z.string().min(1, 'Enter your password.'),
});
type Values = z.infer<typeof schema>;

export default function LoginPage() {
  const { session, isAdmin, loading, signIn } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from ?? '/admin';
  const [error, setError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<Values>({ resolver: zodResolver(schema) });

  if (!loading && session && isAdmin) return <Navigate to={from} replace />;

  const onSubmit = handleSubmit(async ({ email, password }) => {
    setError(null);
    try {
      await signIn(email, password);
      navigate(from.startsWith('/admin') ? from : '/admin', { replace: true });
    } catch (err) {
      const msg = toErrorMessage(err);
      setError(/invalid login credentials/i.test(msg) ? 'Incorrect email or password.' : msg);
    }
  });

  return (
    <AuthShell title="Admin sign in" description="Restricted area. Authorized administrators only.">
      {!isSupabaseConfigured ? (
        <p role="alert" className="text-sm text-warning">
          {import.meta.env.DEV ? (
            <>
              The backend is not configured. Set <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code>,
              then restart.
            </>
          ) : (
            'Sign-in is temporarily unavailable. Please try again later.'
          )}
        </p>
      ) : (
        <form onSubmit={onSubmit} noValidate className="space-y-5">
          <FormField label="Email" htmlFor="email" error={errors.email?.message}>
            <Input id="email" type="email" autoComplete="username" invalid={!!errors.email} {...register('email')} />
          </FormField>
          <FormField label="Password" htmlFor="password" error={errors.password?.message}>
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              invalid={!!errors.password}
              {...register('password')}
            />
          </FormField>
          {error && (
            <p role="alert" className="flex gap-2 rounded-lg border border-danger/30 bg-danger/[0.06] p-3 text-sm text-danger">
              <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
              {error}
            </p>
          )}
          <Button type="submit" className="w-full" icon={LogIn} loading={isSubmitting}>
            Sign in
          </Button>
          <p className="text-center text-sm">
            <Link to="/admin/forgot-password" className="text-muted underline-offset-4 hover:text-fg hover:underline">
              Forgot your password?
            </Link>
          </p>
        </form>
      )}
    </AuthShell>
  );
}
