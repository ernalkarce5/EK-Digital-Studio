-- ════════════════════════════════════════════════════════════════════
-- EK Digital Studio — contact phone + single source of truth for settings
--
-- 1. contact_messages.phone, validated by submit_contact_message() and
--    required when the preferred contact method is phone or WhatsApp.
-- 2. Availability moves from profiles to site_settings.
-- 3. Social links, contact email and location live only in site_settings.
--    Existing profile values are copied over before the profile columns
--    are dropped, so no data is lost.
-- ════════════════════════════════════════════════════════════════════

-- ── 1. Contact phone ───────────────────────────────────────────────

alter table public.contact_messages
  add column phone text check (phone is null or phone ~ '^\+?[0-9]{6,15}$');

-- ── 2 + 3. Consolidate settings ────────────────────────────────────

alter table public.site_settings
  add column availability_status text not null default 'available'
    check (availability_status in ('available', 'limited', 'unavailable')),
  add column availability_note text not null default ''
    check (char_length(availability_note) <= 160);

update public.site_settings s
set availability_status = p.availability_status,
    availability_note   = p.availability_note,
    social_links        = p.social_links || s.social_links,  -- settings win on conflicts
    contact_email       = coalesce(s.contact_email, p.email),
    location            = coalesce(s.location, p.location)
from public.profiles p
where p.is_public and s.id = 1;

alter table public.profiles
  drop column social_links,
  drop column availability_status,
  drop column availability_note,
  drop column email,
  drop column location;

-- ── Contact submission RPC (adds p_phone) ──────────────────────────

drop function public.submit_contact_message(text, text, text, text, text, text, text, text, integer);

create function public.submit_contact_message(
  p_full_name         text,
  p_email             text,
  p_project_type      text,
  p_message           text,
  p_company           text default null,
  p_budget            text default null,
  p_preferred_contact text default null,
  p_website           text default null,   -- honeypot: real users never fill this
  p_elapsed_ms        integer default null, -- time between form render and submit
  p_phone             text default null
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
  -- Keep a leading + and digits only (spaces, dashes, dots and brackets removed).
  v_phone     text := nullif(regexp_replace(coalesce(p_phone, ''), '[[:space:]().-]', '', 'g'), '');
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
  if v_phone is null and v_preferred in ('phone', 'whatsapp') then
    return jsonb_build_object('ok', false, 'error', 'validation', 'field', 'phone',
                              'message', 'Please enter a phone number so I can contact you that way.');
  end if;
  if v_phone is not null and v_phone !~ '^\+?[0-9]{6,15}$' then
    return jsonb_build_object('ok', false, 'error', 'validation', 'field', 'phone',
                              'message', 'Please enter a valid phone number, e.g. +387 61 234 567.');
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
    (full_name, email, company, project_type, budget, message, preferred_contact, phone, ip_hash, user_agent)
  values
    (v_name, v_email, v_company, v_type, v_budget, v_message, v_preferred, v_phone, v_ip_hash,
     left(v_headers ->> 'user-agent', 300));

  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.submit_contact_message(text, text, text, text, text, text, text, text, integer, text) from public;
grant execute on function public.submit_contact_message(text, text, text, text, text, text, text, text, integer, text)
  to anon, authenticated;
