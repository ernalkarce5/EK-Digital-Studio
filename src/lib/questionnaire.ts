/**
 * Client Project Questionnaire: shared definitions.
 *
 * Field keys, options and limits mirror public.questionnaire_clean_answers() in
 * supabase/migrations/20261128000001_client_questionnaires.sql exactly. The database
 * is the authority; the checks here only give clients immediate, friendly feedback.
 */
import type { BriefPriority, BriefProjectType } from '@/types/database';

export const WEBSITE_TYPES = {
  business_website: 'Business website',
  portfolio_website: 'Portfolio',
  ecommerce_website: 'Online store',
  landing_page: 'Landing page',
  booking_website: 'Booking website',
  other: 'Other',
} as const;
export const FEATURES = {
  contact_form: 'Contact form',
  booking: 'Online booking / reservations',
  admin_dashboard: 'Admin dashboard',
  payments: 'Online payments',
  user_accounts: 'User accounts',
  catalog: 'Product / service catalogue',
  gallery: 'Gallery and portfolio',
  blog: 'Blog / news',
  multilingual: 'Multiple languages',
  other: 'Other',
} as const;
export const VISUAL_STYLES = {
  minimal: 'Minimal',
  modern: 'Modern',
  elegant: 'Elegant',
  bold: 'Bold',
  playful: 'Playful',
  corporate: 'Corporate',
  not_sure: 'Not sure yet',
} as const;
export const BUDGET_RANGES = {
  under_500: 'Below 500',
  '500_1000': '500 – 1,000',
  '1000_2500': '1,000 – 2,500',
  '2500_5000': '2,500 – 5,000',
  '5000_10000': '5,000 – 10,000',
  '10000_plus': '10,000+',
  not_decided: 'Not decided yet',
} as const;
export const CURRENCIES = { EUR: 'EUR (€)', BAM: 'BAM (KM)', USD: 'USD ($)' } as const;
export const URGENCIES = {
  flexible: 'Flexible',
  normal: 'Normal',
  soon: 'Soon',
  urgent: 'Urgent',
} as const;

export type WebsiteType = keyof typeof WEBSITE_TYPES;
export type Feature = keyof typeof FEATURES;
export type VisualStyle = keyof typeof VISUAL_STYLES;
export type BudgetRange = keyof typeof BUDGET_RANGES;
export type Currency = keyof typeof CURRENCIES;
export type Urgency = keyof typeof URGENCIES;

export interface QuestionnaireAnswers {
  website_type?: WebsiteType;
  website_type_other?: string;
  project_name?: string;
  project_description?: string;
  features?: Feature[];
  features_other?: string;
  visual_style?: VisualStyle;
  preferred_colors?: string;
  reference_links?: string[];
  design_notes?: string;
  budget_range?: BudgetRange;
  budget_currency?: Currency;
  budget_notes?: string;
  deadline?: string;
  urgency?: Urgency;
  deadline_notes?: string;
  additional_requirements?: string;
  additional_links?: string[];
}
export type AnswerKey = keyof QuestionnaireAnswers;

/** Text limits (characters), identical to the database. */
export const LIMITS = {
  website_type_other: 200,
  project_name: 200,
  project_description: 5000,
  features_other: 500,
  preferred_colors: 500,
  design_notes: 2000,
  budget_notes: 1000,
  deadline_notes: 1000,
  additional_requirements: 5000,
} as const satisfies Partial<Record<AnswerKey, number>>;
export const MAX_LINKS = 10;
export const MIN_DESCRIPTION = 20;

// ── Status ──────────────────────────────────────────────────────────

export type QuestionnaireStatus = 'not_sent' | 'sent' | 'in_progress' | 'submitted' | 'reviewed';
export const QUESTIONNAIRE_STATUS: Record<QuestionnaireStatus, { label: string; tone: 'neutral' | 'accent' | 'warning' | 'success'; hint: string }> = {
  not_sent: { label: 'Not sent', tone: 'neutral', hint: 'The link exists but has not been recorded as sent.' },
  sent: { label: 'Sent to client', tone: 'accent', hint: 'Waiting for the client to start.' },
  in_progress: { label: 'In progress', tone: 'warning', hint: 'The client has saved answers but not submitted yet.' },
  submitted: { label: 'Submitted', tone: 'success', hint: 'Review the answers, then mark the questionnaire as reviewed.' },
  reviewed: { label: 'Reviewed', tone: 'success', hint: 'Reviewed by you.' },
};

// ── Links and prepared messages ─────────────────────────────────────

/** The token travels in the URL fragment: never sent to servers, logs or the Referer header. */
export function questionnaireUrl(token: string): string {
  const origin = (import.meta.env.VITE_SITE_URL?.replace(/\/$/, '') || window.location.origin).trim();
  return `${origin}/questionnaire#t=${token}`;
}

