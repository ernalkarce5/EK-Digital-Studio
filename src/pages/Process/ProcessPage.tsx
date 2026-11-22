import { ArrowDownRight, Check } from 'lucide-react';
import { Seo } from '@/components/common/Seo';
import { PageHeader } from '@/components/common/PageHeader';
import { Reveal } from '@/components/common/Reveal';
import { CtaSection } from '@/components/common/CtaSection';
import { PROCESS_STAGES } from '@/lib/constants';

export default function ProcessPage() {
  return (
    <>
      <Seo
        title="Development Process"
        description="How a project with EK Digital Studio works: consultation, planning, design approval, development, testing and launch."
      />
      <PageHeader
        eyebrow="Process"
        title={
          <>
            How we <em>work together</em>
          </>
        }
        description="A transparent, staged process: you always know what is happening, what comes next and what is expected from each side."
      >
        <ol className="mt-12 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
          {PROCESS_STAGES.map((s, i) => (
            <li key={s.title}>
              <a
                href={`#stage-${i + 1}`}
                className="flex h-full flex-col rounded-lg border border-line px-3 py-3 text-sm transition-colors hover:border-line-strong hover:bg-card"
              >
                <span className="font-mono text-[11px] text-accent">{String(i + 1).padStart(2, '0')}</span>
                <span className="mt-1 text-fg">{s.title}</span>
              </a>
            </li>
          ))}
        </ol>
      </PageHeader>

      <div className="container-page mt-20 md:mt-28">
        <ol className="relative">
          {PROCESS_STAGES.map((stage, i) => (
            <li key={stage.title} id={`stage-${i + 1}`} className="scroll-mt-28">
              <Reveal className="grid gap-8 border-t border-line py-14 md:grid-cols-12 md:py-20">
                <div className="md:col-span-5">
                  <div className="md:sticky md:top-28">
                    <span className="font-serif text-7xl italic leading-none text-accent-2 md:text-8xl" aria-hidden>
                      {String(i + 1).padStart(2, '0')}
                    </span>
                    <h2 className="mt-6 text-3xl font-medium tracking-tight md:text-4xl">
                      <span className="sr-only">Stage {i + 1}: </span>
                      {stage.title}
                    </h2>
                    <p className="mt-3 text-lg text-muted">{stage.summary}</p>
                  </div>
                </div>
                <div className="md:col-span-7">
                  <p className="text-[17px] leading-relaxed text-fg/90">{stage.description}</p>
                  <h3 className="eyebrow mt-10">What you can expect</h3>
                  <ul className="mt-4 space-y-3">
                    {stage.expect.map((e) => (
                      <li key={e} className="flex gap-3 text-[15px] leading-relaxed text-muted">
                        <Check className="mt-1 size-4 shrink-0 text-success" aria-hidden />
                        {e}
                      </li>
                    ))}
                  </ul>
                  <div className="mt-10 inline-flex items-center gap-3 rounded-lg border border-line-strong bg-card px-4 py-3 text-sm">
                    <ArrowDownRight className="size-4 text-accent" aria-hidden />
                    <span className="text-muted">Outcome:</span>
                    <span className="font-medium">{stage.deliverable}</span>
                  </div>
                </div>
              </Reveal>
            </li>
          ))}
        </ol>
      </div>

      <CtaSection title="Ready to start with a conversation?" />
    </>
  );
}
