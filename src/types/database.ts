// Row types mirroring supabase/migrations. Keep in sync when the schema changes.

export type ProjectType = 'demo' | 'personal' | 'client';
export type PublicationStatus = 'draft' | 'published';
export type MessageStatus = 'new' | 'read' | 'replied' | 'archived';
export type AvailabilityStatus = 'available' | 'limited' | 'unavailable';

export type SocialLinks = Partial<Record<'instagram' | 'linkedin' | 'github' | 'x' | 'behance' | 'dribbble', string>>;

export interface Category {
  id: string;
  name: string;
  slug: string;
  description: string;
  display_order: number;
  is_published: boolean;
  created_at: string;
  updated_at: string;
}

export interface Project {
  id: string;
  title: string;
  slug: string;
  short_description: string;
  full_description: string;
  objectives: string[];
  features: string[];
  category_id: string | null;
  project_type: ProjectType;
  technologies: string[];
  cover_image_path: string | null;
  cover_image_alt: string;
  gallery_images: string[];
  live_demo_url: string | null;
  is_featured: boolean;
  display_order: number;
  status: PublicationStatus;
  published_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProjectWithCategory extends Project {
  category: Pick<Category, 'id' | 'name' | 'slug'> | null;
}

export interface Service {
  id: string;
  title: string;
  slug: string;
  summary: string;
  description: string;
  benefits: string[];
  features: string[];
  icon: string;
  display_order: number;
  is_published: boolean;
  created_at: string;
  updated_at: string;
}

export interface ContactMessage {
  id: string;
  full_name: string;
  email: string;
  company: string | null;
  project_type: string;
  budget: string | null;
  message: string;
  preferred_contact: 'email' | 'phone' | 'whatsapp' | 'any' | null;
  /** Normalised: optional leading + and digits only. */
  phone: string | null;
  status: MessageStatus;
  read_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Testimonial {
  id: string;
  author_name: string;
  author_role: string;
  company: string;
  content: string;
  avatar_path: string | null;
  project_id: string | null;
  display_order: number;
  is_published: boolean;
  created_at: string;
  updated_at: string;
}

export interface SiteSettings {
  id: number;
  website_name: string;
  studio_name: string;
  tagline: string;
  description: string;
  hero_heading: string;
  hero_subheading: string;
  logo_path: string | null;
  favicon_path: string | null;
  og_image_path: string | null;
  seo_title: string;
  seo_description: string;
  contact_email: string | null;
  contact_phone: string | null;
  whatsapp_number: string | null;
  location: string | null;
  social_links: SocialLinks;
  footer_text: string;
  availability_status: AvailabilityStatus;
  availability_note: string;
  updated_at: string;
}

/**
 * Columns of `profiles` that anonymous visitors are allowed to read.
 * Contact details, social links and availability live in SiteSettings only.
 */
export interface PublicProfile {
  id: string;
  full_name: string;
  professional_title: string;
  short_intro: string;
  biography: string;
  background: string;
  experience: string;
  approach: string;
  philosophy: string;
  technologies: string[];
  avatar_path: string | null;
  updated_at: string;
}

export interface Profile extends PublicProfile {
  is_admin: boolean;
  is_public: boolean;
  created_at: string;
}

export interface ActivityLog {
  id: number;
  actor_id: string | null;
  action: 'create' | 'update' | 'delete' | 'publish' | 'unpublish' | 'status' | 'received';
  entity_type: string;
  entity_id: string | null;
  entity_label: string;
  details: Record<string, string>;
  created_at: string;
}

// ── Moderators & lead management (migration 20261123000001) ───────

export type LeadStatus =
  | 'new_assignment'
  | 'contacted'
  | 'in_discussion'
  | 'waiting_for_client'
  | 'brief_in_progress'
  | 'brief_completed'
  | 'admin_review'
  | 'changes_requested'
  | 'approved'
  | 'archived';

export interface Moderator {
  id: string;
  full_name: string;
  email: string;
  is_active: boolean;
  created_by: string | null;
  deactivated_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface LeadAssignment {
  id: string;
  message_id: string;
  moderator_id: string;
  status: LeadStatus;
  admin_note: string | null;
  assigned_by: string | null;
  assigned_at: string;
  released_at: string | null;
  release_reason: 'transferred' | 'returned_by_admin' | 'returned_by_moderator' | null;
  submitted_at: string | null;
  approved_at: string | null;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface LeadClient {
  message_id: string;
  company: string;
  industry: string;
  preferred_contact: string;
  additional_contacts: string;
  notes: string;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

export type BriefProjectType =
  | 'business_website'
  | 'portfolio_website'
  | 'ecommerce_website'
  | 'landing_page'
  | 'web_application'
  | 'booking_website'
  | 'website_redesign'
  | 'other';

export type BriefPriority = 'low' | 'medium' | 'high' | 'urgent';

/** Editable brief fields (everything except stamps/keys). */
export interface ProjectBriefContent {
  project_type: BriefProjectType | null;
  description: string;
  objectives: string;
  target_audience: string;
  design_style: string;
  preferred_colors: string;
  required_pages: string;
  required_functionality: string;
  reference_websites: string;
  special_requirements: string;
  preferred_technologies: string;
  frontend_requirements: string;
  backend_requirements: string;
  database_requirements: string;
  integrations: string;
  hosting_requirements: string;
  budget: string;
  deadline: string | null;
  priority: BriefPriority | null;
  additional_information: string;
}

export interface ProjectBrief extends ProjectBriefContent {
  message_id: string;
  submitted_at: string | null;
  submitted_by: string | null;
  approved_at: string | null;
  approved_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

export type CommunicationChannel = 'email' | 'instagram' | 'phone' | 'whatsapp' | 'linkedin' | 'meeting' | 'other';
export type CommunicationDirection = 'outgoing' | 'incoming' | 'note';

export interface CommunicationLog {
  id: string;
  message_id: string;
  author_id: string | null;
  author_role: 'admin' | 'moderator';
  channel: CommunicationChannel;
  direction: CommunicationDirection;
  occurred_at: string;
  summary: string;
  created_at: string;
}

export interface LeadNote {
  id: string;
  message_id: string;
  author_id: string | null;
  author_role: 'admin' | 'moderator';
  visibility: 'shared' | 'admin_only';
  kind: 'note' | 'help_request';
  body: string;
  created_at: string;
}

export type NotificationType =
  | 'brief_submitted'
  | 'help_requested'
  | 'assignment_returned'
  | 'assignment_status'
  | 'moderator_attention'
  | 'assignment_new'
  | 'changes_requested'
  | 'assignment_transferred'
  | 'admin_note'
  | 'brief_approved';

export interface InternalNotification {
  id: number;
  recipient_id: string;
  type: NotificationType;
  title: string;
  body: string;
  message_id: string | null;
  assignment_id: string | null;
  read_at: string | null;
  created_at: string;
}

export type LeadActivityAction =
  | 'moderator_created'
  | 'moderator_activated'
  | 'moderator_deactivated'
  | 'assignment_created'
  | 'assignment_transferred'
  | 'assignment_returned'
  | 'status_changed'
  | 'client_contacted'
  | 'client_response_recorded'
  | 'client_info_updated'
  | 'brief_created'
  | 'brief_updated'
  | 'brief_submitted'
  | 'review_started'
  | 'changes_requested'
  | 'brief_approved'
  | 'assignment_archived'
  | 'note_added'
  | 'help_requested';

export interface LeadActivity {
  id: number;
  actor_id: string | null;
  actor_role: 'admin' | 'moderator' | 'system';
  action: LeadActivityAction;
  assignment_id: string | null;
  message_id: string | null;
  moderator_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}
