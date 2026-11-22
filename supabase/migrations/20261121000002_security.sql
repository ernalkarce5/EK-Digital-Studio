-- ════════════════════════════════════════════════════════════════════
-- EK Digital Studio — authorization, Row Level Security and RPCs
--
-- Model: only users whose profiles.is_admin = true may manage content.
-- Being "authenticated" alone grants nothing, so an accidentally enabled
-- sign-up can never become a backdoor.
-- ════════════════════════════════════════════════════════════════════

-- ── Authorization helper ───────────────────────────────────────────

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and is_admin
  );
$$;

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to anon, authenticated;

-- ── Table privileges (defence in depth; RLS still applies) ─────────

grant usage on schema public to anon, authenticated;

revoke all on all tables in schema public from anon, authenticated;

grant select on public.categories, public.projects, public.services,
                public.testimonials, public.site_settings to anon, authenticated;

grant insert, update, delete on public.categories, public.projects, public.services,
                public.testimonials to authenticated;
grant insert, update on public.site_settings to authenticated;

-- Anonymous visitors may read only the public columns of the public profile.
grant select (id, is_public, full_name, professional_title, short_intro, biography, background,
              experience, approach, philosophy, technologies, avatar_path, email, location,
              social_links, availability_status, availability_note, updated_at)
  on public.profiles to anon;
grant select, update on public.profiles to authenticated;

-- Inquiries and logs: admins only (anon gets no table privilege at all).
grant select, update, delete on public.contact_messages to authenticated;
grant select on public.admin_activity_logs to authenticated;

-- ── Row Level Security ─────────────────────────────────────────────

alter table public.profiles            enable row level security;
alter table public.categories          enable row level security;
alter table public.projects            enable row level security;
alter table public.services            enable row level security;
alter table public.contact_messages    enable row level security;
alter table public.testimonials        enable row level security;
alter table public.site_settings       enable row level security;
alter table public.admin_activity_logs enable row level security;

-- profiles
create policy "profiles: public profile is readable"
  on public.profiles for select to anon, authenticated
  using (is_public or id = (select auth.uid()) or (select public.is_admin()));

create policy "profiles: admins update"
  on public.profiles for update to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

-- categories
create policy "categories: published are public"
  on public.categories for select to anon, authenticated
  using (is_published or (select public.is_admin()));
create policy "categories: admins insert"
  on public.categories for insert to authenticated with check ((select public.is_admin()));
create policy "categories: admins update"
  on public.categories for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "categories: admins delete"
  on public.categories for delete to authenticated using ((select public.is_admin()));

-- projects
create policy "projects: published are public"
  on public.projects for select to anon, authenticated
  using (status = 'published' or (select public.is_admin()));
create policy "projects: admins insert"
  on public.projects for insert to authenticated with check ((select public.is_admin()));
create policy "projects: admins update"
  on public.projects for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "projects: admins delete"
  on public.projects for delete to authenticated using ((select public.is_admin()));

-- services
create policy "services: published are public"
  on public.services for select to anon, authenticated
  using (is_published or (select public.is_admin()));
create policy "services: admins insert"
  on public.services for insert to authenticated with check ((select public.is_admin()));
create policy "services: admins update"
  on public.services for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "services: admins delete"
  on public.services for delete to authenticated using ((select public.is_admin()));

-- testimonials
create policy "testimonials: published are public"
  on public.testimonials for select to anon, authenticated
  using (is_published or (select public.is_admin()));
create policy "testimonials: admins insert"
  on public.testimonials for insert to authenticated with check ((select public.is_admin()));
create policy "testimonials: admins update"
  on public.testimonials for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "testimonials: admins delete"
  on public.testimonials for delete to authenticated using ((select public.is_admin()));

-- site_settings
create policy "site_settings: public read"
  on public.site_settings for select to anon, authenticated using (true);
create policy "site_settings: admins insert"
  on public.site_settings for insert to authenticated with check ((select public.is_admin()));
create policy "site_settings: admins update"
  on public.site_settings for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

-- contact_messages (no insert policy: inserts go through submit_contact_message)
create policy "contact_messages: admins read"
  on public.contact_messages for select to authenticated using ((select public.is_admin()));
create policy "contact_messages: admins update"
  on public.contact_messages for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "contact_messages: admins delete"
  on public.contact_messages for delete to authenticated using ((select public.is_admin()));

-- admin_activity_logs (read-only; written by triggers)
create policy "activity: admins read"
  on public.admin_activity_logs for select to authenticated using ((select public.is_admin()));

-- ── Contact form submission ────────────────────────────────────────

create or replace function public.clean_text(p_value text, p_max integer)
returns text
language sql
immutable
set search_path = ''
as $$
  select nullif(
    left(
      trim(
        regexp_replace(                                           -- strip control chars (keep \t \n \r)
          regexp_replace(coalesce(p_value, ''), '<[^>]*>', '', 'g'), -- strip HTML tags
          '[\x01-\x08\x0B\x0C\x0E-\x1F\x7F]', '', 'g'
        )
      ),
      p_max
    ),
    ''
  );
$$;

revoke all on function public.clean_text(text, integer) from public;

