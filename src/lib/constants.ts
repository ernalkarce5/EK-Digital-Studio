import type { AvailabilityStatus, MessageStatus, ProjectType } from '@/types/database';

export const PROJECT_TYPE_LABELS: Record<ProjectType, string> = {
  demo: 'Demo Project',
  personal: 'Personal Project',
  client: 'Client Project',
};

export const PROJECT_TYPE_HINTS: Record<ProjectType, string> = {
  demo: 'A concept built to demonstrate capabilities. Not commissioned client work.',
  personal: 'A self-initiated project.',
  client: 'Delivered for a real client.',
};

export const MESSAGE_STATUS_LABELS: Record<MessageStatus, string> = {
  new: 'New',
  read: 'Read',
  replied: 'Replied',
  archived: 'Archived',
};

export const AVAILABILITY_LABELS: Record<AvailabilityStatus, string> = {
  available: 'Available for new projects',
  limited: 'Limited availability',
  unavailable: 'Currently fully booked',
};

/** Must match the list enforced in public.submit_contact_message(). */
export const CONTACT_PROJECT_TYPES = [
  'Website Design',
  'Website Development',
  'Website Redesign',
  'E-commerce',
  'Booking System',
  'Custom Web Application',
  'Website Maintenance',
  'Other',
] as const;

export const CONTACT_BUDGETS = [
  'Under €1,000',
  '€1,000 – €3,000',
  '€3,000 – €7,500',
  '€7,500+',
  'Not sure yet',
] as const;

export const CONTACT_METHODS = [
  { value: 'email', label: 'Email' },
  { value: 'phone', label: 'Phone' },
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'any', label: 'No preference' },
] as const;

export const SOCIAL_KEYS = ['instagram', 'linkedin', 'github', 'x', 'behance', 'dribbble'] as const;
export type SocialKey = (typeof SOCIAL_KEYS)[number];
export const SOCIAL_LABELS: Record<SocialKey, string> = {
  instagram: 'Instagram',
  linkedin: 'LinkedIn',
  github: 'GitHub',
  x: 'X',
  behance: 'Behance',
  dribbble: 'Dribbble',
};

/** Short process used on the home page. */
export const PROCESS_OVERVIEW = [
  { title: 'Discovery', text: 'Understanding your goals, audience and constraints before anything is designed.' },
  { title: 'Planning', text: 'Scope, page structure, content and timeline agreed in writing.' },
  { title: 'Design', text: 'Visual direction and layouts that you review and approve.' },
  { title: 'Development', text: 'Clean, maintainable code built on the approved design.' },
  { title: 'Testing', text: 'Checks across devices, browsers, performance and accessibility.' },
  { title: 'Deployment', text: 'Launch, handover and support for whatever comes next.' },
] as const;

/** Detailed collaboration stages for the Process page. */
export const PROCESS_STAGES = [
  {
    title: 'Initial Consultation',
    summary: 'A conversation about what you need and why.',
    description:
      'We talk through your business, your audience and what the website or application should achieve. You do not need a finished brief. Part of this step is helping you shape one.',
    expect: [
      'A call or written exchange, whichever suits you',
      'Questions about goals, audience, timeline and budget',
      'An honest view on whether I am the right fit for the project',
    ],
    deliverable: 'Shared understanding of the project',
  },
  {
    title: 'Requirements & Planning',
    summary: 'Turning ideas into a clear, agreed scope.',
    description:
      'I translate our conversation into a written proposal: pages and features, content responsibilities, technical approach, milestones and cost. Nothing starts until you have agreed to it.',
    expect: [
      'A written proposal with scope, timeline and price',
      'A sitemap or feature list for larger projects',
      'Clarity on which content you provide and which I prepare',
    ],
    deliverable: 'Approved proposal and project plan',
  },
  {
    title: 'Design & Approval',
    summary: 'Seeing the result before it is built.',
    description:
      'I design key pages for desktop and mobile, building a consistent visual system around your brand. You review the designs, leave feedback and approve them before development begins.',
    expect: [
      'Designs for the main pages and mobile views',
      'Feedback rounds as agreed in the proposal',
      'Final sign-off before any code is written',
    ],
    deliverable: 'Approved designs',
  },
  {
    title: 'Development',
    summary: 'Building it properly.',
    description:
      'The approved designs are built with modern, well-supported tools. You get access to a staging link so you can follow progress and catch issues early, not just at the end.',
    expect: [
      'Regular progress updates',
      'A private preview link to review work in progress',
      'Content management set up where the project needs it',
    ],
    deliverable: 'Working website on a staging link',
  },
  {
    title: 'Testing & Optimization',
    summary: 'Making sure it works for everyone.',
    description:
      'Before launch I test on real devices and common browsers, check forms and integrations, and work on loading speed, accessibility and basic search engine setup.',
    expect: [
      'Testing on phones, tablets and desktops',
      'Performance and accessibility checks',
      'A final review together before launch',
    ],
    deliverable: 'Launch-ready website',
  },
  {
    title: 'Deployment & Handover',
    summary: 'Going live and staying supported.',
    description:
      'I deploy to production, connect your domain and make sure everything runs correctly. You receive access, documentation and a walkthrough of anything you will manage yourself.',
    expect: [
      'Launch on your domain',
      'Access credentials and documentation',
      'A walkthrough of content editing, where included',
      'Optional ongoing maintenance',
    ],
    deliverable: 'Live website and handover',
  },
] as const;
