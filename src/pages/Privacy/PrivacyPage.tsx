import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { Seo } from '@/components/common/Seo';
import { PageHeader } from '@/components/common/PageHeader';
import { useSite } from '@/contexts/SiteContext';
import { AnalyticsOptOut } from '@/components/common/AnalyticsOptOut';

/** Update this date whenever the policy text changes. */
export const PRIVACY_LAST_UPDATED = '28 November 2026';

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
  ['questionnaires', 'Project questionnaires'],
  ['statistics', 'Visit statistics'],
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
              This website does not use advertising or third-party tracking tools, and does not build visitor profiles.
              Fonts are served from this website itself, not from third-party font services.
            </p>
            <p>
              As with any website, the providers below automatically process technical data needed to deliver pages
              and answer requests securely, such as your IP address, browser details, the time of the request and the
              page or data requested. These are standard hosting and API logs, kept by the providers under their own
              retention rules.
            </p>
          </Section>

          <Section id="questionnaires" title="Project questionnaires">
            <p>
              If you sent an inquiry, the team member handling it may send you a personal link to a project questionnaire. You
              don&apos;t need an account to use it.
            </p>
            <p>
              <strong>What is processed:</strong> the answers you give (type of website, project name and description, desired
              features, design preferences, links you share, budget range and currency, deadline and urgency, and any other
              requirements), together with when the questionnaire was opened, saved and submitted. Please don&apos;t include
              information we don&apos;t need; anything you type is stored as written.
            </p>
            <p>
              <strong>How it is stored:</strong> with your inquiry in the website&apos;s database (Supabase), visible only to the
              team member assigned to your inquiry and the site owner. Answers are saved as you type so you can continue later,
              also on another device. Nothing is sent by email automatically and nothing is shared with third parties apart from
              the hosting and database providers listed below, including their request logs and backups.
            </p>
            <p>
              <strong>The link</strong> is personal: anyone who has it can open the questionnaire, so please don&apos;t forward it.
              It works for 30 days, can be disabled by us at any time, and stops working when a new link is sent. After you submit,
              your answers can&apos;t be changed through the link; contact us if something needs correcting.
            </p>
            <p>
              <strong>Purpose and legal basis:</strong> preparing a proposal at your request, before a possible contract (GDPR Art.
              6(1)(b)).
            </p>
            <p>
              <strong>How long it is kept:</strong> submitted answers are kept together with your inquiry, under the same rules
              described in &ldquo;How long data is kept&rdquo;, and are deleted when the inquiry is deleted. Answers saved but never
              submitted are deleted automatically 30 days after the link expires or is disabled.
            </p>
          </Section>

          <Section id="statistics" title="Visit statistics">
            <p>
              To understand which pages are useful, the website counts page views with its own statistics, without
              cookies and without third-party analytics tools.
            </p>
            <p>
              <strong>What is stored for each counted page view:</strong> the page, the time, the kind of device (mobile,
              tablet or desktop, estimated from the browser), how the visit started (for example a search engine, a social
              network, the domain of a linking website, or a direct visit) and a <strong>pseudonymous visitor code</strong>.
            </p>
            <p>
              <strong>How the code works:</strong> when you open a page, your browser sends the page address, the referring
              domain and the device type to the database. The database calculates the code from your IP address and browser
              details combined with a random value that changes every day. Your IP address and browser details are not stored
              with the statistics. Because the random value is replaced daily and the old one deleted, codes from different
              days are not intended to be linkable to each other or to you. During the day the code is still pseudonymous
              personal data: someone with access to the database and that day&apos;s random value could in principle test
              whether a known IP address and browser produced it. Copies of the random value can remain in the database
              provider&apos;s backups until those expire.
            </p>
            <p>
              <strong>Not counted:</strong> visits when your browser sends a Do-Not-Track or Global Privacy Control signal,
              visits after you choose &ldquo;Don&apos;t count my visits&rdquo; below, automated bots, and signed-in staff.
            </p>
            <p>
              The statistics are used only in aggregate (for example &ldquo;page views per day&rdquo;), are not combined
              with other data or shared for marketing, and are kept for 13 months. The legal basis relied on is a legitimate
              interest in understanding and improving the website (GDPR Art. 6(1)(f)). You have the right to object at any
              time, with the control below or by contacting {contactLine}.
            </p>
            <AnalyticsOptOut />
          </Section>

          <Section id="storage" title="Cookies and local storage">
            <p>No cookies are set for visitors. Your browser&apos;s local storage is used only for:</p>
            <ul>
              <li>
                <strong>Theme preference</strong> (dark or light), so the site remembers your choice. It never leaves your
                device.
              </li>
              <li>
                <strong>Logo address</strong>, so the loading screen can show the site logo straight away on your next
                visit. It contains no information about you and never leaves your device.
              </li>
              <li>
                <strong>&ldquo;Don&apos;t count my visits&rdquo; choice</strong>, only if you use that control, so your
                objection to visit statistics is remembered on this device. It is a single on/off value and never leaves
                your device. Clearing your browser data removes it, and visits are then counted again.
              </li>
              <li>
                <strong>Sign-in session</strong>, only for the site owner and team members when signed in to the admin or
                team area.
              </li>
            </ul>
          </Section>

          <Section id="processors" title="Service providers">
            <p>The website relies on these providers, which process data on its behalf:</p>
            <ul>
              <li>
                <strong>Supabase</strong>: database, file storage and sign-in. Inquiries and visit statistics are stored
                here, in the data-centre region selected for this website. Supabase also keeps request logs (including IP
                address and browser details) and backups under its own retention rules.
              </li>
              <li>
                <strong>Netlify</strong>: hosting and delivery of the website, including standard server logs.
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
            <p>
              Questionnaire answers that were saved but never submitted are deleted automatically 30 days after the link expires
              or is disabled; submitted answers are kept and deleted together with the inquiry. Visit statistics are deleted
              automatically after 13 months. The daily random value used for visitor codes is
              deleted after its day. Deleted data can remain in the database provider&apos;s backups until those expire.
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
            <p>
              To make a request, contact {contactLine}. You will receive a reply within one month. To object to visit
              statistics you can also use the &ldquo;Don&apos;t count my visits&rdquo; control in the{' '}
              <a href="#statistics" className="text-fg underline underline-offset-2">
                Visit statistics
              </a>{' '}
              section. Because visitor codes cannot be linked to a person after their day ends, older statistics usually
              cannot be attributed to you.
            </p>
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