create or replace function public.submit_contact_message(
  p_full_name         text,
  p_email             text,
  p_project_type      text,
  p_message           text,
  p_company           text default null,
  p_budget            text default null,
  p_preferred_contact text default null,
  p_website           text default null,   -- honeypot: real users never fill this
  p_elapsed_ms        integer default null -- time between form render and submit
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_headers   jsonb;
  v_ip        text;
  v_ip_hash   text;
  v_name      text := public.clean_text(p_full_name, 100);
  v_email     text := lower(public.clean_text(p_email, 254));
  v_company   text := public.clean_text(p_company, 120);
  v_type      text := public.clean_text(p_project_type, 60);
  v_budget    text := public.clean_text(p_budget, 60);
  v_message   text := public.clean_text(p_message, 5000);
  v_preferred text := public.clean_text(p_preferred_contact, 20);
begin
  -- Spam traps: respond as if successful so bots learn nothing, but store nothing.
  if coalesce(trim(p_website), '') <> '' or (p_elapsed_ms is not null and p_elapsed_ms < 2000) then
    return jsonb_build_object('ok', true);
  end if;

  -- Validation (mirrors the client-side Zod schema).
  if v_name is null or char_length(v_name) < 2 then
    return jsonb_build_object('ok', false, 'error', 'validation', 'field', 'fullName',
                              'message', 'Please enter your full name.');
  end if;
  if v_email is null or v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]{2,}$' then
    return jsonb_build_object('ok', false, 'error', 'validation', 'field', 'email',
                              'message', 'Please enter a valid email address.');
  end if;
  if v_type is null or v_type not in ('Website Design', 'Website Development', 'Website Redesign',
       'E-commerce', 'Booking System', 'Custom Web Application', 'Website Maintenance', 'Other') then
    return jsonb_build_object('ok', false, 'error', 'validation', 'field', 'projectType',
                              'message', 'Please choose a project type.');
  end if;
  if v_message is null or char_length(v_message) < 20 then
    return jsonb_build_object('ok', false, 'error', 'validation', 'field', 'message',
                              'message', 'Please describe your project in at least 20 characters.');
  end if;
  if v_preferred is not null and v_preferred not in ('email', 'phone', 'whatsapp', 'any') then
    v_preferred := null;
  end if;

  -- Rate limiting, keyed on a hash of the caller IP (raw IPs are never stored).
  begin
    v_headers := nullif(current_setting('request.headers', true), '')::jsonb;
  exception when others then
    v_headers := null;
  end;
  v_ip := nullif(trim(split_part(coalesce(v_headers ->> 'x-forwarded-for',
                                         v_headers ->> 'cf-connecting-ip', ''), ',', 1)), '');
  v_ip_hash := case when v_ip is null then null else md5('ek-contact:' || v_ip) end;

  if v_ip_hash is not null and (
       select count(*) from public.contact_messages
       where ip_hash = v_ip_hash and created_at > now() - interval '1 hour') >= 5 then
    return jsonb_build_object('ok', false, 'error', 'rate_limited',
                              'message', 'Too many messages sent recently. Please try again later.');
  end if;

  if (select count(*) from public.contact_messages
      where lower(email) = v_email and created_at > now() - interval '1 hour') >= 3 then
    return jsonb_build_object('ok', false, 'error', 'rate_limited',
                              'message', 'Too many messages sent recently. Please try again later.');
  end if;

  if (select count(*) from public.contact_messages
      where created_at > now() - interval '1 hour') >= 100 then
    return jsonb_build_object('ok', false, 'error', 'rate_limited',
                              'message', 'The inbox is temporarily busy. Please try again later or email directly.');
  end if;

  insert into public.contact_messages
    (full_name, email, company, project_type, budget, message, preferred_contact, ip_hash, user_agent)
  values
    (v_name, v_email, v_company, v_type, v_budget, v_message, v_preferred, v_ip_hash,
     left(v_headers ->> 'user-agent', 300));

  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.submit_contact_message(text, text, text, text, text, text, text, text, integer) from public;
grant execute on function public.submit_contact_message(text, text, text, text, text, text, text, text, integer)
  to anon, authenticated;

-- ── Media usage (protects images referenced by content) ────────────

create or replace function public.media_in_use(p_path text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select 'project "' || title || '"' from public.projects
       where cover_image_path = p_path or p_path = any (gallery_images) limit 1),
    (select 'testimonial by ' || author_name from public.testimonials where avatar_path = p_path limit 1),
    (select 'profile image' from public.profiles where avatar_path = p_path limit 1),
    (select 'site settings' from public.site_settings
       where p_path in (logo_path, favicon_path, og_image_path) limit 1)
  );
$$;

revoke all on function public.media_in_use(text) from public;
grant execute on function public.media_in_use(text) to authenticated;

-- Every referenced storage path with a human-readable label (admins only).
create or replace function public.media_usage()
returns table (path text, used_by text)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  return query
    select p.cover_image_path, 'Project: ' || p.title from public.projects p where p.cover_image_path is not null
    union all
    select g.path, 'Project gallery: ' || p.title from public.projects p, unnest(p.gallery_images) as g(path)
    union all
    select t.avatar_path, 'Testimonial: ' || t.author_name from public.testimonials t where t.avatar_path is not null
    union all
    select pr.avatar_path, 'Profile image' from public.profiles pr where pr.avatar_path is not null
    union all
    select s.logo_path, 'Site logo' from public.site_settings s where s.logo_path is not null
    union all
    select s.favicon_path, 'Favicon' from public.site_settings s where s.favicon_path is not null
    union all
    select s.og_image_path, 'Social share image' from public.site_settings s where s.og_image_path is not null;
end;
$$;

revoke all on function public.media_usage() from public;
grant execute on function public.media_usage() to authenticated;

-- Internal helpers are not part of the public API.
revoke all on function public.log_activity() from public;
revoke all on function public.set_updated_at() from public;
revoke all on function public.projects_set_published_at() from public;
