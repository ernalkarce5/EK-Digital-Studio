import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from '@/lib/zod';
import { KeyRound, Save } from 'lucide-react';
import { AdminPageHeader, Panel } from '@/components/admin/AdminUI';
import { Button } from '@/components/common/Button';
import { ErrorState, LoadingBlock } from '@/components/common/Feedback';
import { FormField, Input } from '@/components/forms/Field';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import { useAsync } from '@/hooks/useAsync';
import { getModerator, renameModerator } from '@/services/moderators';
import { toErrorMessage } from '@/lib/errors';
import { formatDate } from '@/lib/utils';

const nameSchema = z.object({ full_name: z.string().trim().min(1, 'Enter your name.').max(120) });
const passwordSchema = z
  .object({
    password: z.string().min(10, 'Use at least 10 characters.').max(72, 'Use at most 72 characters.'),
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, { path: ['confirm'], message: 'Passwords do not match.' });

export default function ModeratorProfilePage() {
  const { user, updatePassword } = useAuth();
  const toast = useToast();
  const me = useAsync(() => getModerator(user!.id), [user?.id]);

  const nameForm = useForm<z.infer<typeof nameSchema>>({ resolver: zodResolver(nameSchema), defaultValues: { full_name: '' } });
  const pwForm = useForm<z.infer<typeof passwordSchema>>({ resolver: zodResolver(passwordSchema), defaultValues: { password: '', confirm: '' } });

  useEffect(() => {
    if (me.data) nameForm.reset({ full_name: me.data.full_name });
  }, [me.data, nameForm]);

  const saveName = nameForm.handleSubmit(async ({ full_name }) => {
    try {
      const saved = await renameModerator(user!.id, full_name);
      me.setData(() => saved);
      toast.success('Name updated.');
    } catch (err) {
      toast.error(toErrorMessage(err));
    }
  });
  const savePassword = pwForm.handleSubmit(async ({ password }) => {
    try {
      await updatePassword(password);
      pwForm.reset({ password: '', confirm: '' });
      toast.success('Password changed.');
    } catch (err) {
      toast.error(toErrorMessage(err));
    }
  });

  if (me.loading) return <LoadingBlock />;
  if (me.error || !me.data) return <ErrorState message={me.error ?? 'Your moderator profile could not be loaded.'} onRetry={me.reload} />;

  return (
    <>
      <AdminPageHeader title="Profile & Settings" description="Your name as shown to the admin, and your sign-in password." />
      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="Profile">
          <form onSubmit={saveName} noValidate className="grid gap-5">
            <FormField label="Name" htmlFor="me-name" required error={nameForm.formState.errors.full_name?.message}>
              <Input id="me-name" invalid={!!nameForm.formState.errors.full_name} {...nameForm.register('full_name')} />
            </FormField>
            <FormField label="Email" htmlFor="me-email" hint="Ask the admin if your email needs to change.">
              <Input id="me-email" value={me.data.email} readOnly disabled />
            </FormField>
            <p className="text-[13px] text-subtle">Moderator since {formatDate(me.data.created_at)}.</p>
            <div>
              <Button type="submit" icon={Save} loading={nameForm.formState.isSubmitting} disabled={!nameForm.formState.isDirty}>
                Save name
              </Button>
            </div>
          </form>
        </Panel>
        <Panel title="Change password">
          <form onSubmit={savePassword} noValidate className="grid gap-5">
            <FormField label="New password" htmlFor="me-password" error={pwForm.formState.errors.password?.message} hint="At least 10 characters.">
              <Input id="me-password" type="password" autoComplete="new-password" invalid={!!pwForm.formState.errors.password} {...pwForm.register('password')} />
            </FormField>
            <FormField label="Confirm password" htmlFor="me-confirm" error={pwForm.formState.errors.confirm?.message}>
              <Input id="me-confirm" type="password" autoComplete="new-password" invalid={!!pwForm.formState.errors.confirm} {...pwForm.register('confirm')} />
            </FormField>
            <div>
              <Button type="submit" icon={KeyRound} loading={pwForm.formState.isSubmitting}>
                Change password
              </Button>
            </div>
          </form>
        </Panel>
      </div>
    </>
  );
}
