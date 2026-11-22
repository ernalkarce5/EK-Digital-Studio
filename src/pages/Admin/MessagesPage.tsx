import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router';
import { Archive, Inbox, Mail, MailCheck, MessageCircle, Reply, Trash2 } from 'lucide-react';
import { formatPhone, telLink, whatsappLink } from '@/lib/phone';
import { AdminPageHeader, MessageStatusBadge } from '@/components/admin/AdminUI';
import { Button } from '@/components/common/Button';
import { ConfirmDialog, Modal } from '@/components/common/Modal';
import { EmptyState, ErrorState, LoadingBlock } from '@/components/common/Feedback';
import { Select } from '@/components/forms/Field';
import { useToast } from '@/contexts/ToastContext';
import { useAsync } from '@/hooks/useAsync';
import { deleteMessage, listMessages, setMessageStatus } from '@/services/messages';
import { CONTACT_METHODS, MESSAGE_STATUS_LABELS } from '@/lib/constants';
import { toErrorMessage } from '@/lib/errors';
import { cn, formatDate, formatRelative } from '@/lib/utils';
import type { ContactMessage, MessageStatus } from '@/types/database';

const TABS: Array<MessageStatus | 'all'> = ['all', 'new', 'read', 'replied', 'archived'];

const notifyChange = () => window.dispatchEvent(new Event('ek:messages-changed'));

function MessageDetail({
  message,
  busy,
  onStatus,
  onDelete,
}: {
  message: ContactMessage;
  busy: boolean;
  onStatus: (s: MessageStatus) => void;
  onDelete: () => void;
}) {
  const subject = encodeURIComponent(`Re: your ${message.project_type.toLowerCase()} inquiry`);
  const preferred = CONTACT_METHODS.find((m) => m.value === message.preferred_contact)?.label;
  const wa = message.preferred_contact === 'whatsapp' ? whatsappLink(message.phone) : null;
  const rows: Array<[string, ReactNode]> = [
    ['Email', message.email],
    [
      'Phone',
      message.phone ? (
        <a href={telLink(message.phone)} className="text-accent-2 hover:underline">
          {formatPhone(message.phone)}
        </a>
      ) : null,
    ],
    ['Company', message.company],
    ['Project type', message.project_type],
    ['Budget', message.budget],
    ['Preferred contact', preferred ?? null],
    ['Received', formatDate(message.created_at, { dateStyle: 'medium', timeStyle: 'short' })],
  ];

  return (
    <article className="flex h-full flex-col">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="truncate text-xl font-medium tracking-tight">{message.full_name}</h2>
          <a href={`mailto:${message.email}`} className="text-sm text-accent-2 hover:underline">
            {message.email}
          </a>
        </div>
        <MessageStatusBadge status={message.status} />
      </header>
      <dl className="mt-6 grid grid-cols-2 gap-x-6 gap-y-4 rounded-lg border border-line bg-bg-2 p-4 text-sm">
        {rows.map(([k, v]) => (
          <div key={k} className="min-w-0">
            <dt className="text-xs text-subtle">{k}</dt>
            <dd className="mt-0.5 truncate">{v || '—'}</dd>
          </div>
        ))}
      </dl>
      <div className="mt-6 whitespace-pre-wrap break-words text-[15px] leading-relaxed">{message.message}</div>
      <div className="mt-8 flex flex-wrap items-center gap-2 border-t border-line pt-5">
        <Button
          href={`mailto:${message.email}?subject=${subject}`}
          size="sm"
          icon={Reply}
          onClick={() => message.status !== 'replied' && onStatus('replied')}
        >
          Reply by email
        </Button>
        {wa && (
          <Button href={wa} target="_blank" rel="noopener noreferrer" size="sm" variant="secondary" icon={MessageCircle}>
            WhatsApp
          </Button>
        )}
        {message.status !== 'archived' && (
          <Button size="sm" variant="secondary" icon={Archive} onClick={() => onStatus('archived')} disabled={busy}>
            Archive
          </Button>
        )}
        <div className="w-36">
          <label htmlFor="msg-status" className="sr-only">
            Status
          </label>
          <Select
            id="msg-status"
            value={message.status}
            onChange={(e) => onStatus(e.target.value as MessageStatus)}
            disabled={busy}
            className="h-9"
          >
            {(Object.keys(MESSAGE_STATUS_LABELS) as MessageStatus[]).map((s) => (
              <option key={s} value={s}>
                {MESSAGE_STATUS_LABELS[s]}
              </option>
            ))}
          </Select>
        </div>
        <Button size="sm" variant="ghost" icon={Trash2} onClick={onDelete} disabled={busy} className="ml-auto hover:text-danger">
          Delete
        </Button>
      </div>
    </article>
  );
}

