import { useEffect, useState } from 'react';
import { Button } from '@/components/common/Button';
import { Modal } from '@/components/common/Modal';
import { LoadingBlock, ErrorState } from '@/components/common/Feedback';
import { FormField, Select, Textarea } from '@/components/forms/Field';
import { useAsync } from '@/hooks/useAsync';
import { listModeratorsWithStats } from '@/services/moderators';

/** Confirmation dialog with a text field (reason / note). */
export function ReasonDialog({
  open,
  title,
  description,
  label,
  confirmLabel,
  required = false,
  danger = false,
  busy,
  onConfirm,
  onClose,
}: {
  open: boolean;
  title: string;
  description?: string;
  label: string;
  confirmLabel: string;
  required?: boolean;
  danger?: boolean;
  busy: boolean;
  onConfirm: (text: string) => void;
  onClose: () => void;
}) {
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (open) {
      setText('');
      setError(null);
    }
  }, [open]);

  const submit = () => {
    if (required && !text.trim()) {
      setError('This field is required.');
      return;
    }
    onConfirm(text.trim());
  };

  return (
    <Modal
      open={open}
      onClose={busy ? () => {} : onClose}
      dismissible={!busy}
      title={title}
      description={description}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant={danger ? 'danger' : 'primary'} onClick={submit} loading={busy}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <FormField label={label} htmlFor="reason-text" required={required} optional={!required} error={error ?? undefined}>
        <Textarea id="reason-text" rows={4} value={text} onChange={(e) => setText(e.target.value)} maxLength={2000} invalid={!!error} />
      </FormField>
    </Modal>
  );
}

/** Pick an active moderator (+ optional private note). Used to assign and to transfer. */
export function ModeratorPickerDialog({
  open,
  title,
  description,
  confirmLabel,
  excludeId,
  busy,
  onConfirm,
  onClose,
}: {
  open: boolean;
  title: string;
  description?: string;
  confirmLabel: string;
  excludeId?: string;
  busy: boolean;
  onConfirm: (moderatorId: string, note: string) => void;
  onClose: () => void;
}) {
  const moderators = useAsync(() => (open ? listModeratorsWithStats() : Promise.resolve([])), [open]);
  const [moderatorId, setModeratorId] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (open) {
      setModeratorId('');
      setNote('');
      setError(null);
    }
  }, [open]);

  const options = (moderators.data ?? []).filter((m) => m.is_active && m.id !== excludeId);

  return (
    <Modal
      open={open}
      onClose={busy ? () => {} : onClose}
      dismissible={!busy}
      title={title}
      description={description}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            onClick={() => (moderatorId ? onConfirm(moderatorId, note.trim()) : setError('Choose a moderator.'))}
            loading={busy}
            disabled={!options.length}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      {moderators.loading ? (
        <LoadingBlock className="min-h-24" />
      ) : moderators.error ? (
        <ErrorState message={moderators.error} onRetry={moderators.reload} />
      ) : !options.length ? (
        <p className="text-sm text-muted">
          There are no active moderators available. Add or activate one under <strong className="text-fg">Moderators</strong>.
        </p>
      ) : (
        <div className="grid gap-5">
          <FormField label="Moderator" htmlFor="pick-moderator" required error={error ?? undefined}>
            <Select
              id="pick-moderator"
              value={moderatorId}
              invalid={!!error}
              onChange={(e) => {
                setModeratorId(e.target.value);
                setError(null);
              }}
            >
              <option value="" disabled>
                Select a moderator
              </option>
              {options.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.full_name} ({m.active} active)
                </option>
              ))}
            </Select>
          </FormField>
          <FormField label="Private note for the moderator" htmlFor="pick-note" optional hint="Visible to the moderator and admins only.">
            <Textarea id="pick-note" rows={3} value={note} maxLength={2000} onChange={(e) => setNote(e.target.value)} />
          </FormField>
        </div>
      )}
    </Modal>
  );
}
