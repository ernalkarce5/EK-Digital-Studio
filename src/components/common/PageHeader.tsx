import type { ReactNode } from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

const EASE = [0.16, 1, 0.3, 1] as const;

/** Header block for inner pages. `title` may include <em> for the serif accent. */
export function PageHeader({
  eyebrow,
  title,
  description,
  children,
  className,
}: {
  eyebrow: string;
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <header className={cn('relative overflow-hidden pt-32 md:pt-44', className)}>
      <div
        aria-hidden
        className="grid-lines pointer-events-none absolute inset-0 -z-10 [mask-image:radial-gradient(ellipse_60%_70%_at_20%_0%,black,transparent)]"
      />
      <div className="container-page">
        <motion.p
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: EASE }}
          className="eyebrow flex items-center gap-3"
        >
          <span className="h-px w-6 bg-accent" aria-hidden />
          {eyebrow}
        </motion.p>
        <motion.h1
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.9, ease: EASE, delay: 0.05 }}
          className="text-display mt-6 max-w-5xl [&_em]:font-serif [&_em]:font-normal [&_em]:italic [&_em]:tracking-normal [&_em]:text-accent-2"
        >
          {title}
        </motion.h1>
        {description && (
          <motion.p
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, ease: EASE, delay: 0.15 }}
            className="mt-7 max-w-2xl text-lg leading-relaxed text-muted"
          >
            {description}
          </motion.p>
        )}
        {children}
      </div>
    </header>
  );
}
