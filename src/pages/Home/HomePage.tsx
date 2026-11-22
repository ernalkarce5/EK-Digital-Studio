import { Link } from 'react-router';
import { motion } from 'framer-motion';
import { ArrowRight, ArrowUpRight, FolderOpen, Quote } from 'lucide-react';
import { Seo } from '@/components/common/Seo';
import { Button } from '@/components/common/Button';
import { Reveal } from '@/components/common/Reveal';
import { SectionHeading } from '@/components/common/SectionHeading';
import { Availability } from '@/components/common/Availability';
import { SmartImage } from '@/components/common/SmartImage';
import { ServiceIcon } from '@/components/common/ServiceIcon';
import { CtaSection } from '@/components/common/CtaSection';
import { EmptyState, ErrorState, Skeleton } from '@/components/common/Feedback';
import { HeroVisual } from '@/components/home/HeroVisual';
import { ProjectCard, ProjectCardSkeleton } from '@/components/projects/ProjectCard';
import { useSite } from '@/contexts/SiteContext';
import { useAsync } from '@/hooks/useAsync';
import { listFeaturedProjects, listPublishedProjects } from '@/services/projects';
import { listPublishedServices } from '@/services/studioServices';
import { listPublishedTestimonials } from '@/services/testimonials';
import { PROCESS_OVERVIEW } from '@/lib/constants';
import { mediaUrl } from '@/lib/storage';

const EASE = [0.16, 1, 0.3, 1] as const;

function Hero() {
  const { settings } = useSite();
  const words = settings.hero_heading.trim().split(/\s+/);

  return (
    <section className="relative overflow-hidden pt-28 md:pt-36" aria-labelledby="hero-title">
      <div
        aria-hidden
        className="grid-lines pointer-events-none absolute inset-0 -z-10 [mask-image:radial-gradient(ellipse_70%_60%_at_50%_0%,black,transparent)]"
      />
      <div className="container-page grid items-center gap-16 pb-20 lg:grid-cols-[1.3fr_1fr] lg:gap-12 lg:pb-28">
        <div>
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, ease: EASE }}>
            <Availability />
          </motion.div>
          <h1 id="hero-title" className="text-display mt-7">
            {words.map((word, i) => {
              const last = i === words.length - 1;
              return (
                <span key={`${word}-${i}`} className="inline-block overflow-hidden pb-[0.08em] align-bottom">
                  <motion.span
                    className={
                      last
                        ? 'inline-block font-serif font-normal italic tracking-[-0.01em] text-accent-2'
                        : 'inline-block'
                    }
                    initial={{ y: '105%' }}
                    animate={{ y: 0 }}
                    transition={{ duration: 0.9, ease: EASE, delay: 0.1 + i * 0.05 }}
                  >
                    {word}
                  </motion.span>
                  {!last && ' '}
                </span>
              );
            })}
          </h1>
          <motion.p
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, ease: EASE, delay: 0.5 }}
            className="mt-7 max-w-xl text-lg leading-relaxed text-muted"
          >
            {settings.hero_subheading}
          </motion.p>
          <motion.div
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, ease: EASE, delay: 0.65 }}
            className="mt-10 flex flex-col gap-3 xs:flex-row"
          >
            <Button to="/projects" size="lg" arrow>
              Explore My Work
            </Button>
            <Button to="/contact" size="lg" variant="secondary">
              Let&apos;s Talk
            </Button>
          </motion.div>
        </div>
        <div className="pb-10 lg:pb-0">
          <HeroVisual />
        </div>
      </div>
    </section>
  );
}

