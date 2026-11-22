import { useEffect, type ReactNode } from 'react';
import { Link } from 'react-router';
import { motion } from 'framer-motion';
import { ArrowLeft } from 'lucide-react';

/** Centered card layout shared by login and password pages. */
export function AuthShell({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  useEffect(() => {
    document.title = `${title} — Admin`;
    document.querySelector('meta[name="robots"]')?.setAttribute('content', 'noindex, nofollow');
  }, [title]);

  return (
    <main className="relative flex min-h-dvh items-center justify-center px-4 py-12">
      <div
        aria-hidden
        className="grid-lines pointer-events-none absolute inset-0 -z-10 [mask-image:radial-gradient(ellipse_50%_50%_at_50%_40%,black,transparent)]"
      />
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        className="w-full max-w-sm"
      >
        <div className="mb-8 flex flex-col items-center text-center">
          <span className="flex size-11 items-center justify-center rounded-xl border border-line-strong bg-card font-mono text-sm font-medium">
            E<span className="text-accent">K</span>
          </span>
          <h1 className="mt-6 text-2xl font-medium tracking-tight">{title}</h1>
          {description && <p className="mt-2 text-sm text-muted">{description}</p>}
        </div>
        <div className="rounded-2xl border border-line-strong bg-card p-6 shadow-2xl shadow-black/20 sm:p-7">{children}</div>
        <Link to="/" className="mt-6 flex items-center justify-center gap-2 text-sm text-muted hover:text-fg">
          <ArrowLeft className="size-4" aria-hidden /> Back to website
        </Link>
      </motion.div>
    </main>
  );
}
