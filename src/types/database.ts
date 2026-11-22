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