function Introduction() {
  const { settings, profile, loading } = useSite();
  const intro = profile?.short_intro || settings.description;
  const name = profile?.full_name || settings.website_name;

  return (
    <section className="container-page border-t border-line pt-20 md:pt-28" aria-labelledby="intro-title">
      <div className="grid gap-12 md:grid-cols-12">
        <Reveal className="md:col-span-4">
          <p className="eyebrow flex items-center gap-3">
            <span className="text-accent">01</span>
            <span className="h-px w-6 bg-line-strong" aria-hidden />
            Introduction
          </p>
          <div className="mt-8 flex items-center gap-4">
            {profile?.avatar_path && (
              <SmartImage path={profile.avatar_path} alt={name} className="size-16 shrink-0 rounded-full border border-line" />
            )}
            <div>
              <p className="font-medium">{name}</p>
              <p className="text-sm text-muted">{profile?.professional_title || settings.tagline}</p>
            </div>
          </div>
        </Reveal>
        <div className="md:col-span-8">
          <h2 id="intro-title" className="sr-only">
            About {name}
          </h2>
          {loading ? (
            <div className="space-y-3">
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-5/6" />
              <Skeleton className="h-8 w-2/3" />
            </div>
          ) : (
            <Reveal>
              <p className="text-2xl leading-[1.35] tracking-tight md:text-[34px] md:leading-[1.3]">{intro}</p>
            </Reveal>
          )}
          <Reveal delay={0.1} className="mt-10 flex flex-wrap items-center gap-x-8 gap-y-4">
            <Link to="/about" className="group inline-flex items-center gap-2 text-sm font-medium">
              More about me
              <ArrowRight className="size-4 text-accent transition-transform group-hover:translate-x-1" aria-hidden />
            </Link>
            <span className="text-sm text-subtle">
              Personal brand of {name} · operating as {settings.studio_name}
            </span>
          </Reveal>
        </div>
      </div>
    </section>
  );
}