export function preparedMessage(firstName: string, url: string, expiresAt: string, studio: string): string {
  const until = new Date(expiresAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  return [
    `Hi ${firstName || 'there'},`,
    '',
    `Thank you for your interest in working with ${studio}. To prepare an accurate proposal, please fill in this short project questionnaire:`,
    url,
    '',
    `It takes about 10 minutes. Your answers are saved as you go, so you can finish later. The link is personal, please don't share it. It works until ${until}.`,
    '',
    'Best regards,',
    studio,
  ].join('\n');
}

// ── Client-side validation (mirrors the database) ───────────────────

export type FieldErrors = Partial<Record<AnswerKey, string>>;
const URL_RE = /^https?:\/\/[^\s<>"'`]+$/i;

export function validateAnswers(a: QuestionnaireAnswers, final: boolean): FieldErrors {
  const e: FieldErrors = {};
  for (const [key, max] of Object.entries(LIMITS) as Array<[AnswerKey, number]>) {
    const v = a[key];
    if (typeof v === 'string' && v.length > max) e[key] = `Please keep this under ${max.toLocaleString()} characters.`;
  }
  for (const key of ['reference_links', 'additional_links'] as const) {
    const list = a[key] ?? [];
    if (list.length > MAX_LINKS) e[key] = `Please add at most ${MAX_LINKS} links.`;
    else if (list.some((l) => l.length > 500 || !URL_RE.test(l))) e[key] = 'Links must start with http:// or https://.';
  }
  if (a.deadline) {
    const today = new Date();
    const min = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const max = new Date(min);
    max.setFullYear(max.getFullYear() + 3);
    const d = /^\d{4}-\d{2}-\d{2}$/.test(a.deadline) ? new Date(`${a.deadline}T00:00:00`) : null;
    if (!d || Number.isNaN(d.getTime())) e.deadline = 'Please enter a valid date.';
    else if (d < min || d > max) e.deadline = 'Please choose a date between today and three years from now.';
  }
  if (final) {
    if (!a.website_type) e.website_type = 'Please choose the type of website.';
    if ((a.project_description ?? '').trim().length < MIN_DESCRIPTION) {
      e.project_description = `Please describe your project in at least ${MIN_DESCRIPTION} characters.`;
    }
    if (a.budget_range && a.budget_range !== 'not_decided' && !a.budget_currency) e.budget_currency = 'Please choose a currency for your budget.';
  }
  return e;
}

/** Cleans form state into the payload the database expects (no empty values, trimmed text, deduped links). */
export function toPayload(a: QuestionnaireAnswers): QuestionnaireAnswers {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(a)) {
    if (v == null) continue;
    if (typeof v === 'string') {
      if (v.trim()) out[k] = v.trim();
    } else if (Array.isArray(v)) {
      const list = [...new Set((v as string[]).map((x) => x.trim()).filter(Boolean))];
      if (list.length) out[k] = list;
    }
  }
  if (out.budget_range === 'not_decided') delete out.budget_currency;
  return out as QuestionnaireAnswers;
}

/** Splits a "one link per line" text area into a list. */
export const linesToLinks = (text: string): string[] =>
  text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

// ── Readable rendering (moderator review and client review step) ───

export function answerRows(a: QuestionnaireAnswers): Array<{ section: string; rows: Array<{ label: string; value: string | string[] }> }> {
  const list = (v?: string[]) => (v && v.length ? v : '');
  const budget = a.budget_range
    ? a.budget_range === 'not_decided'
      ? BUDGET_RANGES.not_decided
      : `${a.budget_currency ?? ''} ${BUDGET_RANGES[a.budget_range]}`.trim()
    : '';
  return [
    {
      section: 'Website',
      rows: [
        { label: 'Website type', value: a.website_type ? WEBSITE_TYPES[a.website_type] + (a.website_type_other ? ` (${a.website_type_other})` : '') : '' },
        { label: 'Business or project name', value: a.project_name ?? '' },
        { label: 'Project description', value: a.project_description ?? '' },
      ],
    },
    {
      section: 'Functionality',
      rows: [
        { label: 'Desired features', value: list(a.features?.map((f) => FEATURES[f])) },
        { label: 'Other functionality', value: a.features_other ?? '' },
      ],
    },
    {
      section: 'Design',
      rows: [
        { label: 'Visual style', value: a.visual_style ? VISUAL_STYLES[a.visual_style] : '' },
        { label: 'Preferred colours', value: a.preferred_colors ?? '' },
        { label: 'Reference websites', value: list(a.reference_links) },
        { label: 'Design notes', value: a.design_notes ?? '' },
      ],
    },
    {
      section: 'Budget',
      rows: [
        { label: 'Budget range', value: budget },
        { label: 'Budget notes', value: a.budget_notes ?? '' },
      ],
    },
    {
      section: 'Timeline',
      rows: [
        { label: 'Desired completion date', value: a.deadline ? new Date(`${a.deadline}T00:00:00`).toLocaleDateString('en-GB', { dateStyle: 'medium' }) : '' },
        { label: 'Urgency', value: a.urgency ? URGENCIES[a.urgency] : '' },
        { label: 'Deadline notes', value: a.deadline_notes ?? '' },
      ],
    },
    {
      section: 'Additional',
      rows: [
        { label: 'Other requirements', value: a.additional_requirements ?? '' },
        { label: 'Additional links', value: list(a.additional_links) },
      ],
    },
  ];
}

// ── Project Brief prefill ───────────────────────────────────────────

/** Brief form fields the questionnaire can fill (string values, as in the brief form). */
export type BriefPrefill = Partial<{
  project_type: BriefProjectType;
  description: string;
  required_functionality: string;
  integrations: string;
  special_requirements: string;
  design_style: string;
  preferred_colors: string;
  reference_websites: string;
  budget: string;
  deadline: string;
  priority: BriefPriority;
  additional_information: string;
}>;

export const BRIEF_FIELD_LABELS: Record<keyof BriefPrefill, string> = {
  project_type: 'Project type',
  description: 'Project description',
  required_functionality: 'Required functionality',
  integrations: 'Third-party integrations',
  special_requirements: 'Special requirements',
  design_style: 'Desired design style',
  preferred_colors: 'Preferred colours',
  reference_websites: 'Reference websites',
  budget: 'Estimated budget',
  deadline: 'Desired deadline',
  priority: 'Project priority',
  additional_information: 'Additional information',
};

const URGENCY_PRIORITY: Record<Urgency, BriefPriority> = { flexible: 'low', normal: 'medium', soon: 'high', urgent: 'urgent' };
const join = (...parts: Array<string | undefined | false>) => parts.filter((p): p is string => !!p && !!p.trim()).join('\n\n');

/** Maps submitted answers to the existing Project Brief fields (moderator reviews before saving). */
export function answersToBrief(a: QuestionnaireAnswers): BriefPrefill {
  const out: BriefPrefill = {};
  if (a.website_type) out.project_type = a.website_type; // same keys as the brief's project types
  const description = join(a.project_name && `Project: ${a.project_name}`, a.website_type === 'other' && a.website_type_other && `Website type: ${a.website_type_other}`, a.project_description);
  if (description) out.description = description;
  const features = (a.features ?? []).filter((f) => f !== 'other').map((f) => `• ${FEATURES[f]}`);
  if (a.features_other) features.push(`• ${a.features_other}`);
  if (features.length) out.required_functionality = features.join('\n');
  const integrations = [
    a.features?.includes('payments') && '• Online payments (payment provider to be chosen)',
    a.features?.includes('booking') && '• Booking / reservation system',
  ].filter(Boolean) as string[];
  if (integrations.length) out.integrations = integrations.join('\n');
  const special = join(a.features?.includes('multilingual') && 'Multilingual website.', a.additional_requirements);
  if (special) out.special_requirements = special;
  const style = join(a.visual_style && `Preferred style: ${VISUAL_STYLES[a.visual_style]}`, a.design_notes);
  if (style) out.design_style = style;
  if (a.preferred_colors) out.preferred_colors = a.preferred_colors;
  const refs = [...(a.reference_links ?? []), ...(a.additional_links ?? [])];
  if (refs.length) out.reference_websites = refs.join('\n');
  if (a.budget_range) {
    out.budget = (a.budget_range === 'not_decided' ? 'Not decided yet' : `${a.budget_currency ?? ''} ${BUDGET_RANGES[a.budget_range]}`.trim()).slice(0, 200);
  }
  if (a.deadline) out.deadline = a.deadline;
  if (a.urgency) out.priority = URGENCY_PRIORITY[a.urgency];
  const info = join(a.budget_notes && `Budget: ${a.budget_notes}`, a.deadline_notes && `Timeline: ${a.deadline_notes}`);
  if (info) out.additional_information = info;
  // Respect the brief's own column limits (project_briefs checks).
  const BRIEF_MAX: Partial<Record<keyof BriefPrefill, number>> = {
    description: 5000, required_functionality: 5000, integrations: 3000, special_requirements: 3000, design_style: 3000,
    preferred_colors: 1000, reference_websites: 3000, budget: 200, additional_information: 5000,
  };
  for (const [k, max] of Object.entries(BRIEF_MAX) as Array<[keyof BriefPrefill, number]>) {
    const v = out[k];
    if (typeof v === 'string' && v.length > max) (out as Record<string, string>)[k] = v.slice(0, max);
  }
  return out;
}
