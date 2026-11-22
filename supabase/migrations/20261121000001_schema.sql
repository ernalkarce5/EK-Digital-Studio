-- ════════════════════════════════════════════════════════════════════
-- EK Digital Studio — core schema
-- Tables, constraints, indexes, updated_at triggers and activity log.
-- ════════════════════════════════════════════════════════════════════

-- ── Shared helpers ─────────────────────────────────────────────────

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ── profiles ───────────────────────────────────────────────────────
-- One row per administrator (linked to auth.users). The row flagged
-- is_public = true is the personal profile shown on the public site.

create table public.profiles (
  id                  uuid primary key references auth.users (id) on delete cascade,
  is_admin            boolean not null default false,
  is_public           boolean not null default false,
  full_name           text not null default '' check (char_length(full_name) <= 120),
  professional_title  text not null default '' check (char_length(professional_title) <= 160),
  short_intro         text not null default '' check (char_length(short_intro) <= 800),
  biography           text not null default '' check (char_length(biography) <= 6000),
  background          text not null default '' check (char_length(background) <= 4000),
  experience          text not null default '' check (char_length(experience) <= 4000),
  approach            text not null default '' check (char_length(approach) <= 4000),
  philosophy          text not null default '' check (char_length(philosophy) <= 4000),
  technologies        text[] not null default '{}',
  avatar_path         text check (char_length(avatar_path) <= 500),
  email               text check (char_length(email) <= 254),
  location            text check (char_length(location) <= 120),
  social_links        jsonb not null default '{}'::jsonb check (jsonb_typeof(social_links) = 'object'),
  availability_status text not null default 'available'
                        check (availability_status in ('available', 'limited', 'unavailable')),
  availability_note   text not null default '' check (char_length(availability_note) <= 160),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- Only one profile can be the public one.
create unique index profiles_single_public_idx on public.profiles (is_public) where is_public;

create trigger profiles_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();

-- ── categories ─────────────────────────────────────────────────────

create table public.categories (
  id            uuid primary key default gen_random_uuid(),
  name          text not null check (char_length(trim(name)) between 1 and 60),
  slug          text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) <= 80),
  description   text not null default '' check (char_length(description) <= 500),
  display_order integer not null default 0,
  is_published  boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create unique index categories_name_lower_idx on public.categories (lower(name));
create index categories_order_idx on public.categories (display_order, name);

create trigger categories_updated_at before update on public.categories
  for each row execute function public.set_updated_at();

-- ── projects ───────────────────────────────────────────────────────

create table public.projects (
  id                uuid primary key default gen_random_uuid(),
  title             text not null check (char_length(trim(title)) between 1 and 140),
  slug              text not null check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) <= 120),
  short_description text not null check (char_length(trim(short_description)) between 1 and 300),
  full_description  text not null default '' check (char_length(full_description) <= 10000),
  objectives        text[] not null default '{}',
  features          text[] not null default '{}',
  category_id       uuid references public.categories (id) on delete restrict,
  project_type      text not null default 'demo'
                      check (project_type in ('demo', 'personal', 'client')),
  technologies      text[] not null default '{}',
  cover_image_path  text check (char_length(cover_image_path) <= 500),
  cover_image_alt   text not null default '' check (char_length(cover_image_alt) <= 200),
  gallery_images    text[] not null default '{}',
  live_demo_url     text check (live_demo_url is null or live_demo_url ~* '^https?://'),
  is_featured       boolean not null default false,
  display_order     integer not null default 0,
  status            text not null default 'draft' check (status in ('draft', 'published')),
  published_at      timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint projects_slug_key unique (slug)
);

create index projects_status_order_idx on public.projects (status, display_order, created_at desc);
create index projects_featured_idx on public.projects (is_featured) where is_featured;
create index projects_category_idx on public.projects (category_id);

create or replace function public.projects_set_published_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status = 'published' and (tg_op = 'INSERT' or old.status is distinct from 'published') then
    new.published_at := coalesce(new.published_at, now());
  end if;
  return new;
