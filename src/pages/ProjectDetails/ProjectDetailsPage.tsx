import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { motion } from 'framer-motion';
import { ArrowLeft, ArrowRight, Check, ChevronLeft, ChevronRight, ExternalLink, Info, LayoutGrid } from 'lucide-react';
import { Seo } from '@/components/common/Seo';
import { Button } from '@/components/common/Button';
import { ProjectTypeBadge } from '@/components/common/Badge';
import { SmartImage } from '@/components/common/SmartImage';
import { Reveal } from '@/components/common/Reveal';
import { Modal } from '@/components/common/Modal';
import { ErrorState, Skeleton } from '@/components/common/Feedback';
import { CtaSection } from '@/components/common/CtaSection';
import { useAsync } from '@/hooks/useAsync';
import { getPublishedProject } from '@/services/projects';
import { PROJECT_TYPE_HINTS } from '@/lib/constants';
import { cn, formatDate, isSafeHttpUrl, paragraphs } from '@/lib/utils';
import { mediaUrl } from '@/lib/storage';
import NotFoundPage from '@/pages/NotFound/NotFoundPage';

const EASE = [0.16, 1, 0.3, 1] as const;

function Gallery({ images, title }: { images: string[]; title: string }) {
  const [index, setIndex] = useState<number | null>(null);
  const valid = images.filter((p) => mediaUrl(p));
  if (!valid.length) return null;
  const go = (delta: number) => setIndex((i) => (i === null ? i : (i + delta + valid.length) % valid.length));

  return (
    <section className="container-page mt-24" aria-labelledby="gallery-title">
      <h2 id="gallery-title" className="eyebrow">
        Screenshots
      </h2>
      <ul className="mt-6 grid gap-4 sm:grid-cols-2">
        {valid.map((path, i) => (
          <Reveal as="li" key={path} delay={(i % 2) * 0.06} className={i === 0 && valid.length % 2 === 1 ? 'sm:col-span-2' : undefined}>
            <button
              type="button"
              onClick={() => setIndex(i)}
              className="group block w-full overflow-hidden rounded-[var(--radius-card)] border border-line"
              aria-label={`Open screenshot ${i + 1} of ${valid.length}`}
            >
              <SmartImage
                path={path}
                alt={`${title}, screenshot ${i + 1}`}
                className="aspect-[16/10] w-full"
                imgClassName="transition-transform duration-700 group-hover:scale-[1.02]"
              />
            </button>
          </Reveal>
        ))}
      </ul>
      <Modal
        open={index !== null}
        onClose={() => setIndex(null)}
        title={`${title}, screenshot ${(index ?? 0) + 1} of ${valid.length}`}
        size="xl"
      >
        {index !== null && (
          <div className="relative">
            <img
              src={mediaUrl(valid[index])!}
              alt={`${title}, screenshot ${index + 1}`}
              className="max-h-[70dvh] w-full rounded-lg object-contain"
            />
            {valid.length > 1 && (
              <div className="mt-4 flex justify-between">
                <Button variant="secondary" size="sm" icon={ChevronLeft} onClick={() => go(-1)}>
                  Previous
                </Button>
                <Button variant="secondary" size="sm" onClick={() => go(1)}>
                  Next <ChevronRight className="size-4" aria-hidden />
                </Button>
              </div>
            )}
          </div>
        )}
      </Modal>
    </section>
  );
}

function ListBlock({ title, items }: { title: string; items: string[] }) {
  if (!items.length) return null;
  return (
    <Reveal as="section" className="border-t border-line pt-8">
      <h2 className="text-xl font-medium tracking-tight">{title}</h2>
      <ul className="mt-5 space-y-3">
        {items.map((item) => (
          <li key={item} className="flex gap-3 text-[16px] leading-relaxed text-muted">
            <Check className="mt-1 size-4 shrink-0 text-accent" aria-hidden />
            {item}
          </li>
        ))}
      </ul>
    </Reveal>
  );
}

