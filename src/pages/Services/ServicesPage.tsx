import { Link } from 'react-router';
import { ArrowDown, ArrowUpRight, Check, Plus } from 'lucide-react';
import { Seo } from '@/components/common/Seo';
import { PageHeader } from '@/components/common/PageHeader';
import { Button } from '@/components/common/Button';
import { Reveal } from '@/components/common/Reveal';
import { ServiceIcon } from '@/components/common/ServiceIcon';
import { CtaSection } from '@/components/common/CtaSection';
import { EmptyState, ErrorState, Skeleton } from '@/components/common/Feedback';
import { useAsync } from '@/hooks/useAsync';
import { listPublishedServices } from '@/services/studioServices';
import { CONTACT_PROJECT_TYPES } from '@/lib/constants';
import { cn, paragraphs } from '@/lib/utils';
import type { Service } from '@/types/database';

/** Maps a service to the closest contact-form project type for prefilling. */
const SLUG_TO_TYPE: Record<string, (typeof CONTACT_PROJECT_TYPES)[number]> = {
  'responsive-web-design': 'Website Development',
  'booking-reservation-systems': 'Booking System',
  'custom-web-applications': 'Custom Web Application',
  'website-maintenance': 'Website Maintenance',
};

function contactLink(s: Service) {
  const type =
    SLUG_TO_TYPE[s.slug] ?? (CONTACT_PROJECT_TYPES as readonly string[]).find((t) => t === s.title) ?? undefined;
  return type ? `/contact?type=${encodeURIComponent(type)}` : '/contact';
}

/**
 * Presentation groups for the seeded services. Services added later in the
 * admin (unknown slugs) appear under "Other services", so nothing is hidden.
 */
const GROUPS = [
  {
    id: 'design',
    title: 'Design',
    text: 'Shaping how your website looks, reads and works on every screen.',
    slugs: ['website-design', 'website-redesign', 'responsive-web-design'],
  },
  {
    id: 'build',
    title: 'Build',
    text: 'Turning approved designs into fast, reliable websites and applications.',
    slugs: ['website-development', 'booking-reservation-systems', 'custom-web-applications'],
  },
  {
    id: 'care',
    title: 'Care & support',
    text: 'Keeping things up to date and working after launch.',
    slugs: ['website-maintenance'],
  },
] as const;

function groupServices(services: Service[]) {
  const known = new Set<string>(GROUPS.flatMap((g) => [...g.slugs]));
  const groups = GROUPS.map((g) => ({
    id: g.id as string,
    title: g.title as string,
    text: g.text as string,
    items: services.filter((s) => (g.slugs as readonly string[]).includes(s.slug)),
  }));
  const other = services.filter((s) => !known.has(s.slug));
  if (other.length) groups.push({ id: 'other', title: 'Other services', text: 'Additional ways I can help.', items: other });
  return groups.filter((g) => g.items.length > 0);
}

/**
 * Spans for the last overview card so the grid never ends with empty cells
 * (which would show the divider colour). Columns: 1 (mobile), 2 (sm), 3 (lg).
 */
function lastCardSpan(count: number): string {
  const sm = count % 2 === 1 ? 'sm:col-span-2' : '';
  const lgRemainder = count % 3;
  const lg = lgRemainder === 1 ? 'lg:col-span-3' : lgRemainder === 2 ? 'lg:col-span-2' : sm ? 'lg:col-span-1' : '';
  return cn(sm, lg);
}

