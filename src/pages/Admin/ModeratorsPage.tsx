import { useState } from 'react';
import { Link } from 'react-router';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from '@/lib/zod';
import { Activity, Info, Power, UserPlus, Users } from 'lucide-react';
import { AdminPageHeader } from '@/components/admin/AdminUI';
import { Badge } from '@/components/common/Badge';
import { Button } from '@/components/common/Button';
import { ConfirmDialog, Modal } from '@/components/common/Modal';
import { EmptyState, ErrorState, LoadingBlock } from '@/components/common/Feedback';
import { FormField, Input } from '@/components/forms/Field';
import { useToast } from '@/contexts/ToastContext';
import { useAsync } from '@/hooks/useAsync';
import {
  addExistingModerator,
  inviteModerator,
  listModeratorsWithStats,
  setModeratorActive,
  type ModeratorWithStats,
} from '@/services/moderators';
import { toErrorMessage } from '@/lib/errors';
import { cn, formatDate } from '@/lib/utils';

const schema = z.object({
  full_name: z.string().trim().min(1, 'Enter the moderator’s name.').max(120),
  email: z.string().trim().email('Enter a valid email address.'),
});
type Values = z.infer<typeof schema>;

function AddModeratorDialog({ open, onClose, onAdded }: { open: boolean; onClose: () => void; onAdded: () => void }) {
  const toast = useToast();
  const [method, setMethod] = useState<'invite' | 'existing'>('invite');
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { full_name: '', email: '' } });

  const close = () => {
    reset();
    setServerError(null);
    onClose();
  };

  const submit = handleSubmit(async ({ full_name, email }) => {
    setServerError(null);
    try {
      if (method === 'invite') {
        const r = await inviteModerator(email, full_name);
        toast.success(r.invited ? `Invitation sent to ${email}.` : `${email} already had an account and is now a moderator.`);
      } else {
        await addExistingModerator(email, full_name);
        toast.success(`${full_name} is now a moderator.`);
      }
      onAdded();
      close();
    } catch (err) {
      const code = (err as { code?: string }).code;
      setServerError(
        code === 'not_configured'
          ? 'Email invitations are not configured yet (SUPABASE_SERVICE_ROLE_KEY on Netlify). Create the user in Supabase and use "Link existing account".'
          : toErrorMessage(err),
      );
    }
  });

  return (
    <Modal
      open={open}
      onClose={isSubmitting ? () => {} : close}
      dismissible={!isSubmitting}
      title="Add moderator"
      footer={
        <>
          <Button variant="secondary" onClick={close} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button icon={UserPlus} loading={isSubmitting} onClick={() => void submit()}>
            {method === 'invite' ? 'Send invitation' : 'Add moderator'}
          </Button>
        </>
      }
    >
      <form onSubmit={submit} noValidate className="grid gap-5">
        <div role="radiogroup" aria-label="How to add the moderator" className="grid gap-2 sm:grid-cols-2">
          {(
            [
              ['invite', 'Send email invitation', 'Creates the account and emails a link to set a password.'],
              ['existing', 'Link existing account', 'For a user you already created in Supabase Authentication.'],
            ] as const
          ).map(([value, title, hint]) => (
            <label
              key={value}
              className={cn(
                'flex cursor-pointer flex-col gap-1 rounded-lg border p-3 text-sm transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-accent',
                method === value ? 'border-accent bg-accent-soft' : 'border-line-strong hover:border-fg/30',
              )}
            >
              <input type="radio" name="method" value={value} checked={method === value} onChange={() => setMethod(value)} className="sr-only" />
              <span className="font-medium">{title}</span>
              <span className="text-[13px] text-muted">{hint}</span>
            </label>
          ))}
        </div>
        <FormField label="Name" htmlFor="mod-name" required error={errors.full_name?.message}>
          <Input id="mod-name" autoComplete="off" invalid={!!errors.full_name} {...register('full_name')} />
        </FormField>
        <FormField label="Email" htmlFor="mod-email" required error={errors.email?.message}>
          <Input id="mod-email" type="email" autoComplete="off" invalid={!!errors.email} {...register('email')} />
        </FormField>
        {serverError && (
          <p role="alert" className="rounded-lg border border-danger/30 bg-danger/[0.06] p-3 text-sm text-danger">
            {serverError}
          </p>
        )}
        <button type="submit" hidden />
      </form>
    </Modal>
  );
}