export default function ProjectDetailsPage() {
  const { slug = '' } = useParams();
  const { data, loading, error, publicError, reload } = useAsync(() => getPublishedProject(slug), [slug]);

  if (loading) {
    return (
      <div className="container-page pt-32 md:pt-44" aria-busy="true">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="mt-6 h-16 w-3/4" />
        <Skeleton className="mt-4 h-6 w-1/2" />
        <Skeleton className="mt-12 aspect-[16/9] w-full" />
      </div>
    );
  }
  if (error) {
    return (
      <div className="container-page pt-32 md:pt-44">
        <ErrorState message={publicError} onRetry={reload} />
      </div>
    );
  }
  if (!data?.project) return <NotFoundPage message="This project does not exist or is no longer published." />;

  const { project, previous, next } = data;
  const description = paragraphs(project.full_description);

  return (
    <>
      <Seo
        title={project.title}
        description={project.short_description}
        image={project.cover_image_path}
        type="article"
      />
      <article>
        <header className="container-page pt-28 md:pt-40">
          <Link
            to="/projects"
            className="group inline-flex items-center gap-2 text-sm text-muted transition-colors hover:text-fg"
          >
            <ArrowLeft className="size-4 transition-transform group-hover:-translate-x-1" aria-hidden />
            Back to Projects
          </Link>
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, ease: EASE }}
          >
            <div className="mt-10 flex flex-wrap items-center gap-3">
              <ProjectTypeBadge type={project.project_type} />
              {project.category && <span className="eyebrow">{project.category.name}</span>}
            </div>
            <h1 className="text-display mt-6 max-w-5xl">{project.title}</h1>
            <p className="mt-6 max-w-2xl text-lg leading-relaxed text-muted md:text-xl">{project.short_description}</p>
            <div className="mt-9 flex flex-wrap gap-3">
              {isSafeHttpUrl(project.live_demo_url) && (
                <Button href={project.live_demo_url} target="_blank" rel="noopener noreferrer" size="lg" icon={ExternalLink}>
                  {project.project_type === 'demo' ? 'Open Live Demo' : 'Visit Live Site'}
                </Button>
              )}
              <Button to="/contact" size="lg" variant="secondary">
                Start a similar project
              </Button>
            </div>
          </motion.div>
        </header>

        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1, ease: EASE, delay: 0.15 }}
          className="container-page mt-14 md:mt-20"
        >
          <SmartImage
            path={project.cover_image_path}
            alt={project.cover_image_alt || `${project.title} cover`}
            priority
            className="aspect-[16/10] w-full rounded-2xl border border-line md:aspect-[16/8]"
          />
        </motion.div>

        <div className="container-page mt-16 grid gap-14 md:mt-24 lg:grid-cols-12">
          <aside className="lg:col-span-4">
            <dl className="grid grid-cols-2 gap-6 border-t border-line pt-8 lg:sticky lg:top-28 lg:grid-cols-1">
              <div>
                <dt className="eyebrow">Project type</dt>
                <dd className="mt-2 text-sm">
                  <ProjectTypeBadge type={project.project_type} />
                  <p className="mt-2 text-muted">{PROJECT_TYPE_HINTS[project.project_type]}</p>
                </dd>
              </div>
              {project.category && (
                <div>
                  <dt className="eyebrow">Category</dt>
                  <dd className="mt-2 text-sm">
                    <Link to={`/projects?category=${project.category.slug}`} className="hover:text-accent-2">
                      {project.category.name}
                    </Link>
                  </dd>
                </div>
              )}
              {project.technologies.length > 0 && (
                <div className="col-span-2 lg:col-span-1">
                  <dt className="eyebrow">Technologies</dt>
                  <dd className="mt-3 flex flex-wrap gap-1.5">
                    {project.technologies.map((t) => (
                      <span key={t} className="rounded-md border border-line-strong px-2.5 py-1 text-xs">
                        {t}
                      </span>
                    ))}
                  </dd>
                </div>
              )}
              {project.published_at && (
                <div>
                  <dt className="eyebrow">Published</dt>
                  <dd className="mt-2 text-sm text-muted">{formatDate(project.published_at, { month: 'long', year: 'numeric' })}</dd>
                </div>
              )}
            </dl>
          </aside>

          <div className="space-y-12 lg:col-span-8">
            {project.project_type === 'demo' && (
              <p className="flex gap-3 rounded-xl border border-warning/30 bg-warning/[0.06] p-4 text-sm leading-relaxed text-muted">
                <Info className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
                This is a demo project, built to demonstrate design and development capabilities. It is not commissioned
                client work, and any business names or content shown are illustrative.
              </p>
            )}
            {description.length > 0 && (
              <Reveal as="section" aria-labelledby="overview-title">
                <h2 id="overview-title" className="text-xl font-medium tracking-tight">
                  Overview
                </h2>
                <div className="prose-ek mt-5 text-[17px] leading-relaxed text-muted">
                  {description.map((p, i) => (
                    <p key={i}>{p}</p>
                  ))}
                </div>
              </Reveal>
            )}
            <ListBlock title="Objectives" items={project.objectives} />
            <ListBlock title="Implemented functionality" items={project.features} />
          </div>
        </div>

        <Gallery images={project.gallery_images} title={project.title} />

        <nav className="container-page mt-24" aria-label="More projects">
          {/* Every cell is a real link: "All projects" fills whichever side has no neighbour. */}
          <div
            className={cn(
              'grid gap-px overflow-hidden rounded-[var(--radius-card)] border border-line bg-line',
              (previous || next) && 'sm:grid-cols-2',
            )}
          >
            {previous ? (
              <Link to={`/projects/${previous.slug}`} className="group bg-bg p-6 transition-colors hover:bg-card md:p-8">
                <span className="eyebrow inline-flex items-center gap-2">
                  <ArrowLeft className="size-3.5 transition-transform group-hover:-translate-x-1" aria-hidden /> Previous
                </span>
                <span className="mt-3 block text-lg font-medium tracking-tight md:text-xl">{previous.title}</span>
              </Link>
            ) : (
              <Link to="/projects" className="group bg-bg p-6 transition-colors hover:bg-card md:p-8">
                <span className="eyebrow inline-flex items-center gap-2">
                  <LayoutGrid className="size-3.5" aria-hidden /> Portfolio
                </span>
                <span className="mt-3 block text-lg font-medium tracking-tight md:text-xl">All projects</span>
              </Link>
            )}
            {next ? (
              <Link to={`/projects/${next.slug}`} className="group bg-bg p-6 text-right transition-colors hover:bg-card md:p-8">
                <span className="eyebrow inline-flex items-center gap-2">
                  Next <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-1" aria-hidden />
                </span>
                <span className="mt-3 block text-lg font-medium tracking-tight md:text-xl">{next.title}</span>
              </Link>
            ) : (
              previous && (
                <Link to="/projects" className="group bg-bg p-6 text-right transition-colors hover:bg-card md:p-8">
                  <span className="eyebrow inline-flex items-center gap-2">
                    Portfolio <LayoutGrid className="size-3.5" aria-hidden />
                  </span>
                  <span className="mt-3 block text-lg font-medium tracking-tight md:text-xl">All projects</span>
                </Link>
              )
            )}
          </div>
        </nav>
      </article>
      <CtaSection title="Want something similar?" />
    </>
  );
}