function FeaturedProjects() {
  // Featured projects first; if fewer than two are featured, top up with the most
  // recent published ones so the two-column layout never shows a lone card.
  const { data, loading, error, publicError, reload } = useAsync(async () => {
    const featured = await listFeaturedProjects(4);
    if (featured.length >= 2) return featured;
    const rest = (await listPublishedProjects()).filter((p) => !p.is_featured);
    return [...featured, ...rest].slice(0, Math.max(2, featured.length));
  }, []);

  return (
    <section className="container-page mt-24 md:mt-36" aria-labelledby="work-title">
      <SectionHeading
        index="02"
        eyebrow="Selected work"
        title={
          <span id="work-title">
            Recent projects, <em>built with care</em>
          </span>
        }
        action={
          <Button to="/projects" variant="secondary" arrow>
            All projects
          </Button>
        }
      />
      <div className="mt-14">
        {loading ? (
          <div className="grid gap-x-8 gap-y-14 md:grid-cols-2">
            <ProjectCardSkeleton />
            <ProjectCardSkeleton />
          </div>
        ) : error ? (
          <ErrorState message={publicError} onRetry={reload} />
        ) : !data?.length ? (
          <EmptyState
            icon={FolderOpen}
            title="New work is on its way"
            description="Projects are being prepared for this portfolio. In the meantime, feel free to get in touch."
          />
        ) : (
          <div className="grid gap-x-8 gap-y-14 md:grid-cols-2">
            {data.map((p, i) => (
              <div key={p.id} className={i % 2 === 1 ? 'md:mt-20' : undefined}>
                <ProjectCard project={p} index={i} size="large" />
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function ServicesOverview() {
  const { data, loading, error, publicError, reload } = useAsync(listPublishedServices, []);
  const services = (data ?? []).slice(0, 6);

  return (
    <section className="container-page mt-24 md:mt-36" aria-labelledby="services-title">
      <SectionHeading
        index="03"
        eyebrow="Services"
        title={
          <span id="services-title">
            What I can <em>help you with</em>
          </span>
        }
        description="From a first website to custom booking platforms. Each engagement is scoped to what your business actually needs."
      />
      <div className="mt-14">
        {loading ? (
          <div className="grid gap-px overflow-hidden rounded-[var(--radius-card)] border border-line bg-line sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-56 bg-bg p-8">
                <Skeleton className="size-10" />
                <Skeleton className="mt-8 h-5 w-1/2" />
                <Skeleton className="mt-3 h-4 w-full" />
              </div>
            ))}
          </div>
        ) : error ? (
          <ErrorState message={publicError} onRetry={reload} />
        ) : !services.length ? (
          <EmptyState title="Services coming soon" description="Service details are being updated." />
        ) : (
          <ul className="grid gap-px overflow-hidden rounded-[var(--radius-card)] border border-line bg-line sm:grid-cols-2 lg:grid-cols-3">
            {services.map((s, i) => (
              <Reveal as="li" solid key={s.id} delay={(i % 3) * 0.06} className="bg-bg" innerClassName="h-full">
                <Link
                  to={`/services#${s.slug}`}
                  className="group flex h-full flex-col p-7 transition-colors duration-300 hover:bg-card md:p-9"
                >
                  <div className="flex items-start justify-between">
                    <span className="grid size-11 place-items-center rounded-lg border border-line-strong bg-card text-accent-2 transition-colors group-hover:border-accent/40">
                      <ServiceIcon name={s.icon} className="size-5" />
                    </span>
                    <span className="font-mono text-xs text-subtle">{String(i + 1).padStart(2, '0')}</span>
                  </div>
                  <h3 className="mt-10 text-xl font-medium tracking-tight">{s.title}</h3>
                  <p className="mt-2 text-[15px] leading-relaxed text-muted">{s.summary}</p>
                  <span className="mt-auto inline-flex items-center gap-1.5 pt-6 text-sm text-muted transition-colors group-hover:text-fg">
                    Learn more
                    <ArrowUpRight className="size-4 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" aria-hidden />
                  </span>
                </Link>
              </Reveal>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

function ProcessOverview() {
  return (
    <section className="container-page mt-24 md:mt-36" aria-labelledby="process-title">
      <SectionHeading
        index="04"
        eyebrow="Process"
        title={
          <span id="process-title">
            A clear path <em>from idea to launch</em>
          </span>
        }
        action={
          <Button to="/process" variant="secondary" arrow>
            How we work
          </Button>
        }
      />
      <ol className="mt-14 grid gap-px overflow-hidden rounded-[var(--radius-card)] border border-line bg-line sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {PROCESS_OVERVIEW.map((step, i) => (
          <Reveal as="li" solid key={step.title} delay={i * 0.05} className="bg-bg" innerClassName="relative flex h-full flex-col p-6 md:p-7">
            <span className="font-mono text-xs text-accent">{String(i + 1).padStart(2, '0')}</span>
            <h3 className="mt-8 text-lg font-medium tracking-tight">{step.title}</h3>
            <p className="mt-2 text-sm leading-relaxed text-muted">{step.text}</p>
          </Reveal>
        ))}
      </ol>
    </section>
  );
}

/** Rendered only when real, published testimonials exist. */
function Testimonials() {
  const { data } = useAsync(listPublishedTestimonials, []);
  if (!data?.length) return null;
  return (
    <section className="container-page mt-24 md:mt-36" aria-labelledby="testimonials-title">
      <SectionHeading
        index="05"
        eyebrow="Kind words"
        title={
          <span id="testimonials-title">
            What clients <em>say</em>
          </span>
        }
      />
      <ul className="mt-14 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {data.map((t, i) => (
          <Reveal as="li" key={t.id} delay={(i % 3) * 0.06}>
            <figure className="flex h-full flex-col rounded-[var(--radius-card)] border border-line bg-card p-7">
              <Quote className="size-5 text-accent" aria-hidden />
              <blockquote className="mt-5 flex-1 text-[15px] leading-relaxed text-fg">{t.content}</blockquote>
              <figcaption className="mt-6 flex items-center gap-3 border-t border-line pt-5">
                {mediaUrl(t.avatar_path) && (
                  <SmartImage path={t.avatar_path} alt={t.author_name} className="size-10 rounded-full" />
                )}
                <div>
                  <p className="text-sm font-medium">{t.author_name}</p>
                  <p className="text-xs text-muted">{[t.author_role, t.company].filter(Boolean).join(', ')}</p>
                </div>
              </figcaption>
            </figure>
          </Reveal>
        ))}
      </ul>
    </section>
  );
}

export default function HomePage() {
  return (
    <>
      <Seo />
      <Hero />
      <Introduction />
      <FeaturedProjects />
      <ServicesOverview />
      <ProcessOverview />
      <Testimonials />
      <CtaSection />
    </>
  );
}
