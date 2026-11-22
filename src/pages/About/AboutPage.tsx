import { UserRound } from 'lucide-react';
import { Seo } from '@/components/common/Seo';
import { PageHeader } from '@/components/common/PageHeader';
import { Reveal } from '@/components/common/Reveal';
import { SmartImage } from '@/components/common/SmartImage';
import { Availability } from '@/components/common/Availability';
import { CtaSection } from '@/components/common/CtaSection';
import { EmptyState, ErrorState, Skeleton } from '@/components/common/Feedback';
import { SocialLinks } from '@/components/layout/Footer';
import { useSite } from '@/contexts/SiteContext';
import { paragraphs } from '@/lib/utils';

function Prose({ text }: { text: string }) {
  return (
    <div className="prose-ek text-[17px] leading-relaxed text-muted">
      {paragraphs(text).map((p, i) => (
        <p key={i}>{p}</p>
      ))}
    </div>
  );
}

export default function AboutPage() {
  const { profile, settings, loading, error, refresh } = useSite();
  const name = profile?.full_name || settings.website_name;

  const sections = profile
    ? [
        { id: 'background', title: 'Professional background', body: profile.background },
        { id: 'experience', title: 'Programming & web development', body: profile.experience },
        { id: 'approach', title: 'My approach to projects', body: profile.approach },
        { id: 'philosophy', title: 'Working philosophy', body: profile.philosophy },
      ].filter((s) => s.body.trim())
    : [];

  return (
    <>
      <Seo
        title="About"
        description={profile?.short_intro || `About ${name}, ${profile?.professional_title || settings.tagline}.`}
        image={profile?.avatar_path}
      />
      <PageHeader
        eyebrow="About"
        title={
          <>
            {name}. <em>{profile?.professional_title || settings.tagline}</em>
          </>
        }
      >
        <div className="mt-8 flex flex-wrap items-center gap-4">
          <Availability />
          <SocialLinks />
        </div>
      </PageHeader>

      <div className="container-page mt-16 md:mt-24">
        {loading ? (
          <div className="grid gap-12 md:grid-cols-12">
            <Skeleton className="aspect-[4/5] md:col-span-5" />
            <div className="space-y-4 md:col-span-7">
              <Skeleton className="h-6 w-3/4" />
              <Skeleton className="h-6 w-full" />
              <Skeleton className="h-6 w-5/6" />
            </div>
          </div>
        ) : error ? (
          <ErrorState message={error} onRetry={() => void refresh()} />
        ) : !profile ? (
          <EmptyState icon={UserRound} title="Profile coming soon" description="Personal details are being prepared." />
        ) : (
          <>
            {/* Portrait beside the introduction, biography and technologies, so both columns are filled. */}
            <div className="grid items-start gap-12 md:grid-cols-12 md:gap-16">
              <Reveal className="md:col-span-5">
                <SmartImage
                  path={profile.avatar_path}
                  alt={`Portrait of ${name}`}
                  priority
                  className="aspect-[4/5] w-full rounded-[var(--radius-card)] border border-line"
                />
                {settings.location && <p className="mt-4 text-sm text-muted">Based in {settings.location}</p>}
              </Reveal>
              <div className="md:col-span-7">
                {profile.short_intro && (
                  <Reveal>
                    <p className="text-2xl leading-[1.35] tracking-tight md:text-3xl">{profile.short_intro}</p>
                  </Reveal>
                )}
                {profile.biography && (
                  <Reveal delay={0.05} className="mt-8">
                    <Prose text={profile.biography} />
                  </Reveal>
                )}
                {profile.technologies.length > 0 && (
                  <Reveal as="section" className="mt-12 border-t border-line pt-8" aria-labelledby="about-tech">
                    <h2 id="about-tech" className="eyebrow">
                      Technologies I work with
                    </h2>
                    <ul className="mt-5 flex flex-wrap gap-2">
                      {profile.technologies.map((t) => (
                        <li key={t} className="rounded-lg border border-line-strong bg-card px-3.5 py-2 text-sm text-fg">
                          {t}
                        </li>
                      ))}
                    </ul>
                  </Reveal>
                )}
              </div>
            </div>

            {/* Detail sections span the full width in a two-column grid. */}
            {sections.length > 0 && (
              <div className="mt-20 grid gap-px overflow-hidden rounded-[var(--radius-card)] border border-line bg-line md:mt-28 md:grid-cols-2">
                {sections.map((s, i) => (
                  <Reveal
                    key={s.id}
                    as="section"
                    solid
                    delay={(i % 2) * 0.06}
                    className={'bg-bg' + (sections.length % 2 === 1 && i === sections.length - 1 ? ' md:col-span-2' : '')}
                    innerClassName="p-7 md:p-10"
                    aria-labelledby={`about-${s.id}`}
                  >
                    <p className="font-mono text-xs text-accent">{String(i + 1).padStart(2, '0')}</p>
                    <h2 id={`about-${s.id}`} className="mt-3 text-2xl font-medium tracking-tight md:text-[28px]">
                      {s.title}
                    </h2>
                    <div className="mt-5">
                      <Prose text={s.body} />
                    </div>
                  </Reveal>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      <CtaSection title="Let's build something useful." />
    </>
  );
}
