import { Mail } from 'lucide-react';
import { Button } from './Button';
import { Reveal } from './Reveal';
import { useSite } from '@/contexts/SiteContext';

export function CtaSection({
  title = 'Have a project in mind?',
  text = 'Tell me what you are planning. I will reply with honest questions, ideas and a clear next step.',
}: {
  title?: string;
  text?: string;
}) {
  const { settings } = useSite();
  return (
    <section className="container-page mt-24 md:mt-36" aria-labelledby="cta-title">
      <Reveal className="relative overflow-hidden rounded-2xl border border-line-strong bg-card px-6 py-14 sm:px-12 md:py-20">
        <div aria-hidden className="grid-lines absolute inset-0 opacity-60 [mask-image:radial-gradient(ellipse_at_top_right,black,transparent_70%)]" />
        <div aria-hidden className="absolute -right-24 -top-24 size-80 rounded-full bg-accent/20 blur-3xl" />
        <div className="relative flex flex-col gap-10 md:flex-row md:items-end md:justify-between">
          <div className="max-w-2xl">
            <p className="eyebrow">Let&apos;s work together</p>
            <h2 id="cta-title" className="text-h2 mt-4">
              {title}
            </h2>
            <p className="mt-5 max-w-lg text-base leading-relaxed text-muted md:text-lg">{text}</p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row md:flex-col lg:flex-row">
            <Button to="/contact" size="lg" arrow>
              Start a Project
            </Button>
            {settings.contact_email && (
              <Button href={`mailto:${settings.contact_email}`} variant="secondary" size="lg" icon={Mail}>
                Email me
              </Button>
            )}
          </div>
        </div>
      </Reveal>
    </section>
  );
}