export default function MessagesPage() {
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const tab = (params.get('status') as MessageStatus | 'all') || 'all';
  const selectedId = params.get('id');
  const { data, loading, error, reload, setData } = useAsync(() => listMessages('all'), []);
  const [busy, setBusy] = useState(false);
  const [toDelete, setToDelete] = useState<ContactMessage | null>(null);
  const [isDesktop, setIsDesktop] = useState(() => window.matchMedia('(min-width: 1024px)').matches);

  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)');
    const on = () => setIsDesktop(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);

  const messages = useMemo(() => data ?? [], [data]);
  const visible = tab === 'all' ? messages.filter((m) => m.status !== 'archived') : messages.filter((m) => m.status === tab);
  const selected = messages.find((m) => m.id === selectedId) ?? null;

  // Functional updates so a quick tab switch + click never drops the status filter.
  const select = (id: string | null) => {
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (id) next.set('id', id);
        else next.delete('id');
        return next;
      },
      { replace: true },
    );
  };
  const selectTab = (t: MessageStatus | 'all') => {
    setParams(
      (prev) => {
        const next = new URLSearchParams();
        if (t !== 'all') next.set('status', t);
        const id = prev.get('id');
        if (id) next.set('id', id);
        return next;
      },
      { replace: true },
    );
  };

  const changeStatus = async (m: ContactMessage, status: MessageStatus, silent = false) => {
    if (m.status === status) return;
    setBusy(true);
    try {
      const saved = await setMessageStatus(m.id, status);
      setData((list) => list?.map((x) => (x.id === m.id ? { ...x, ...saved } : x)));
      notifyChange();
      if (!silent) toast.success(`Marked as ${MESSAGE_STATUS_LABELS[status].toLowerCase()}.`);
    } catch (err) {
      toast.error(toErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  // Opening a new message marks it as read.
  useEffect(() => {
    if (selected?.status === 'new') void changeStatus(selected, 'read', true);
    // Runs once per opened message; changeStatus is recreated every render.
  }, [selected?.id]);

  const confirmDelete = async () => {
    if (!toDelete) return;
    setBusy(true);
    try {
      await deleteMessage(toDelete.id);
      setData((list) => list?.filter((x) => x.id !== toDelete.id));
      notifyChange();
      if (selectedId === toDelete.id) select(null);
      toast.success('Message deleted.');
      setToDelete(null);
    } catch (err) {
      toast.error(toErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const emptyTitle = tab === 'all' ? 'Inbox is empty' : `No ${MESSAGE_STATUS_LABELS[tab].toLowerCase()} messages`;

  const count = (s: MessageStatus | 'all') =>
    s === 'all' ? messages.filter((m) => m.status !== 'archived').length : messages.filter((m) => m.status === s).length;

  const detail = selected && (
    <MessageDetail
      message={selected}
      busy={busy}
      onStatus={(s) => void changeStatus(selected, s)}
      onDelete={() => setToDelete(selected)}
    />
  );

  return (
    <>
      <AdminPageHeader title="Messages" description="Project inquiries submitted through the contact form." />

      <div className="scrollbar-none mb-4 flex gap-1 overflow-x-auto rounded-lg border border-line p-1" role="tablist" aria-label="Filter messages">
        {TABS.map((t) => (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={tab === t}
            onClick={() => selectTab(t)}
            className={cn(
              'shrink-0 rounded-md px-3 py-1.5 text-sm transition-colors',
              tab === t ? 'bg-card text-fg' : 'text-muted hover:text-fg',
            )}
          >
            {t === 'all' ? 'Inbox' : MESSAGE_STATUS_LABELS[t]}
            <span className="ml-1.5 font-mono text-[11px] text-subtle">{count(t)}</span>
          </button>
        ))}
      </div>

      {loading ? (
        <LoadingBlock />
      ) : error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : !visible.length && !(isDesktop && selected) ? (
        <EmptyState icon={tab === 'archived' ? Archive : Inbox} title={emptyTitle} />
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
          {!visible.length ? (
            <EmptyState icon={tab === 'archived' ? Archive : Inbox} title={emptyTitle} className="lg:col-span-2" />
          ) : (
          <ul className="min-w-0 divide-y divide-line overflow-hidden rounded-xl border border-line bg-card lg:col-span-2">
            {visible.map((m) => (
              <li key={m.id}>
                <button
                  type="button"
                  onClick={() => select(m.id)}
                  aria-current={selectedId === m.id || undefined}
                  className={cn(
                    'flex w-full items-start gap-3 px-4 py-3.5 text-left transition-colors hover:bg-fg/[0.03]',
                    selectedId === m.id && 'bg-accent-soft',
                  )}
                >
                  {m.status === 'new' ? (
                    <Mail className="mt-0.5 size-4 shrink-0 text-accent" aria-label="Unread" />
                  ) : (
                    <MailCheck className="mt-0.5 size-4 shrink-0 text-subtle" aria-hidden />
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center justify-between gap-2">
                      <span className={cn('truncate text-sm', m.status === 'new' && 'font-semibold')}>{m.full_name}</span>
                      <span className="shrink-0 text-xs text-subtle">{formatRelative(m.created_at)}</span>
                    </span>
                    <span className="mt-0.5 block truncate text-xs text-muted">{m.project_type}{m.company ? ` · ${m.company}` : ''}</span>
                    <span className="mt-1 line-clamp-2 text-xs text-subtle">{m.message}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
          )}
          {isDesktop && (
            <div className="min-w-0 rounded-xl border border-line bg-card p-6 lg:col-span-3">
              {detail ?? <EmptyState icon={Mail} title="Select a message" className="border-0" />}
            </div>
          )}
        </div>
      )}

      {!isDesktop && (
        <Modal open={!!selected} onClose={() => select(null)} title="Message" size="lg">
          {detail}
        </Modal>
      )}

      <ConfirmDialog
        open={!!toDelete}
        title="Delete message?"
        message={<>The message from <strong className="text-fg">{toDelete?.full_name}</strong> will be permanently deleted. Consider archiving instead.</>}
        busy={busy}
        onConfirm={() => void confirmDelete()}
        onCancel={() => setToDelete(null)}
      />
    </>
  );
}
