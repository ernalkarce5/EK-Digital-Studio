// Lead-management constants. Status rules mirror the database functions in
// migration 20261123000001; the database remains the source of truth.
import type {
  BriefPriority,
  BriefProjectType,
  CommunicationChannel,
  CommunicationDirection,
  LeadActivityAction,
  LeadStatus,
  NotificationType,
} from '@/types/database';

type Tone = 'neutral' | 'accent' | 'success' | 'warning' | 'danger';

export const LEAD_STATUS: Record<LeadStatus, { label: string; tone: Tone; hint: string }> = {
  new_assignment: { label: 'New', tone: 'accent', hint: 'Assigned, not contacted yet.' },
  contacted: { label: 'Contacted', tone: 'neutral', hint: 'First contact made.' },
  in_discussion: { label: 'In discussion', tone: 'neutral', hint: 'Talking through requirements.' },
  waiting_for_client: { label: 'Waiting for client', tone: 'warning', hint: 'Waiting on the client to reply.' },
  brief_in_progress: { label: 'Brief in progress', tone: 'accent', hint: 'Writing the project brief.' },
  brief_completed: { label: 'Brief submitted', tone: 'success', hint: 'Submitted, awaiting admin review.' },
  admin_review: { label: 'In admin review', tone: 'warning', hint: 'Admin is reviewing the brief.' },
  changes_requested: { label: 'Changes requested', tone: 'danger', hint: 'Admin needs more information.' },
  approved: { label: 'Approved', tone: 'success', hint: 'Brief approved by admin.' },
  archived: { label: 'Archived', tone: 'neutral', hint: 'Closed and archived.' },
};

export const LEAD_STATUS_ORDER = Object.keys(LEAD_STATUS) as LeadStatus[];

/** Statuses a moderator is still actively working on. */
export const ACTIVE_STATUSES: LeadStatus[] = [
  'new_assignment',
  'contacted',
  'in_discussion',
  'waiting_for_client',
  'brief_in_progress',
  'changes_requested',
];
/** Submitted, waiting on the admin. */
export const REVIEW_STATUSES: LeadStatus[] = ['brief_completed', 'admin_review'];
/** Finished work (moderator archive). */
export const DONE_STATUSES: LeadStatus[] = ['approved', 'archived'];

const WORKING: LeadStatus[] = ['contacted', 'in_discussion', 'waiting_for_client', 'brief_in_progress'];

/** Statuses a moderator may set manually from `from` (mirrors lead_moderator_transition_allowed). */
export function moderatorNextStatuses(from: LeadStatus): LeadStatus[] {
  if (ACTIVE_STATUSES.includes(from)) return WORKING.filter((s) => s !== from);
  if (from === 'approved') return ['archived'];
  return [];
}

/** Client info and brief are editable by the moderator only while the lead is active. */
export const isEditableByModerator = (status: LeadStatus) => ACTIVE_STATUSES.includes(status);

export const BRIEF_PROJECT_TYPES: Record<BriefProjectType, string> = {
  business_website: 'Business Website',
  portfolio_website: 'Portfolio Website',
  ecommerce_website: 'E-commerce Website',
  landing_page: 'Landing Page',
  web_application: 'Web Application',
  booking_website: 'Booking / Reservation Website',
  website_redesign: 'Website Redesign',
  other: 'Other',
};

export const BRIEF_PRIORITIES: Record<BriefPriority, string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  urgent: 'Urgent',
};

export const CHANNELS: Record<CommunicationChannel, string> = {
  email: 'Email',
  instagram: 'Instagram',
  phone: 'Phone',
  whatsapp: 'WhatsApp',
  linkedin: 'LinkedIn',
  meeting: 'Meeting',
  other: 'Other',
};

export const DIRECTIONS: Record<CommunicationDirection, string> = {
  outgoing: 'Sent to client',
  incoming: 'Received from client',
  note: 'Internal note',
};

export const NOTIFICATION_LABELS: Record<NotificationType, string> = {
  brief_submitted: 'Brief submitted',
  help_requested: 'Assistance requested',
  assignment_returned: 'Lead returned',
  assignment_status: 'Status updated',
  moderator_attention: 'Needs attention',
  assignment_new: 'New assignment',
  changes_requested: 'Changes requested',
  assignment_transferred: 'Lead moved',
  admin_note: 'Admin note',
  brief_approved: 'Brief approved',
  questionnaire_submitted: 'Questionnaire submitted',
};

export const ACTIVITY_LABELS: Record<LeadActivityAction, string> = {
  moderator_created: 'Moderator added',
  moderator_activated: 'Moderator activated',
  moderator_deactivated: 'Moderator deactivated',
  assignment_created: 'Lead assigned',
  assignment_transferred: 'Lead transferred',
  assignment_returned: 'Lead returned',
  status_changed: 'Status changed',
  client_contacted: 'Client contacted',
  client_response_recorded: 'Client response recorded',
  client_info_updated: 'Client info updated',
  brief_created: 'Brief created',
  brief_updated: 'Brief updated',
  brief_submitted: 'Brief submitted',
  review_started: 'Review started',
  changes_requested: 'Changes requested',
  brief_approved: 'Brief approved',
  assignment_archived: 'Lead archived',
  note_added: 'Note added',
  help_requested: 'Assistance requested',
  questionnaire_link_created: 'Questionnaire link created',
  questionnaire_link_resent: 'Questionnaire link replaced',
  questionnaire_sent: 'Questionnaire sent',
  questionnaire_revoked: 'Questionnaire link disabled',
  questionnaire_started: 'Client started the questionnaire',
  questionnaire_submitted: 'Questionnaire submitted',
  questionnaire_reviewed: 'Questionnaire reviewed',
  questionnaire_applied_to_brief: 'Questionnaire applied to brief',
};
