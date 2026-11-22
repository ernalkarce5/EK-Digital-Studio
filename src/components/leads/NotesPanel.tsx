import { useState } from 'react';
import { LifeBuoy, Lock, MessageSquare, Send } from 'lucide-react';
import { Panel } from '@/components/admin/AdminUI';
import { Button } from '@/components/common/Button';
import { Badge } from '@/components/common/Badge';
import { FormField, Select, Textarea } from '@/components/forms/Field';
import { useToast } from '@/contexts/ToastContext';
import { addNote, notifyLeadsChanged } from '@/services/leads';
import { toErrorMessage } from '@/lib/errors';
import { formatDate } from '@/lib/utils';
import type { LeadNote } from '@/types/database';

type NoteMode = 'note' | 'help_request' | 'admin_only';

/** Notes between admin and moderator. Moderators can also request assistance. */
export function NotesPanel({
  messageId,
  notes,
  role,
  canAdd,
  onAdded,
}: {
  messageId: string;
  notes: LeadNote[];
  role: 'admin' | 'moderator';
  canAdd: boolean;
  onAdded: (n: LeadNote) => void;
}) {
  const toast = useToast();
  const [body, setBody] = useState('');
  const [mode, setMode] = useState<NoteMode>('note');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!body.trim()) {
      setError('Write a note first.');
      return;
    }
    setBusy(true);
    try {
      const note = await addNote({
        messageId,
        body,
        authorRole: role,
        kind: mode === 'help_request' ? 'help_request' : 'note',
        visibility: mode === 'admin_only' ? 'admin_only' : 'shared',
      });
      onAdded(note);
      notifyLeadsChanged();
      setBody('');
      setError(null);
      toast.success(mode === 'help_request' ? 'Assistance requested. The admin has been notified.' : 'Note added.');
    } catch (err) {
      toast.error(toErrorMessage(err, 'The note could not be saved.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid gap-6 lg:grid-cols-5">
      <Panel title="Notes" className="lg:col-span-3" bodyClassName="p-0">
        {!notes.length ? (
          <p className="px-5 py-8 text-center text-sm text-muted">No notes yet.</p>
        ) : (
          <ul className="divide-y divide-line" aria-label="Notes">
            {notes.map((n) => (
              <li key={n.id} className="px-5 py-4">
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <Badge tone={n.author_role === 'admin' ? 'accent' : 'neutral'}>{n.author_role === 'admin' ? 'Admin' : 'Moderator'}</Badge>
                  {n.kind === 'help_request' && (
                    <Badge tone="warning">
                      <LifeBuoy className="size-3" aria-hidden /> Assistance request
                    </Badge>
                  )}
                  {n.visibility === 'admin_only' && (
                    <Badge tone="neutral">
                      <Lock className="size-3" aria-hidden /> Admin only
                    </Badge>
                  )}
                  <time className="text-subtle" dateTime={n.created_at}>
                    {formatDate(n.created_at, { dateStyle: 'medium', timeStyle: 'short' })}
                  </time>
                </div>
                <p className="mt-1.5 whitespace-pre-wrap break-words text-[15px] leading-relaxed">{n.body}</p>
              </li>
            ))}
          </ul>
        )}
      </Panel>
      {canAdd && (
        <Panel title={role === 'admin' ? 'Add a note' : 'Add a note or ask for help'} className="lg:col-span-2">
          <form onSubmit={submit} noValidate className="grid gap-4">
            <FormField label="Type" htmlFor="note-mode">
              <Select id="note-mode" value={mode} onChange={(e) => setMode(e.target.value as NoteMode)}>
                <option value="note">{role === 'admin' ? 'Note for the moderator' : 'Note'}</option>
                {role === 'moderator' && <option value="help_request">Request assistance from admin</option>}
                {role === 'admin' && <option value="admin_only">Internal note (admins only)</option>}
              </Select>
            </FormField>
            <FormField label="Note" htmlFor="note-body" required error={error ?? undefined}>
              <Textarea
                id="note-body"
                rows={4}
                maxLength={3000}
                value={body}
                invalid={!!error}
                onChange={(e) => {
                  setBody(e.target.value);
                  setError(null);
                }}
              />
            </FormField>
            <Button type="submit" icon={mode === 'help_request' ? Send : MessageSquare} loading={busy}>
              {mode === 'help_request' ? 'Send request' : 'Add note'}
            </Button>
          </form>
        </Panel>
      )}
    </div>
  );
}