function ServiceDetail({ service, index, wide }: { service: Service; index: number; wide: boolean }) {
  const description = paragraphs(service.description);
  return (
    <Reveal
      as="article"
      id={service.slug}
      data-service={service.slug}
      className={cn(
        'scroll-mt-28 flex flex-col rounded-[var(--radius-card)] border border-line bg-card p-6 md:p-8',
        wide && 'lg:col-span-2 lg:grid lg:grid-cols-12 lg:gap-10',
      )}
    >
      <div className={cn(wide && 'lg:col-span-5')}>
        <div className="flex items-center justify-between">
          <span className="grid size-11 place-items-center rounded-lg border border-line-strong bg-bg text-accent-2">
            <ServiceIcon name={service.icon} className="size-5" />
          </span>
          <span className="font-mono text-xs text-subtle">{String(index + 1).padStart(2, '0')}</span>
        </div>
        <h3 className="mt-6 text-2xl font-medium tracking-tight">{service.title}</h3>
        <p className="mt-2 text-[17px] leading-relaxed text-fg/90">{service.summary}</p>
        {description.length > 0 && (
          <div className="prose-ek mt-4 text-[15px] leading-relaxed text-muted">
            {description.map((p, j) => (
              <p key={j}>{p}</p>
            ))}
          </div>
        )}
        {wide && (
          <Button to={contactLink(service)} variant="secondary" className="mt-8 hidden lg:inline-flex" arrow>
            Discuss this service
          </Button>
        )}
      </div>
      <div className={cn('mt-8 grid gap-6 border-t border-line pt-6 sm:grid-cols-2', wide && 'lg:col-span-7 lg:mt-0 lg:border-l lg:border-t-0 lg:pl-10 lg:pt-0')}>
        {service.benefits.length > 0 && (
          <div>
            <h4 className="eyebrow">Benefits</h4>
            <ul className="mt-3 space-y-2.5">
              {service.benefits.map((b) => (
                <li key={b} className="flex gap-2.5 text-[15px] leading-relaxed">
                  <Plus className="mt-1 size-4 shrink-0 text-accent" aria-hidden />
                  {b}
                </li>
              ))}
            </ul>
          </div>
        )}
        {service.features.length > 0 && (
          <div>
            <h4 className="eyebrow">What&apos;s included</h4>
            <ul className="mt-3 space-y-2.5">
              {service.features.map((f) => (
                <li key={f} className="flex gap-2.5 text-[15px] leading-relaxed text-muted">
                  <Check className="mt-1 size-4 shrink-0 text-success" aria-hidden />
                  {f}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
      <div className={cn('mt-auto pt-8', wide && 'lg:hidden')}>
        <Button to={contactLink(service)} variant="secondary" arrow>
          Discuss this service
        </Button>
      </div>
    </Reveal>
  );
}

export default function ServicesPage() {
  const { data, loading, error, publicError, reload } = useAsync(listPublishedServices, []);
  const services = data ?? [];
  const groups = groupServices(services);
  const order = new Map(services.map((s, i) => [s.id, i]));

  return (
    <>
      <Seo
        title="Services"
        description="Website design, development, redesigns, responsive design, booking systems, custom web applications and maintenance."
      />
      <PageHeader
        eyebrow="Services"
        title={
          <>
            Services shaped around <em>what you need</em>
          </>
        }
        description="Every project is scoped individually. Start with the overview, then jump to the details of any service. Not sure which fits? Describe your goal and we will work it out together."
      />

      <div className="container-page mt-14 md:mt-20">
        {loading ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-44 w-full" />
            ))}
          </div>
        ) : error ? (
          <ErrorState message={publicError} onRetry={reload} />
        ) : !services.length ? (
          <EmptyState title="Services are being updated" description="Please get in touch to discuss your project." />
        ) : (
          <>
            {/* Overview: every service at a glance, each card jumps to its details. */}
            <nav aria-label="Services overview">
              <ul className="grid gap-px overflow-hidden rounded-[var(--radius-card)] border border-line bg-line sm:grid-cols-2 lg:grid-cols-3">
                {services.map((s, i) => (
                  <Reveal
                    as="li"
                    solid
                    key={s.id}
                    delay={(i % 3) * 0.05}
                    className={cn('bg-bg', i === services.length - 1 && lastCardSpan(services.length))}
                    innerClassName="h-full"
                  >
                    <a href={`#${s.slug}`} className="group flex h-full flex-col p-6 transition-colors hover:bg-card md:p-7">
                      <div className="flex items-start justify-between">
                        <span className="grid size-10 place-items-center rounded-lg border border-line-strong bg-card text-accent-2 transition-colors group-hover:border-accent/40">
                          <ServiceIcon name={s.icon} className="size-[18px]" />
                        </span>
                        <span className="font-mono text-xs text-subtle">{String(i + 1).padStart(2, '0')}</span>
                      </div>
                      <h2 className="mt-6 text-lg font-medium tracking-tight">{s.title}</h2>
                      <p className="mt-1.5 text-sm leading-relaxed text-muted">{s.summary}</p>
                      <span className="mt-auto inline-flex items-center gap-1.5 pt-5 text-sm text-muted transition-colors group-hover:text-fg">
                        View details
                        <ArrowDown className="size-3.5 transition-transform group-hover:translate-y-0.5" aria-hidden />
                      </span>
                    </a>
                  </Reveal>
                ))}
              </ul>
            </nav>

            {/* Details, grouped. */}
            {groups.map((g) => (
              <section key={g.id} aria-labelledby={`group-${g.id}`} className="mt-24 md:mt-32">
                <Reveal className="mb-8 flex flex-col gap-2 border-b border-line pb-6 md:flex-row md:items-end md:justify-between">
                  <h2 id={`group-${g.id}`} className="text-h2">
                    {g.title}
                  </h2>
                  <p className="max-w-md text-muted md:text-right">{g.text}</p>
                </Reveal>
                <div className="grid gap-6 lg:grid-cols-2">
                  {g.items.map((s, i) => (
                    <ServiceDetail
                      key={s.id}
                      service={s}
                      index={order.get(s.id) ?? i}
                      wide={g.items.length % 2 === 1 && i === g.items.length - 1}
                    />
                  ))}
                </div>
              </section>
            ))}
          </>
        )}
        <p className="mt-12 text-sm text-muted">
          Final scope, timeline and pricing are always agreed in writing before work begins. See{' '}
          <Link to="/process" className="inline-flex items-center gap-1 text-fg underline underline-offset-4">
            how the process works <ArrowUpRight className="size-3.5" aria-hidden />
          </Link>
          .
        </p>
      </div>

      <CtaSection
        title="Not sure which service fits?"
        text="Describe what you want to achieve. I will suggest the most sensible approach for your goals and budget."
      />
    </>
  );
}
