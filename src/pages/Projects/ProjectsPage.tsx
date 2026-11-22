import { useCallback, useEffect, useMemo, useRef, useState, type DependencyList } from 'react';
import { useSearchParams } from 'react-router';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronRight, FolderOpen, Search, SearchX, X } from 'lucide-react';
import { Seo } from '@/components/common/Seo';
import { PageHeader } from '@/components/common/PageHeader';
import { Button } from '@/components/common/Button';
import { EmptyState, ErrorState } from '@/components/common/Feedback';
import { CtaSection } from '@/components/common/CtaSection';
import { ProjectCard, ProjectCardSkeleton } from '@/components/projects/ProjectCard';
import { useAsync } from '@/hooks/useAsync';
import { listPublishedProjects } from '@/services/projects';
import { listPublishedCategories } from '@/services/categories';
import { PROJECT_TYPE_LABELS } from '@/lib/constants';
import { cn } from '@/lib/utils';
import type { ProjectType } from '@/types/database';

/** Tracks whether a horizontal scroller has hidden content on either side. */
function useScrollHint<T extends HTMLElement>(deps: DependencyList) {
  const ref = useRef<T>(null);
  const [state, setState] = useState({ canScrollLeft: false, canScrollRight: false });

  const update = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const left = el.scrollLeft > 2;
    const right = el.scrollLeft + el.clientWidth < el.scrollWidth - 2;
    setState((s) => (s.canScrollLeft === left && s.canScrollRight === right ? s : { canScrollLeft: left, canScrollRight: right }));
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    update();
    el.addEventListener('scroll', update, { passive: true });
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => {
      el.removeEventListener('scroll', update);
      ro.disconnect();
    };
    // Re-measure when the chip list changes.
  }, [update, ...deps]);

  return { ref, ...state };
}

