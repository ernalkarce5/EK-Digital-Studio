-- ════════════════════════════════════════════════════════════════════
-- EK Digital Studio — Website analytics (privacy-first, cookieless)
--
-- Additive only: new tables and functions. No existing table, policy or
-- function is changed.
--
-- What is stored per counted page view: time, page key (+ project slug),
-- traffic source (+ referrer DOMAIN only), device class and an anonymous
-- visitor hash. Never stored: IP address, user agent, full URL/query,
-- user id, name or email.
--
-- Visitor hash = sha256(daily secret salt ‖ IP ‖ user agent), computed in
-- the database. The IP comes ONLY from a header that an admin has verified
-- the gateway overwrites (analytics_verify_ip_source); until then no IP is
-- used. Page views are kept 13 months (analytics_cleanup). The salt is random, changes every day and the previous
-- day's salt is deleted, so hashes cannot be reversed or linked across
-- days. Unique visitors are therefore an ESTIMATE (a person returning on
-- another day counts again). Nothing is stored on the visitor's device.
--
-- Writes: only through track_page_view() (security definer, validates and
-- filters). Reads: only through analytics_summary(), admins only.
-- ════════════════════════════════════════════════════════════════════

create table public.page_views (
  id              bigint generated always as identity primary key,
  created_at      timestamptz not null default now(),
  page            text not null check (page in ('home', 'about', 'projects', 'project', 'services', 'process', 'contact', 'privacy')),
  project_slug    text check (project_slug is null or char_length(project_slug) <= 200),
  source          text not null check (source in (
                    'direct', 'internal', 'google', 'bing', 'duckduckgo', 'yahoo',
                    'instagram', 'facebook', 'linkedin', 'x', 'other')),
  referrer_domain text check (referrer_domain is null or char_length(referrer_domain) <= 100),
  device          text not null check (device in ('mobile', 'tablet', 'desktop')),
  visitor_hash    text not null check (char_length(visitor_hash) = 64),
  check ((page = 'project') = (project_slug is not null))
);

create index page_views_created_idx on public.page_views (created_at);
create index page_views_visitor_idx on public.page_views (visitor_hash, created_at desc);

-- Daily salts. Only the current day's salt is kept.
create table public.analytics_salts (
  day  date primary key,
  salt text not null
);

-- Which request header carries the visitor IP. NULL until an admin has VERIFIED, on the
-- real infrastructure, that the gateway overwrites that header (analytics_verify_ip_source).
-- Until then no IP is used at all: client-supplied values are never trusted.
create table public.analytics_config (
  id                smallint primary key default 1 check (id = 1),
  trusted_ip_header text check (trusted_ip_header in ('cf-connecting-ip', 'x-real-ip', 'x-forwarded-for:last')),
  verified_at       timestamptz,
  verified_by       uuid references auth.users (id) on delete set null
);
insert into public.analytics_config (id) values (1);

-- Fixed-window counters for flood protection (O(1) per request). Keys are salted hashes,
-- never raw IPs; rows older than two hours are deleted by analytics_cleanup().
create table public.analytics_rate_limits (
  key          text not null,
  window_start timestamptz not null,
  hits         integer not null default 0,
  primary key (key, window_start)
);

-- No direct access for clients at all (RLS on, no policies, no grants).
revoke all on public.page_views, public.analytics_salts, public.analytics_config, public.analytics_rate_limits from anon, authenticated;
alter table public.page_views enable row level security;
alter table public.analytics_salts enable row level security;
alter table public.analytics_config enable row level security;
alter table public.analytics_rate_limits enable row level security;

-- Admins may read raw rows directly as well (e.g. for export); nobody writes directly.
grant select on public.page_views to authenticated;
create policy "page_views: admins read" on public.page_views
  for select to authenticated using ((select public.is_admin()));

-- ── Classification helpers ─────────────────────────────────────────

