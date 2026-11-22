import { useSearchParams } from 'react-router';
import { ArrowUpRight, Mail, MapPin, Phone } from 'lucide-react';
import { Seo } from '@/components/common/Seo';
import { PageHeader } from '@/components/common/PageHeader';
import { Reveal } from '@/components/common/Reveal';
import { Availability } from '@/components/common/Availability';
import { InstagramIcon, LinkedinIcon, WhatsappIcon } from '@/components/common/BrandIcons';
import { ContactForm } from '@/components/forms/ContactForm';
import { useSite } from '@/contexts/SiteContext';
import { isSafeHttpUrl } from '@/lib/utils';
import { formatPhone, telLink, whatsappLink } from '@/lib/phone';
import type { ReactNode } from 'react';

function ContactRow({ href, icon, label, value, external }: { href: string; icon: ReactNode; label: string; value: string; external?: boolean }) {
  return (
    <li>
      <a
        href={href}
        {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
        className="group flex items-center gap-4 border-b border-line py-4 transition-colors hover:border-line-strong"
      >
        <span className="grid size-10 shrink-0 place-items-center rounded-lg border border-line-strong text-muted transition-colors group-hover:text-fg">
          {icon}
        </span>
        <span className="min-w-0 flex-1">
          <span className="eyebrow block text-[10px]">{label}</span>
          <span className="mt-0.5 block truncate text-[15px]">{value}</span>
        </span>
        <ArrowUpRight
          className="size-4 text-subtle transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-accent"
          aria-hidden
        />
      </a>
    </li>
  );
}

export default function ContactPage() {
  const { settings } = useSite();
  const [params] = useSearchParams();
  const social = settings.social_links ?? {};
  const email = settings.contact_email;
  const whatsapp = whatsappLink(settings.whatsapp_number);

  return (
    <>
      <Seo title="Contact" description="Start a project with EK Digital Studio. Tell me about your website or web application." />
      <PageHeader
        eyebrow="Contact"
        title={
          <>
            Let&apos;s talk about <em>your project</em>
          </>
        }
        description="Share a few details about what you are planning. The more context you give, the more useful my first reply will be."
      >
        <div className="mt-8">
          <Availability />
        </div>
      </PageHeader>

      <div className="container-page mt-16 grid gap-14 md:mt-24 lg:grid-cols-12 lg:gap-20">
        {/* On mobile the form comes first; on desktop the details sit in the left column. */}
        <Reveal className="order-2 lg:order-1 lg:col-span-4">
          <h2 className="eyebrow">Direct contact</h2>
          <ul className="mt-4 border-t border-line">
            {email && <ContactRow href={`mailto:${email}`} icon={<Mail className="size-4" />} label="Email" value={email} />}
            {settings.contact_phone && (
              <ContactRow
                href={telLink(settings.contact_phone)}
                icon={<Phone className="size-4" />}
                label="Phone"
                value={settings.contact_phone}
              />
            )}
            {whatsapp && (
              <ContactRow
                href={whatsapp}
                icon={<WhatsappIcon />}
                label="WhatsApp"
                value={formatPhone(settings.whatsapp_number, { international: true })}
                external
              />
            )}
            {isSafeHttpUrl(social.instagram) && (
              <ContactRow
                href={social.instagram}
                icon={<InstagramIcon />}
                label="Instagram"
                value={social.instagram.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '')}
                external
              />
            )}
            {isSafeHttpUrl(social.linkedin) && (
              <ContactRow
                href={social.linkedin}
                icon={<LinkedinIcon />}
                label="LinkedIn"
                value={social.linkedin.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '')}
                external
              />
            )}
          </ul>
          {settings.location && (
            <p className="mt-6 flex items-center gap-2 text-sm text-muted">
              <MapPin className="size-4" aria-hidden /> {settings.location}
            </p>
          )}
          <div className="mt-10 rounded-xl border border-line bg-card p-6">
            <h3 className="font-medium">What happens next?</h3>
            <ol className="mt-4 space-y-3 text-sm leading-relaxed text-muted">
              <li>
                <span className="mr-2 font-mono text-xs text-accent">01</span>I read your message personally.
              </li>
              <li>
                <span className="mr-2 font-mono text-xs text-accent">02</span>I reply with questions or a suggestion for a short call.
              </li>
              <li>
                <span className="mr-2 font-mono text-xs text-accent">03</span>If it is a good fit, you receive a written proposal.
              </li>
            </ol>
          </div>
        </Reveal>

        <Reveal delay={0.08} className="order-1 lg:order-2 lg:col-span-8">
          <div className="relative rounded-2xl border border-line-strong bg-card/60 p-5 sm:p-8 md:p-10">
            <h2 className="mb-8 text-2xl font-medium tracking-tight">Project inquiry</h2>
            <ContactForm defaultType={params.get('type') ?? undefined} />
          </div>
        </Reveal>
      </div>
    </>
  );
}
