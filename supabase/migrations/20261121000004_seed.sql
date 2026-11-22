-- ════════════════════════════════════════════════════════════════════
-- EK Digital Studio — starter content
-- Categories, service descriptions and default site settings only.
-- No projects or testimonials are seeded: those must be real and are
-- added through the admin dashboard. Everything here is editable there.
-- ════════════════════════════════════════════════════════════════════

insert into public.site_settings (
  id, website_name, studio_name, tagline, description, hero_heading, hero_subheading,
  seo_title, seo_description, social_links, footer_text
) values (
  1,
  'Ernal Karce',
  'EK Digital Studio',
  'Web Developer & Digital Solutions Designer',
  'Ernal Karce designs and builds fast, considered websites and web applications for individuals, startups and growing businesses.',
  'We Build Digital Experiences That Move Businesses Forward.',
  'Design-led websites and web applications, built carefully from first sketch to launch, for people who want their online presence to work as hard as they do.',
  'Ernal Karce — EK Digital Studio',
  'Web design and development studio of Ernal Karce. Websites, booking systems and custom web applications built with care.',
  '{}'::jsonb,
  'Designed and built in-house by EK Digital Studio.'
)
on conflict (id) do nothing;

insert into public.categories (name, slug, description, display_order) values
  ('Business Websites',        'business-websites',        'Company and brand websites.',                 1),
  ('E-commerce',               'e-commerce',               'Online stores and product catalogues.',       2),
  ('Booking Systems',          'booking-systems',          'Reservations, appointments and scheduling.',  3),
  ('Real Estate',              'real-estate',              'Property listings and rental platforms.',     4),
  ('Interactive Applications', 'interactive-applications', 'Web apps, tools and interactive experiences.', 5),
  ('Other',                    'other',                    'Everything else.',                            6)
on conflict (slug) do nothing;

insert into public.services (title, slug, icon, display_order, summary, description, benefits, features) values
(
  'Website Design', 'website-design', 'pen-tool', 1,
  'Visual design that reflects who you are and guides visitors toward what matters.',
  'Every design starts with understanding your audience and goals. From there I shape layout, typography, colour and interaction into a visual system that feels like your brand and makes the next step obvious for your visitors. You review and approve designs before any development begins.',
  array['A distinctive look instead of a generic template', 'Clear structure that helps visitors find what they need', 'Designs approved by you before development starts'],
  array['Page structure and content planning', 'Desktop and mobile layouts', 'Typography, colour and component system', 'Interactive prototype for review', 'Up to two rounds of revisions per page']
),
(
  'Website Development', 'website-development', 'code', 2,
  'Fast, accessible, maintainable websites built with modern tools.',
  'I turn approved designs into production websites using modern, well-supported technologies. The focus is on clean code, quick loading, accessibility and an editing workflow that lets you keep content up to date without calling a developer.',
  array['Quick page loads on mobile networks', 'Clean code that is easy to extend later', 'Content you can manage yourself where needed'],
  array['Responsive front-end build', 'Content management where required', 'Contact and enquiry forms', 'Basic on-page SEO setup', 'Analytics integration on request']
),
(
  'Website Redesign', 'website-redesign', 'refresh-cw', 3,
  'Modernise an existing website without losing what already works.',
  'A redesign starts with a review of your current site: what visitors use, what holds them back and what content is worth keeping. The new version keeps your existing URLs and search presence in mind while bringing the design and technology up to date.',
  array['A modern look aligned with your current brand', 'Existing content and URLs considered during migration', 'Problems in the current site identified up front'],
  array['Review of the current website', 'Content and structure migration plan', 'New design and build', 'Redirects for changed URLs', 'Launch support']
),
(
  'Responsive Web Design', 'responsive-web-design', 'smartphone', 4,
  'Layouts that work properly on phones, tablets and large screens.',
  'Most visitors arrive on a phone. I design and test layouts across common screen sizes so text stays readable, buttons stay easy to tap and nothing breaks between breakpoints.',
  array['A consistent experience on every device', 'Touch-friendly navigation and forms', 'Tested at common screen widths'],
  array['Mobile-first layouts', 'Responsive images', 'Touch-friendly navigation', 'Cross-browser testing']
),
(
  'Booking & Reservation Systems', 'booking-reservation-systems', 'calendar-check', 5,
  'Online booking for appointments, rentals and reservations.',
  'Booking systems tailored to how your business actually runs: services or units, availability, confirmations and an admin view to manage reservations. Suitable for salons, rentals, studios, apartments and similar businesses.',
  array['Customers can book at any time', 'Fewer back-and-forth messages to arrange appointments', 'An overview of reservations in one place'],
  array['Availability calendar', 'Booking form with validation', 'Admin reservation management', 'Email confirmations (provider required)', 'Mobile-friendly booking flow']
),
(
  'Custom Web Applications', 'custom-web-applications', 'layers', 6,
  'Purpose-built tools, dashboards and platforms for specific workflows.',
  'When an off-the-shelf product does not fit, I build focused web applications: internal dashboards, client portals, data management tools and interactive experiences. Scope is defined together and delivered in clear stages.',
  array['Software shaped around your workflow', 'Delivered in reviewable stages', 'Built on proven, well-documented technology'],
  array['Requirements and scope definition', 'Authentication and user roles', 'Database design', 'Admin dashboards', 'Deployment and documentation']
),
(
  'Website Maintenance', 'website-maintenance', 'wrench', 7,
  'Ongoing updates, fixes and improvements after launch.',
  'Websites need care after launch. Maintenance covers dependency and security updates, content changes, small improvements and help when something stops working, on terms agreed in advance.',
  array['Your website stays up to date', 'A single point of contact for changes', 'Problems handled without starting from scratch'],
  array['Dependency and security updates', 'Content updates', 'Bug fixes', 'Performance checks', 'Backups guidance']
)
on conflict (slug) do nothing;
