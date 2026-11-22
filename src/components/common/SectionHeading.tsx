import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { Reveal } from './Reveal';

/**
 * Section header: mono eyebrow with index number, large title, optional
 * description and trailing action. Titles can include <em> for the serif accent.
 */
export function SectionHeading({
  index,
  eyebrow,
  title,
  description,
  action,
  className,
  as: Tag = 'h2',
}: {
  index?: string;
  eyebrow: string;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
  as?: 'h1' | 'h2';
}) {
  return (
    <div className={cn('flex flex-col gap-6 md:flex-row md:items-end md:justify-between', className)}>
      <Reveal className="max-w-3xl">
        <p className="eyebrow flex items-center gap-3">
          {index && <span className="text-accent">{index}</span>}
          <span className="h-px w-6 bg-line-strong" aria-hidden />
          {eyebrow}
        </p>
        <Tag className="text-h2 mt-5 [&_em]:font-serif [&_em]:font-normal [&_em]:italic [&_em]:tracking-normal [&_em]:text-accent-2">
          {title}
        </Tag>
        {description && <p className="mt-5 max-w-2xl text-base leading-relaxed text-muted md:text-lg">{description}</p>}
      </Reveal>
      {action && (
        <Reveal delay={0.1} className="shrink-0">
          {action}
        </Reveal>
      )}
    </div>
  );
}