/** Maps a referrer host or utm_source value to a known source. */
create or replace function public.analytics_source(p_value text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when v is null or v = '' then 'direct'
    when v ~ '(^|\.)google\.[a-z.]+$' or v = 'google' then 'google'
    when v ~ '(^|\.)bing\.com$' or v = 'bing' then 'bing'
    when v ~ '(^|\.)duckduckgo\.com$' or v in ('duckduckgo', 'ddg') then 'duckduckgo'
    when v ~ '(^|\.)yahoo\.[a-z.]+$' or v = 'yahoo' then 'yahoo'
    when v ~ '(^|\.)instagram\.com$' or v in ('instagram', 'ig') then 'instagram'
    when v ~ '(^|\.)(facebook\.com|fb\.com|fb\.me)$' or v in ('facebook', 'fb') then 'facebook'
    when v ~ '(^|\.)(linkedin\.com|lnkd\.in)$' or v = 'linkedin' then 'linkedin'
    when v ~ '(^|\.)(t\.co|x\.com|twitter\.com)$' or v in ('x', 'twitter') then 'x'
    else 'other'
  end
  from (select lower(trim(p_value)) as v) s;
$$;

/** Normalised IP text if p is a syntactically valid IPv4/IPv6 address, else NULL. */
create or replace function public.analytics_valid_ip(p text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
begin
  if p is null or char_length(p) > 45 or p !~ '^[0-9A-Fa-f:.]+$' then
    return null;
  end if;
  return pg_catalog.host(p::inet);
exception when others then
  return null;
end;
$$;

/** IP from one candidate header. 'x-forwarded-for:last' = the entry appended by the nearest proxy. */
create or replace function public.analytics_ip_from_headers(p_headers jsonb, p_source text)
returns text
language sql
immutable
set search_path = ''
as $$
  select public.analytics_valid_ip(trim(case p_source
    when 'cf-connecting-ip' then p_headers ->> 'cf-connecting-ip'
    when 'x-real-ip' then p_headers ->> 'x-real-ip'
    when 'x-forwarded-for:last' then split_part(p_headers ->> 'x-forwarded-for', ',', -1)
  end));
$$;

/** Today's salt (UTC day), created on first use. Older salts are removed by analytics_cleanup(). */
create or replace function public.analytics_daily_salt()
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_today date := (now() at time zone 'utc')::date;
  v_salt  text;
begin
  select salt into v_salt from public.analytics_salts where day = v_today;
  if v_salt is null then
    insert into public.analytics_salts (day, salt)
    values (v_today, replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''))
    on conflict (day) do nothing;
    select salt into v_salt from public.analytics_salts where day = v_today;
    -- New day: also run the retention cleanup (fallback when no scheduler is available).
    perform public.analytics_cleanup();
  end if;
  return v_salt;
end;
$$;

/** Counts one hit for key in a fixed window; true while within the limit. */
create or replace function public.analytics_hit(p_key text, p_window interval, p_limit integer)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_hits integer;
begin
  insert into public.analytics_rate_limits as r (key, window_start, hits)
  values (p_key, date_bin(p_window, now(), timestamptz '2000-01-01 00:00:00+00'), 1)
  on conflict (key, window_start) do update set hits = r.hits + 1
  returning hits into v_hits;
  return v_hits <= p_limit;
end;
$$;

/**
 * Retention: page views older than 13 months, every salt except today's, and expired
 * rate-limit windows. Scheduled daily with pg_cron when available (see the end of this
 * file); also runs when the analytics dashboard is opened and on the first visit of each day.
 */
create or replace function public.analytics_cleanup()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.page_views where created_at < now() - interval '13 months';
  delete from public.analytics_salts where day < (now() at time zone 'utc')::date;
  delete from public.analytics_rate_limits where window_start < now() - interval '2 hours';
end;
$$;

-- ── Public tracking endpoint ───────────────────────────────────────

/**
 * Records one public page view. Silently ignores anything that is not a
 * genuine, countable view (bots, staff, unknown pages, repeats, floods).
 * Returns nothing, so it cannot be used to read data.
 *
 *   p_path      pathname only, e.g. '/projects/harbor-apartments'
 *   p_referrer  referrer host for the first view of a visit, '' for direct,
 *               null for in-site navigation
 *   p_utm       utm_source of the landing URL, if any
 *   p_device    'mobile' | 'tablet' | 'desktop' (estimated by the browser)
 */
create or replace function public.track_page_view(
  p_path text, p_referrer text default null, p_utm text default null, p_device text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_headers jsonb;
  v_ua      text;
  v_ip      text;
  v_path    text := lower(coalesce(p_path, ''));
  v_page    text;
  v_slug    text;
  v_ref     text := nullif(lower(trim(coalesce(p_referrer, ''))), '');
  v_source  text;
  v_device  text;
  v_salt    text;
  v_hash    text;
  v_net     text;
begin
  -- Staff browsing the public site are not visitors.
  if auth.uid() is not null and public.app_role() is not null then
    return;
  end if;

  begin
    v_headers := nullif(current_setting('request.headers', true), '')::jsonb;
  exception when others then
    v_headers := null;
  end;
  v_ua := left(coalesce(v_headers ->> 'user-agent', ''), 512);
  -- IP only from the header an admin verified the gateway overwrites; never a client-supplied value.
  select public.analytics_ip_from_headers(v_headers, trusted_ip_header) into v_ip
  from public.analytics_config where id = 1 and trusted_ip_header is not null;

  -- Bot filtering: no user agent, or a known crawler / preview / automation agent.
  if v_ua = '' or v_ua ~* '(bot|crawl|spider|slurp|scrape|preview|headless|lighthouse|pagespeed|pingdom|uptime|monitor|curl|wget|python|java/|go-http|okhttp|axios|node-fetch|facebookexternalhit|whatsapp|telegram|discord|embedly|bitlybot|vercel|netlify)' then
    return;
  end if;

  -- Page classification from the path (never trusted as free text).
  if v_path = '' or left(v_path, 1) <> '/' or char_length(v_path) > 300 then
    return;
  end if;
  v_path := regexp_replace(split_part(split_part(v_path, '?', 1), '#', 1), '/+$', '');
  case v_path
    when '' then v_page := 'home';
    when '/about' then v_page := 'about';
    when '/projects' then v_page := 'projects';
    when '/services' then v_page := 'services';
    when '/process' then v_page := 'process';
    when '/contact' then v_page := 'contact';
    when '/privacy' then v_page := 'privacy';
    else
      if v_path ~ '^/projects/[a-z0-9-]{1,200}$' then
        v_slug := substr(v_path, 11);
        -- Only real, published projects count (drafts and unknown slugs are 404s).
        if not exists (select 1 from public.projects where slug = v_slug and status = 'published') then
          return;
        end if;
        v_page := 'project';
      else
        return;
      end if;
  end case;

  -- Source: utm_source wins, then the referrer host; null referrer = in-site navigation.
  if nullif(trim(coalesce(p_utm, '')), '') is not null then
    v_source := public.analytics_source(left(p_utm, 60));
  elsif p_referrer is null then
    v_source := 'internal';
  else
    v_ref := nullif(left(regexp_replace(coalesce(v_ref, ''), '[^a-z0-9.-]', '', 'g'), 100), '');
    v_source := public.analytics_source(v_ref);
  end if;
  if v_source in ('direct', 'internal') then
    v_ref := null;
  end if;

  v_device := case when p_device in ('mobile', 'tablet', 'desktop') then p_device
                   when v_ua ~* '(ipad|tablet)' then 'tablet'
                   when v_ua ~* '(mobi|iphone|android)' then 'mobile'
                   else 'desktop' end;

  v_salt := public.analytics_daily_salt();
  v_hash := encode(sha256(convert_to(v_salt || '|' || coalesce(v_ip, 'unverified') || '|' || v_ua, 'UTF8')), 'hex');

  -- Duplicate protection: same visitor, same page within 30 seconds (reloads, double events).
  if exists (
    select 1 from public.page_views
    where visitor_hash = v_hash and created_at > now() - interval '30 seconds'
      and page = v_page and project_slug is not distinct from v_slug
  ) then
    return;
  end if;

  -- Flood protection (fixed windows, O(1) each), most specific first so that traffic already
  -- over its own limit never consumes the shared global budget:
  --  1. per network (trusted IP only, /24 IPv4 or /48 IPv6): 300 per hour, so forged
  --     user agents or identities from one network cannot fill the global budget;
  --  2. per visitor: 120 per hour;
  --  3. global: 1,500 counted views per minute protects the database; exhausting it blocks
  --     counting only for the current minute, and only while that rate is sustained.
  -- Keys are salted hashes; no IP is stored, even in the counters.
  if v_ip is not null then
    v_net := pg_catalog.host(pg_catalog.network(pg_catalog.set_masklen(v_ip::inet, case when pg_catalog.family(v_ip::inet) = 4 then 24 else 48 end)));
    if not public.analytics_hit('n:' || encode(sha256(convert_to(v_salt || '|net|' || v_net, 'UTF8')), 'hex'), interval '1 hour', 300) then
      return;
    end if;
  end if;
  if not public.analytics_hit('v:' || v_hash, interval '1 hour', 120) then
    return;
  end if;
  if not public.analytics_hit('g', interval '1 minute', 1500) then
    return;
  end if;

  insert into public.page_views (page, project_slug, source, referrer_domain, device, visitor_hash)
  values (v_page, v_slug, v_source, case when v_source = 'other' then v_ref end, v_device, v_hash);
end;
$$;

-- ── Admin reporting ────────────────────────────────────────────────

/**
 * Aggregated statistics for the admin dashboard.
 *   p_from, p_to   inclusive local dates
 *   p_grain        'day' | 'week' | 'month'
 *   p_tz           IANA time zone of the admin's browser (falls back to UTC)
 */
create or replace function public.analytics_summary(p_from date, p_to date, p_grain text default 'day', p_tz text default 'UTC')
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cron  boolean := false;
  v_tz    text := 'UTC';
  v_from  timestamptz;
  v_to    timestamptz;
  v_grain text := case when p_grain in ('day', 'week', 'month') then p_grain else 'day' end;
  v_today date;
  v_result jsonb;
begin
  if not public.is_admin() then
    raise exception 'Only administrators can view analytics.' using errcode = '42501';
  end if;
  if p_from is null or p_to is null or p_to < p_from then
    raise exception 'Choose a valid date range.' using errcode = '22023';
  end if;
  if p_to - p_from > 3660 then
    raise exception 'The date range can be at most ten years.' using errcode = '22023';
  end if;
  if exists (select 1 from pg_catalog.pg_timezone_names where name = p_tz) then
    v_tz := p_tz;
  end if;
  -- Retention also runs here, so it never depends on visitor traffic alone.
  perform public.analytics_cleanup();
  if pg_catalog.to_regclass('cron.job') is not null then
    execute 'select exists (select 1 from cron.job where jobname = ''ek-analytics-cleanup'')' into v_cron;
  end if;

  v_from  := (p_from::timestamp) at time zone v_tz;
  v_to    := ((p_to + 1)::timestamp) at time zone v_tz;
  v_today := (now() at time zone v_tz)::date;

  select jsonb_build_object(
    'timezone', v_tz,
    'retention_months', 13,
    'cleanup_scheduled', v_cron,
    'ip_source', (select jsonb_build_object('header', trusted_ip_header, 'verified_at', verified_at) from public.analytics_config where id = 1),
    'totals', (
      select jsonb_build_object(
        'all_time_views', count(*),
        'all_time_visitors', count(distinct visitor_hash),
        'today_views', count(*) filter (where (created_at at time zone v_tz)::date = v_today),
        'month_views', count(*) filter (where date_trunc('month', created_at at time zone v_tz) = date_trunc('month', v_today::timestamp)),
        'first_view_at', min(created_at)
      ) from public.page_views
    ),
    'range', (
      select jsonb_build_object('views', count(*), 'visitors', count(distinct visitor_hash),
                                'entries', count(*) filter (where source <> 'internal'))
      from public.page_views where created_at >= v_from and created_at < v_to
    ),
    'series', (
      select coalesce(jsonb_agg(jsonb_build_object('bucket', b.bucket, 'views', coalesce(s.views, 0), 'visitors', coalesce(s.visitors, 0)) order by b.bucket), '[]'::jsonb)
      from (
        select distinct date_trunc(v_grain, d)::date as bucket
        from generate_series(p_from::timestamp, p_to::timestamp, interval '1 day') d
      ) b
      left join (
        select date_trunc(v_grain, created_at at time zone v_tz)::date as bucket, count(*) as views, count(distinct visitor_hash) as visitors
        from public.page_views where created_at >= v_from and created_at < v_to
        group by 1
      ) s using (bucket)
    ),
    'pages', (
      select coalesce(jsonb_agg(jsonb_build_object('page', page, 'views', views, 'visitors', visitors) order by views desc, page), '[]'::jsonb)
      from (select page, count(*) as views, count(distinct visitor_hash) as visitors
            from public.page_views where created_at >= v_from and created_at < v_to group by page) p
    ),
    'projects', (
      select coalesce(jsonb_agg(jsonb_build_object('slug', project_slug, 'views', views) order by views desc, project_slug), '[]'::jsonb)
      from (select project_slug, count(*) as views from public.page_views
            where created_at >= v_from and created_at < v_to and page = 'project'
            group by project_slug order by views desc, project_slug limit 10) p
    ),
    'sources', (
      select coalesce(jsonb_agg(jsonb_build_object('source', source, 'views', views) order by views desc, source), '[]'::jsonb)
      from (select source, count(*) as views from public.page_views
            where created_at >= v_from and created_at < v_to and source <> 'internal' group by source) s
    ),
    'referrers', (
      select coalesce(jsonb_agg(jsonb_build_object('domain', referrer_domain, 'views', views) order by views desc, referrer_domain), '[]'::jsonb)
      from (select referrer_domain, count(*) as views from public.page_views
            where created_at >= v_from and created_at < v_to and referrer_domain is not null
            group by referrer_domain order by views desc, referrer_domain limit 10) r
    ),
    'devices', (
      select coalesce(jsonb_agg(jsonb_build_object('device', device, 'views', views, 'visitors', visitors) order by views desc, device), '[]'::jsonb)
      from (select device, count(*) as views, count(distinct visitor_hash) as visitors
            from public.page_views where created_at >= v_from and created_at < v_to group by device) d
    )
  ) into v_result;
  return v_result;
end;
$$;

-- ── Trusted IP source verification (admin, run on the real infrastructure) ──

/**
 * Determines which IP header the gateway OVERWRITES. The admin's browser sends this request
 * with the same random marker IP in cf-connecting-ip, x-real-ip and x-forwarded-for, and in
 * x-ek-ip-probe (an ordinary custom header that reaches the database unchanged, proving the
 * marker was sent in this very request). A candidate header is trusted only if it holds a
 * valid IP that is NOT the marker: the gateway replaced or appended to the client value.
 * The result (possibly "none") is stored; until then no IP is used for analytics.
 */
create or replace function public.analytics_verify_ip_source(p_marker text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_headers jsonb;
  v_marker  text := public.analytics_valid_ip(p_marker);
  v_checks  jsonb := '[]'::jsonb;
  v_cand    text;
  v_ip      text;
  v_chosen  text;
begin
  if not public.is_admin() then
    raise exception 'Only administrators can do this.' using errcode = '42501';
  end if;
  if v_marker is null then
    raise exception 'Invalid marker.' using errcode = '22023';
  end if;
  begin
    v_headers := nullif(current_setting('request.headers', true), '')::jsonb;
  exception when others then
    v_headers := null;
  end;
  if public.analytics_valid_ip(trim(v_headers ->> 'x-ek-ip-probe')) is distinct from v_marker then
    raise exception 'The verification request did not include the test headers. Use the dashboard button.' using errcode = '22023';
  end if;
  foreach v_cand in array array['cf-connecting-ip', 'x-real-ip', 'x-forwarded-for:last'] loop
    v_ip := public.analytics_ip_from_headers(v_headers, v_cand);
    v_checks := v_checks || jsonb_build_object('header', v_cand, 'present', v_ip is not null, 'client_controlled', v_ip = v_marker);
    if v_chosen is null and v_ip is not null and v_ip <> v_marker then
      v_chosen := v_cand;
    end if;
  end loop;
  update public.analytics_config
  set trusted_ip_header = v_chosen, verified_at = now(), verified_by = auth.uid()
  where id = 1;
  return jsonb_build_object('trusted_header', v_chosen, 'checks', v_checks);
end;
$$;

-- ── Scheduled retention (pg_cron, only if this project provides it) ──

do $$
begin
  if exists (select 1 from pg_catalog.pg_available_extensions where name = 'pg_cron') then
    begin
      create extension if not exists pg_cron with schema pg_catalog;
      perform cron.schedule('ek-analytics-cleanup', '17 3 * * *', 'select public.analytics_cleanup()');
      raise notice 'Scheduled daily analytics cleanup (pg_cron job "ek-analytics-cleanup").';
    exception when others then
      raise notice 'pg_cron could not be configured (%). Cleanup still runs when the analytics dashboard is opened and on the first visit of each day.', sqlerrm;
    end;
  else
    raise notice 'pg_cron is not available. Cleanup runs when the analytics dashboard is opened and on the first visit of each day.';
  end if;
end;
$$;

-- ── Function privileges ────────────────────────────────────────────
-- Revoked from PUBLIC and, explicitly, from anon/authenticated (Supabase may grant those by
-- default privileges). Only the two intended entry points are re-granted.

revoke all on function public.analytics_source(text) from public, anon, authenticated;
revoke all on function public.analytics_valid_ip(text) from public, anon, authenticated;
revoke all on function public.analytics_ip_from_headers(jsonb, text) from public, anon, authenticated;
revoke all on function public.analytics_daily_salt() from public, anon, authenticated;
revoke all on function public.analytics_hit(text, interval, integer) from public, anon, authenticated;
revoke all on function public.analytics_cleanup() from public, anon, authenticated;
revoke all on function public.track_page_view(text, text, text, text) from public, anon, authenticated;
revoke all on function public.analytics_summary(date, date, text, text) from public, anon, authenticated;
revoke all on function public.analytics_verify_ip_source(text) from public, anon, authenticated;

-- Public: submit one restricted page-view event. Admin-only (checked inside): read, verify.
grant execute on function public.track_page_view(text, text, text, text) to anon, authenticated;
grant execute on function public.analytics_summary(date, date, text, text) to authenticated;
grant execute on function public.analytics_verify_ip_source(text) to authenticated;
