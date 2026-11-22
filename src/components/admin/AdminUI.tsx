import { useEffect, useState, type ReactNode } from 'react';
import { motion } from 'framer-motion';
import { Badge } from '@/components/common/Badge';
import { MESSAGE_STATUS_LABELS } from '@/lib/constants';
import { cn } from '@/lib/utils';
import type { MessageStatus } from '@/types/database';

export function AdminPageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
      className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"
    >
      <div>
        <h1 className="text-2xl font-medium tracking-tight md:text-3xl">{title}</h1>
        {description && <p className="mt-1.5 max-w-2xl text-sm text-muted">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </motion.div>
  );
}

export function Panel({
  id,
  title,
  description,
  actions,
  children,
  className,
  bodyClassName,
}: {
  id?: string;
  title?: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    // min-w-0: panels are often grid items; without it long content (e.g. message
    // previews) widens the grid track and causes horizontal overflow on phones.
    <section id={id} className={cn('min-w-0 scroll-mt-32 rounded-xl border border-line bg-card lg:scroll-mt-20', className)}>
      {(title || actions) && (
        <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
          <div>
            {title && <h2 className="text-[15px] font-medium">{title}</h2>}
            {description && <p className="mt-0.5 text-[13px] text-muted">{description}</p>}
          </div>
          {actions}
        </div>
      )}
      <div className={cn('p-5', bodyClassName)}>{children}</div>
    </section>
  );
}

export function PublishBadge({ published }: { published: boolean }) {
  return <Badge tone={published ? 'success' : 'neutral'}>{published ? 'Published' : 'Draft'}</Badge>;
}

const MESSAGE_TONES = { new: 'accent', read: 'neutral', replied: 'success', archived: 'neutral' } as const;

export function MessageStatusBadge({ status }: { status: MessageStatus }) {
  return <Badge tone={MESSAGE_TONES[status]}>{MESSAGE_STATUS_LABELS[status]}</Badge>;
}

/** Small icon button used in admin tables. */
export function IconButton({
  label,
  onClick,
  children,
  disabled,
  tone = 'default',
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
  disabled?: boolean;
  tone?: 'default' | 'danger' | 'active';
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      className={cn(
        'grid size-9 place-items-center rounded-lg transition-colors disabled:pointer-events-none disabled:opacity-30',
        tone === 'danger' && 'text-muted hover:bg-danger/10 hover:text-danger',
        tone === 'active' && 'text-accent-2 hover:bg-fg/5',
        tone === 'default' && 'text-muted hover:bg-fg/5 hover:text-fg',
      )}
    >
      {children}
    </button>
  );
}

/**
 * Sticky jump links for long admin forms. Highlights the section in view.
 * Sections are Panels rendered with matching `id`s.
 */
export function SectionNav({ sections }: { sections: Array<{ id: string; label: string }> }) {
  const [active, setActive] = useState(sections[0]?.id);

  useEffect(() => {
    const els = sections.map((s) => document.getElementById(s.id)).filter((el): el is HTMLElement => !!el);
    if (!els.length || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActive(visible[0].target.id);
      },
      { rootMargin: '-20% 0px -60% 0px' },
    );
    els.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [sections]);

  return (
    <nav
      aria-label="Form sections"
      className="sticky top-14 z-20 -mx-4 mb-6 border-b border-line bg-bg/90 px-4 py-2.5 backdrop-blur md:-mx-8 md:px-8 lg:top-0"
    >
      <ul className="scrollbar-none flex gap-1 overflow-x-auto">
        {sections.map((s) => (
          <li key={s.id} className="shrink-0">
            <button
              type="button"
              onClick={() => {
                setActive(s.id);
                document.getElementById(s.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
              }}
              aria-current={active === s.id ? 'true' : undefined}
              className={cn(
                'rounded-md px-3 py-1.5 text-sm transition-colors',
                active === s.id ? 'bg-card text-fg' : 'text-muted hover:text-fg',
              )}
            >
              {s.label}
            </button>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/** Sticky footer bar for long admin forms. */
export function FormActions({ children }: { children: ReactNode }) {
  return (
    <div className="sticky bottom-0 z-20 -mx-4 mt-8 flex flex-col-reverse gap-2 border-t border-line bg-bg/90 px-4 py-4 backdrop-blur sm:flex-row sm:justify-end md:-mx-8 md:px-8">
      {children}
    </div>
  );
}
