import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { Seo } from '@/components/common/Seo';
import { PageHeader } from '@/components/common/PageHeader';
import { useSite } from '@/contexts/SiteContext';

/** Update this date whenever the policy text changes. */
export const PRIVACY_LAST_UPDATED = '22 November 2026';

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="scroll-mt-28 border-t border-line pt-10">
      <h2 id={`${id}-title`} className="text-2xl font-medium tracking-tight">
        {title}
      </h2>
      <div className="mt-5 space-y-4 text-[16px] leading-relaxed text-muted [&_li]:pl-1 [&_strong]:font-medium [&_strong]:text-fg [&_ul]:list-disc [&_ul]:space-y-2 [&_ul]:pl-5">
        {children}
      </div>
    </section>
  );
}

const TOC = [
  ['controller', 'Who is responsible'],
  ['contact-form', 'Contact form'],
  ['browsing', 'Visiting the website'],
  ['storage', 'Cookies and local storage'],
  ['processors', 'Service providers'],
  ['retention', 'How long data is kept'],
  ['rights', 'Your rights'],
  ['changes', 'Changes to this policy'],
] as const;

export default function PrivacyPage() {
  const { settings } = useSite();
  const email = settings.contact_email;
  const contactLine = email ? (
    <a href={`mailto:${email}`} className="text-fg underline underline-offset-2">
      {email}
    </a>
  ) : (
    <Link to="/contact" className="text-fg underline underline-offset-2">
      the contact page
    </Link>
  );

  return (
    <>
      <Seo title="Privacy Policy" description={`How ${settings.website_name} handles personal data submitted through this website.`} />
      <PageHeader
        eyebrow="Legal"
        title={
          <>
            Privacy <em>Policy</em>
          </>
        }
        description="What personal data this website collects, why, and what you can do about it. Written to be read, not skimmed past."
      >
        <p className="mt-6 text-sm text-subtle">Last updated: {PRIVACY_LAST_UPDATED}</p>
      </PageHeader>

      <div className="container-page mt-16 grid gap-12 md:mt-20 lg:grid-cols-12">
        <nav aria-label="On this page" className="lg:col-span-3">
          <ol className="space-y-2 text-sm lg:sticky lg:top-28">
            {TOC.map(([id, label], i) => (
              <li key={id}>
                <a href={`#${id}`} className="flex gap-3 text-muted transition-colors hover:text-fg">
                  <span className="font-mono text-xs text-accent">{String(i + 1).padStart(2, '0')}</span>
                  {label}
                </a>
              </li>
            ))}
          </ol>
        </nav>

        <div className="max-w-3xl space-y-12 lg:col-span-9">
          <Section id="controller" title="Who is responsible">
            <p>
              This website is operated by <strong>{settings.website_name}</strong>, trading as{' '}
              <strong>{settings.studio_name}</strong>
              {settings.location ? `, based in ${settings.location}` : ''}. For any privacy question or request, contact{' '}
              {contactLine}.
            </p>
          </Section>

          <Section id="contact-form" title="Contact form">
            <p>When you send a project inquiry, the following is stored:</p>
            <ul>
              <li>
                <strong>Details you enter:</strong> full name, email address, project type and project description, plus
                company name, estimated budget and preferred contact method if you provide them.
              </li>
              <li>
                <strong>Phone number:</strong> only if you choose phone or WhatsApp as your preferred contact method.
              </li>
              <li>
                <strong>Technical data for spam protection:</strong> a one-way hash of your IP address (the IP address
                itself is not stored) and your browser&apos;s user-agent string. These are used to limit repeated
                submissions and to detect abuse.
              </li>
            </ul>
            <p>
              The data is used only to read and answer your inquiry and, if you wish, to prepare a proposal. It is not
              sold, shared for marketing or used for automated decision-making. You are not added to any mailing list.
            </p>
            <p>
              If you are in the EU/EEA, the legal bases are taking steps at your request before entering into a contract
              (GDPR Art. 6(1)(b)) and a legitimate interest in protecting the form from spam and abuse (Art. 6(1)(f)).
            </p>
          </Section>

          <Section id="browsing" title="Visiting the website">
            <p>
              This website does not use analytics, advertising or tracking tools, and does not build visitor profiles.
              Fonts are served from this website itself, not from third-party font services.
            </p>
            <p>
              As with any website, the hosting provider automatically processes technical data needed to deliver pages
              securely, such as your IP address, the time of the request and the page requested. These are standard
              server logs under the hosting provider&apos;s control.
            </p>
          </Section>

          <Section id="storage" title="Cookies and local storage">
            <p>No cookies are set for visitors. Your browser&apos;s local storage is used only for:</p>
            <ul>
              <li>
                <strong>Theme preference</strong> (dark or light), so the site remembers your choice. It never leaves your
                device.
              </li>
              <li>
                <strong>Administrator sign-in session</strong>, only for the site owner when signed in to the admin area.
              </li>
            </ul>
          </Section>

          <Section id="processors" title="Service providers">
            <p>The website relies on these providers, which process data on its behalf:</p>
            <ul>
              <li>
                <strong>Supabase</strong>: database, file storage and administrator authentication. Inquiries are stored
                here, in the data-centre region selected for this website.
              </li>
              <li>
                <strong>Netlify</strong>: hosting and delivery of the website.
              </li>
            </ul>
            <p>
              Links to Instagram, LinkedIn or WhatsApp take you to those services, which handle your data under their
              own privacy policies.
            </p>
          </Section>

          <Section id="retention" title="How long data is kept">
            <p>
              Inquiries are kept for as long as needed to respond and, if a collaboration follows, for the duration of
              that project and any legal record-keeping obligations. Inquiries that do not lead to a project are deleted
              when no longer needed. You can ask for your data to be deleted at any time.
            </p>
          </Section>

          <Section id="rights" title="Your rights">
            <p>Depending on where you live, you can:</p>
            <ul>
              <li>ask for a copy of the personal data held about you;</li>
              <li>ask for it to be corrected or deleted;</li>
              <li>object to or ask to restrict its processing;</li>
              <li>receive it in a portable format;</li>
              <li>lodge a complaint with your local data protection authority.</li>
            </ul>
            <p>To make a request, contact {contactLine}. You will receive a reply within one month.</p>
          </Section>

          <Section id="changes" title="Changes to this policy">
            <p>
              If the way this website handles personal data changes, this page will be updated and the date at the top
              will change.
            </p>
          </Section>
        </div>
      </div>
    </>
  );
}