end;
$$;

create trigger projects_published_at before insert or update on public.projects
  for each row execute function public.projects_set_published_at();

create trigger projects_updated_at before update on public.projects
  for each row execute function public.set_updated_at();

-- ── services ───────────────────────────────────────────────────────

create table public.services (
  id            uuid primary key default gen_random_uuid(),
  title         text not null check (char_length(trim(title)) between 1 and 120),
  slug          text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) <= 120),
  summary       text not null default '' check (char_length(summary) <= 400),
  description   text not null default '' check (char_length(description) <= 5000),
  benefits      text[] not null default '{}',
  features      text[] not null default '{}',
  icon          text not null default 'layout' check (char_length(icon) <= 40),
  display_order integer not null default 0,
  is_published  boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index services_order_idx on public.services (is_published, display_order);

create trigger services_updated_at before update on public.services
  for each row execute function public.set_updated_at();

-- ── contact_messages ───────────────────────────────────────────────
-- Written only through public.submit_contact_message() (see security migration).

create table public.contact_messages (
  id                uuid primary key default gen_random_uuid(),
  full_name         text not null check (char_length(full_name) between 2 and 100),
  email             text not null check (char_length(email) <= 254),
  company           text check (char_length(company) <= 120),
  project_type      text not null check (char_length(project_type) <= 60),
  budget            text check (char_length(budget) <= 60),
  message           text not null check (char_length(message) between 20 and 5000),
  preferred_contact text check (preferred_contact in ('email', 'phone', 'whatsapp', 'any')),
  status            text not null default 'new' check (status in ('new', 'read', 'replied', 'archived')),
  ip_hash           text,
  user_agent        text check (char_length(user_agent) <= 300),
  read_at           timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index contact_messages_status_idx on public.contact_messages (status, created_at desc);
create index contact_messages_created_idx on public.contact_messages (created_at desc);
create index contact_messages_ip_idx on public.contact_messages (ip_hash, created_at desc);
create index contact_messages_email_idx on public.contact_messages (lower(email), created_at desc);

create trigger contact_messages_updated_at before update on public.contact_messages
  for each row execute function public.set_updated_at();

-- ── testimonials ───────────────────────────────────────────────────
-- Intentionally seeded empty: only real, client-approved testimonials.

create table public.testimonials (
  id            uuid primary key default gen_random_uuid(),
  author_name   text not null check (char_length(trim(author_name)) between 1 and 100),
  author_role   text not null default '' check (char_length(author_role) <= 120),
  company       text not null default '' check (char_length(company) <= 120),
  content       text not null check (char_length(trim(content)) between 1 and 1500),
  avatar_path   text check (char_length(avatar_path) <= 500),
  project_id    uuid references public.projects (id) on delete set null,
  display_order integer not null default 0,
  is_published  boolean not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index testimonials_order_idx on public.testimonials (is_published, display_order);
create index testimonials_project_idx on public.testimonials (project_id);

create trigger testimonials_updated_at before update on public.testimonials
  for each row execute function public.set_updated_at();

-- ── site_settings (single row, id = 1) ─────────────────────────────

create table public.site_settings (
  id               smallint primary key default 1 check (id = 1),
  website_name     text not null default 'Ernal Karce' check (char_length(website_name) <= 80),
  studio_name      text not null default 'EK Digital Studio' check (char_length(studio_name) <= 80),
  tagline          text not null default '' check (char_length(tagline) <= 160),
  description      text not null default '' check (char_length(description) <= 500),
  hero_heading     text not null default '' check (char_length(hero_heading) <= 160),
  hero_subheading  text not null default '' check (char_length(hero_subheading) <= 400),
  logo_path        text check (char_length(logo_path) <= 500),
  favicon_path     text check (char_length(favicon_path) <= 500),
  og_image_path    text check (char_length(og_image_path) <= 500),
  seo_title        text not null default '' check (char_length(seo_title) <= 80),
  seo_description  text not null default '' check (char_length(seo_description) <= 200),
  contact_email    text check (char_length(contact_email) <= 254),
  contact_phone    text check (char_length(contact_phone) <= 40),
  whatsapp_number  text check (whatsapp_number is null or whatsapp_number ~ '^\+?[0-9]{6,20}$'),
  location         text check (char_length(location) <= 120),
  social_links     jsonb not null default '{}'::jsonb check (jsonb_typeof(social_links) = 'object'),
  footer_text      text not null default '' check (char_length(footer_text) <= 300),
  updated_at       timestamptz not null default now()
);

create trigger site_settings_updated_at before update on public.site_settings
  for each row execute function public.set_updated_at();

-- ── admin_activity_logs ────────────────────────────────────────────
-- Written by database triggers only, so entries cannot be forged from the client.

create table public.admin_activity_logs (
  id           bigint generated always as identity primary key,
  actor_id     uuid references auth.users (id) on delete set null,
  action       text not null check (action in ('create', 'update', 'delete', 'publish', 'unpublish', 'status', 'received')),
  entity_type  text not null,
  entity_id    text,
  entity_label text not null default '',
  details      jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default now()
);

create index admin_activity_logs_created_idx on public.admin_activity_logs (created_at desc);

create or replace function public.log_activity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row     jsonb;
  v_old     jsonb;
  v_action  text;
  v_label   text;
  v_details jsonb := '{}'::jsonb;
begin
  if tg_op = 'DELETE' then
    v_row := to_jsonb(old);
  else
    v_row := to_jsonb(new);
  end if;
  if tg_op = 'UPDATE' then
    v_old := to_jsonb(old);
  end if;

  v_label := coalesce(v_row ->> 'title', v_row ->> 'name', v_row ->> 'author_name',
                      v_row ->> 'full_name', v_row ->> 'website_name', '');

  if tg_op = 'INSERT' then
    v_action := case when tg_table_name = 'contact_messages' then 'received' else 'create' end;
  elsif tg_op = 'DELETE' then
    v_action := 'delete';
  else
    -- Skip no-op updates (e.g. updated_at only).
    if (v_row - 'updated_at') = (v_old - 'updated_at') then
      return null;
    end if;
    v_action := 'update';
    if tg_table_name = 'projects' and (v_row ->> 'status') is distinct from (v_old ->> 'status') then
      v_action := case when v_row ->> 'status' = 'published' then 'publish' else 'unpublish' end;
    elsif v_row ? 'is_published' and (v_row ->> 'is_published') is distinct from (v_old ->> 'is_published') then
      v_action := case when (v_row ->> 'is_published')::boolean then 'publish' else 'unpublish' end;
    elsif tg_table_name = 'contact_messages' then
      if (v_row ->> 'status') is distinct from (v_old ->> 'status') then
        v_action := 'status';
        v_details := jsonb_build_object('from', v_old ->> 'status', 'to', v_row ->> 'status');
      else
        return null;
      end if;
    end if;
  end if;

  insert into public.admin_activity_logs (actor_id, action, entity_type, entity_id, entity_label, details)
  values (auth.uid(), v_action, tg_table_name, v_row ->> 'id', left(v_label, 200), v_details);

  return null;
end;
$$;

create trigger projects_activity after insert or update or delete on public.projects
  for each row execute function public.log_activity();
create trigger categories_activity after insert or update or delete on public.categories
  for each row execute function public.log_activity();
create trigger services_activity after insert or update or delete on public.services
  for each row execute function public.log_activity();
create trigger testimonials_activity after insert or update or delete on public.testimonials
  for each row execute function public.log_activity();
create trigger contact_messages_activity after insert or update or delete on public.contact_messages
  for each row execute function public.log_activity();
create trigger site_settings_activity after update on public.site_settings
  for each row execute function public.log_activity();
create trigger profiles_activity after update on public.profiles
  for each row execute function public.log_activity();