export default function ProjectsPage() {
  const [params, setParams] = useSearchParams();
  const activeCategory = params.get('category') ?? 'all';
  const query = params.get('q') ?? '';

  const { data, loading, error, publicError, reload } = useAsync(
    () => Promise.all([listPublishedProjects(), listPublishedCategories()]),
    [],
  );
  const projects = useMemo(() => data?.[0] ?? [], [data]);
  const categories = data?.[1] ?? [];

  const counts = useMemo(() => {
    const map = new Map<string, number>();
    for (const p of projects) if (p.category) map.set(p.category.slug, (map.get(p.category.slug) ?? 0) + 1);
    return map;
  }, [projects]);

  // Only categories that contain published projects (plus the active one, so a
  // shared ?category= link never leaves the filter without a selected chip).
  const visibleCategories = categories.filter((c) => (counts.get(c.slug) ?? 0) > 0 || c.slug === activeCategory);
  const chips = useScrollHint<HTMLDivElement>([visibleCategories.length, loading]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return projects.filter((p) => {
      if (activeCategory !== 'all' && p.category?.slug !== activeCategory) return false;
      if (!q) return true;
      const haystack = [
        p.title,
        p.short_description,
        p.category?.name ?? '',
        PROJECT_TYPE_LABELS[p.project_type as ProjectType],
        ...p.technologies,
      ]
        .join(' ')
        .toLowerCase();
      return q.split(/\s+/).every((term) => haystack.includes(term));
    });
  }, [projects, activeCategory, query]);

  const update = (key: 'category' | 'q', value: string) => {
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (!value || value === 'all') next.delete(key);
        else next.set(key, value);
        return next;
      },
      { replace: true, preventScrollReset: true },
    );
  };

  return (
    <>
      <Seo
        title="Projects"
        description="Portfolio of websites, booking systems and web applications by Ernal Karce. Demo, personal and client projects are clearly labelled."
      />
      <PageHeader
        eyebrow="Portfolio"
        title={
          <>
            Selected <em>projects</em>
          </>
        }
        description="Websites, booking systems and web applications. Each project is labelled as a client, personal or demo project, so you always know what you are looking at."
      />

      <section className="container-page mt-14 md:mt-20" aria-label="Projects">
        <div className="sticky top-16 z-30 -mx-4 border-b border-line bg-bg/85 px-4 py-4 backdrop-blur-xl sm:-mx-6 sm:px-6 md:top-18 lg:-mx-10 lg:px-10">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="relative min-w-0">
            {/* Edge fades signal that the chip row scrolls horizontally. */}
            <span
              aria-hidden
              className={cn(
                'pointer-events-none absolute inset-y-0 left-0 z-10 w-10 bg-gradient-to-r from-bg to-transparent transition-opacity',
                chips.canScrollLeft ? 'opacity-100' : 'opacity-0',
              )}
            />
            <span
              aria-hidden
              data-testid="chips-fade-right"
              className={cn(
                'pointer-events-none absolute inset-y-0 right-0 z-10 flex w-12 items-center justify-end bg-gradient-to-l from-bg via-bg/80 to-transparent transition-opacity',
                chips.canScrollRight ? 'opacity-100' : 'opacity-0',
              )}
            >
              <ChevronRight className="size-4 text-muted" />
            </span>
            <div
              ref={chips.ref}
              className="scrollbar-none -mx-1 flex gap-1.5 overflow-x-auto px-1"
              role="toolbar"
              aria-label="Filter by category"
            >
              {[{ slug: 'all', name: 'All' }, ...visibleCategories].map((c) => {
                const active = activeCategory === c.slug;
                const count = c.slug === 'all' ? projects.length : (counts.get(c.slug) ?? 0);
                return (
                  <button
                    key={c.slug}
                    type="button"
                    onClick={() => update('category', c.slug)}
                    aria-pressed={active}
                    className={cn(
                      'relative inline-flex h-9 shrink-0 items-center gap-2 rounded-lg px-3.5 text-sm transition-colors',
                      active ? 'text-bg' : 'text-muted hover:bg-fg/5 hover:text-fg',
                    )}
                  >
                    {active && (
                      <motion.span
                        layoutId="category-pill"
                        className="absolute inset-0 rounded-lg bg-fg"
                        transition={{ type: 'spring', stiffness: 500, damping: 40 }}
                      />
                    )}
                    <span className="relative">{c.name}</span>
                    {!loading && (
                      <span className={cn('relative font-mono text-[11px]', active ? 'text-bg/60' : 'text-subtle')}>
                        {count}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
            </div>
            <div className="relative w-full shrink-0 lg:w-72">
              <label htmlFor="project-search" className="sr-only">
                Search projects
              </label>
              <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-subtle" aria-hidden />
              <input
                id="project-search"
                type="search"
                value={query}
                onChange={(e) => update('q', e.target.value)}
                placeholder="Search projects or technologies"
                className="h-10 w-full rounded-lg border border-line-strong bg-bg-2 pl-10 pr-9 text-[15px] placeholder:text-subtle focus:border-accent focus:outline-none focus:ring-3 focus:ring-accent/20 sm:text-sm [&::-webkit-search-cancel-button]:hidden"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => update('q', '')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-subtle hover:text-fg"
                  aria-label="Clear search"
                >
                  <X className="size-3.5" />
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="mt-12">
          {loading ? (
            <div className="grid gap-x-8 gap-y-14 md:grid-cols-2 xl:grid-cols-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <ProjectCardSkeleton key={i} />
              ))}
            </div>
          ) : error ? (
            <ErrorState message={publicError} onRetry={reload} />
          ) : projects.length === 0 ? (
            <EmptyState
              icon={FolderOpen}
              title="Projects coming soon"
              description="The portfolio is being prepared. Check back shortly or get in touch to discuss your project."
              action={
                <Button to="/contact" size="sm" arrow>
                  Get in touch
                </Button>
              }
            />
          ) : filtered.length === 0 ? (
            <EmptyState
              icon={SearchX}
              title="No matching projects"
              description="Try a different search term or category."
              action={
                <Button variant="secondary" size="sm" onClick={() => setParams({}, { replace: true })}>
                  Clear filters
                </Button>
              }
            />
          ) : (
            <>
              <p className="mb-8 text-sm text-muted" aria-live="polite">
                Showing {filtered.length} of {projects.length} project{projects.length === 1 ? '' : 's'}
              </p>
              <motion.div layout className="grid gap-x-8 gap-y-14 md:grid-cols-2 xl:grid-cols-3">
                <AnimatePresence mode="popLayout">
                  {filtered.map((p, i) => (
                    <ProjectCard key={p.id} project={p} index={i} priority={i < 3} />
                  ))}
                </AnimatePresence>
              </motion.div>
            </>
          )}
        </div>
      </section>

      <CtaSection />
    </>
  );
}