export default function ModeratorsPage() {
  const toast = useToast();
  const { data, loading, error, reload } = useAsync(listModeratorsWithStats, []);
  const [adding, setAdding] = useState(false);
  const [toToggle, setToToggle] = useState<ModeratorWithStats | null>(null);
  const [busy, setBusy] = useState(false);

  const toggle = async () => {
    if (!toToggle) return;
    setBusy(true);
    try {
      await setModeratorActive(toToggle.id, !toToggle.is_active);
      toast.success(toToggle.is_active ? `${toToggle.full_name} was deactivated.` : `${toToggle.full_name} was activated.`);
      setToToggle(null);
      reload();
    } catch (err) {
      toast.error(toErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <AdminPageHeader
        title="Moderators"
        description="People who follow up on inquiries you assign to them. They only ever see their own leads."
        actions={
          <Button size="sm" icon={UserPlus} onClick={() => setAdding(true)}>
            Add moderator
          </Button>
        }
      />
      <p className="mb-6 flex gap-2.5 rounded-lg border border-line bg-card p-3.5 text-sm text-muted">
        <Info className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden />
        <span>
          Moderators sign in at <code className="text-fg">/moderator/login</code>. Deactivating someone removes their access immediately; their work stays
          available to you.
        </span>
      </p>
      {loading ? (
        <LoadingBlock />
      ) : error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : !data?.length ? (
        <EmptyState
          icon={Users}
          title="No moderators yet"
          description="Add your first moderator to start assigning inquiries."
          action={
            <Button size="sm" icon={UserPlus} onClick={() => setAdding(true)}>
              Add moderator
            </Button>
          }
        />
      ) : (
        <ul className="grid gap-3 md:grid-cols-2" aria-label="Moderators">
          {data.map((m) => (
            <li key={m.id} className={cn('rounded-xl border border-line bg-card p-5', !m.is_active && 'opacity-75')}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate font-medium">{m.full_name}</p>
                  <p className="truncate text-sm text-muted">{m.email}</p>
                </div>
                <Badge tone={m.is_active ? 'success' : 'neutral'}>{m.is_active ? 'Active' : 'Inactive'}</Badge>
              </div>
              <dl className="mt-4 grid grid-cols-3 gap-2 text-center">
                {[
                  ['Active', m.active],
                  ['In review', m.inReview],
                  ['Completed', m.completed],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-lg bg-bg-2 px-2 py-2.5">
                    <dt className="text-[11px] text-subtle">{label}</dt>
                    <dd className="mt-0.5 text-lg font-medium">{value}</dd>
                  </div>
                ))}
              </dl>
              <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3 text-xs text-subtle">
                <span>Added {formatDate(m.created_at)}</span>
                <div className="flex gap-1">
                  <Link
                    to={`/admin/activity?moderator=${m.id}`}
                    className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-sm text-muted hover:bg-fg/5 hover:text-fg"
                  >
                    <Activity className="size-3.5" aria-hidden /> Activity
                  </Link>
                  <Button size="sm" variant="ghost" icon={Power} onClick={() => setToToggle(m)}>
                    {m.is_active ? 'Deactivate' : 'Activate'}
                  </Button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      <AddModeratorDialog open={adding} onClose={() => setAdding(false)} onAdded={reload} />
      <ConfirmDialog
        open={!!toToggle}
        title={toToggle?.is_active ? 'Deactivate moderator?' : 'Activate moderator?'}
        message={
          toToggle?.is_active ? (
            <>
              <strong className="text-fg">{toToggle?.full_name}</strong> loses access immediately.
              {toToggle && toToggle.active + toToggle.inReview > 0 && <> They have {toToggle.active + toToggle.inReview} open lead(s); transfer or retrieve them afterwards.</>}
            </>
          ) : (
            <>
              <strong className="text-fg">{toToggle?.full_name}</strong> regains access to their current leads.
            </>
          )
        }
        confirmLabel={toToggle?.is_active ? 'Deactivate' : 'Activate'}
        busy={busy}
        onConfirm={() => void toggle()}
        onCancel={() => setToToggle(null)}
      />
    </>
  );
}
