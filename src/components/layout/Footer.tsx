import { Link } from 'react-router';
import { ArrowUpRight, Mail, MapPin, Phone } from 'lucide-react';
import { Logo } from '@/components/common/Logo';
import { SOCIAL_ICONS, WhatsappIcon } from '@/components/common/BrandIcons';
import { useSite } from '@/contexts/SiteContext';
import { SOCIAL_KEYS, SOCIAL_LABELS } from '@/lib/constants';
import { isSafeHttpUrl } from '@/lib/utils';
import { telLink, whatsappLink } from '@/lib/phone';
import { NAV_ITEMS } from './Navbar';

/** Social icons from Site Settings (the single source for social links). */
export function SocialLinks({ className }: { className?: string }) {
  const { settings } = useSite();
  const links = settings.social_links ?? {};
  const items = SOCIAL_KEYS.filter((k) => isSafeHttpUrl(links[k]));
  if (!items.length) return null;
  return (
    <ul className={className ?? 'flex flex-wrap gap-2'}>
      {items.map((key) => {
        const Icon = SOCIAL_ICONS[key];
        return (
          <li key={key}>
            <a
              href={links[key]}
              target="_blank"
              rel="noopener noreferrer"
              className="grid size-10 place-items-center rounded-lg border border-line text-muted transition-colors hover:border-line-strong hover:text-fg"
              aria-label={SOCIAL_LABELS[key]}
            >
              <Icon />
            </a>
          </li>
        );
      })}
    </ul>
  );
}

export function Footer() {
  const { settings } = useSite();
  const year = new Date().getFullYear();
  const whatsapp = whatsappLink(settings.whatsapp_number);

  return (
    <footer className="relative mt-24 border-t border-line bg-bg-2/60 md:mt-32">
      <div className="container-page py-16 md:py-20">
        <div className="grid gap-12 md:grid-cols-12">
          <div className="md:col-span-5">
            <Logo />
            <p className="mt-6 max-w-sm text-sm leading-relaxed text-muted">{settings.description}</p>
            <SocialLinks className="mt-6 flex flex-wrap gap-2" />
          </div>

          <nav className="md:col-span-3" aria-label="Footer">
            <h2 className="eyebrow">Navigate</h2>
            <ul className="mt-5 grid grid-cols-2 gap-x-6 gap-y-3 text-sm md:grid-cols-1">
              {NAV_ITEMS.map((item) => (
                <li key={item.to}>
                  <Link to={item.to} className="text-muted transition-colors hover:text-fg">
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          <div className="md:col-span-4">
            <h2 className="eyebrow">Contact</h2>
            <ul className="mt-5 space-y-3 text-sm">
              {settings.contact_email && (
                <li>
                  <a href={`mailto:${settings.contact_email}`} className="inline-flex items-center gap-2.5 text-muted hover:text-fg">
                    <Mail className="size-4" aria-hidden /> {settings.contact_email}
                  </a>
                </li>
              )}
              {settings.contact_phone && (
                <li>
                  <a href={telLink(settings.contact_phone)} className="inline-flex items-center gap-2.5 text-muted hover:text-fg">
                    <Phone className="size-4" aria-hidden /> {settings.contact_phone}
                  </a>
                </li>
              )}
              {whatsapp && (
                <li>
                  <a
                    href={whatsapp}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2.5 text-muted hover:text-fg"
                  >
                    <WhatsappIcon /> WhatsApp
                  </a>
                </li>
              )}
              {settings.location && (
                <li className="inline-flex items-center gap-2.5 text-muted">
                  <MapPin className="size-4" aria-hidden /> {settings.location}
                </li>
              )}
            </ul>
            <Link
              to="/contact"
              className="group mt-8 inline-flex items-center gap-2 whitespace-nowrap text-2xl font-medium tracking-tight lg:text-3xl"
            >
              Start a project
              <ArrowUpRight className="size-6 shrink-0 text-accent transition-transform duration-300 group-hover:-translate-y-1 group-hover:translate-x-1" />
            </Link>
          </div>
        </div>

        <div className="mt-16 flex flex-col gap-3 border-t border-line pt-8 text-xs text-subtle sm:flex-row sm:items-center sm:justify-between">
          <p>
            © {year} {settings.website_name} · {settings.studio_name}. All rights reserved.
          </p>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-6">
            {settings.footer_text && <p>{settings.footer_text}</p>}
            <Link to="/privacy" className="underline-offset-4 hover:text-fg hover:underline">
              Privacy Policy
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
