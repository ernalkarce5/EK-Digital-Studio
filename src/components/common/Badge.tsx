import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { PROJECT_TYPE_HINTS, PROJECT_TYPE_LABELS } from '@/lib/constants';
import type { ProjectType } from '@/types/database';

type Tone = 'neutral' | 'accent' | 'success' | 'warning' | 'danger';

const TONES: Record<Tone, string> = {
  neutral: 'border-line-strong text-muted',
  accent: 'border-accent/35 text-accent-2 bg-accent-soft light:text-accent',
  success: 'border-success/35 text-success bg-success/10',
  warning: 'border-warning/35 text-warning bg-warning/10',
  danger: 'border-danger/35 text-danger bg-danger/10',
};

export function Badge({
  children,
  tone = 'neutral',
  className,
  title,
}: {
  children: ReactNode;
  tone?: Tone;
  className?: string;
  title?: string;
}) {
  return (
    <span
      title={title}
      className={cn(
        'inline-flex items-center gap-1.5 whitespace-nowrap rounded-md border px-2 py-0.5 font-mono text-[11px] uppercase tracking-wide',
        TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

const TYPE_TONE: Record<ProjectType, Tone> = { demo: 'warning', personal: 'neutral', client: 'accent' };

/** Clearly labels demo work so it is never mistaken for commissioned client work. */
export function ProjectTypeBadge({ type, className }: { type: ProjectType; className?: string }) {
  return (
    <Badge tone={TYPE_TONE[type]} title={PROJECT_TYPE_HINTS[type]} className={className}>
      {PROJECT_TYPE_LABELS[type]}
    </Badge>
  );
}

export function Tag({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-md bg-fg/[0.05] px-2 py-1 text-xs text-muted">{children}</span>
  );
}
