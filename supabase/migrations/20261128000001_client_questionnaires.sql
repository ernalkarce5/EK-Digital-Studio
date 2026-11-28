-- ════════════════════════════════════════════════════════════════════
-- EK Digital Studio — Client Project Questionnaire (Phase 1: database)
--
-- Additive and transactional. Creates new objects only; the two existing
-- CHECK constraints below are recreated with EVERY existing value kept plus
-- the new questionnaire values (verified against the live definitions).
--
-- Model
--   • One questionnaire per lead (contact message), managed ONLY by the
--     moderator currently assigned to that lead. Admins can READ rows (RLS)
--     for oversight but cannot modify or manage questionnaires.
--   • Clients have no account: they use a secret link. The token is 32 bytes
--     from pgcrypto's gen_random_bytes (256 bits of entropy, CSPRNG), sent as
--     43 base64url characters. Only sha256(token) is stored. The raw token is
--     returned once to the moderator and never stored or logged.
--   • Links expire after 30 days, can be revoked, and a resend issues a new
--     token (the old hash is replaced). Drafts and status are kept on resend.
--   • Submitted answers and submitted_at are immutable (trigger-enforced).
--   • Submission notifies the moderator and is logged; it NEVER changes the
--     lead status.
--   • Unsubmitted drafts are deleted 30 days after the link expired or was
--     revoked (questionnaire_cleanup). Submitted answers are never deleted by
--     cleanup; they are removed only together with the inquiry.
--
-- Requires: pgcrypto in the "extensions" schema (Supabase default). The
-- migration aborts — and changes nothing — if it is missing.
-- ════════════════════════════════════════════════════════════════════

begin;

-- ── 0. Pre-check: a cryptographically secure byte generator must exist ──
do $$
begin
  if not exists (
    select 1
    from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'extensions'
      and p.proname = 'gen_random_bytes'
      and pg_catalog.pg_get_function_identity_arguments(p.oid) = 'integer'
  ) then
    raise exception 'Client questionnaires require pgcrypto: extensions.gen_random_bytes(integer) was not found. Enable the pgcrypto extension in the "extensions" schema (Database → Extensions), then run this migration again. Nothing was changed.';
  end if;
end;
$$;

-- ── 1. Table ───────────────────────────────────────────────────────

create table public.client_questionnaires (
  id                      uuid primary key default gen_random_uuid(),
  message_id              uuid not null unique references public.contact_messages (id) on delete cascade,
  status                  text not null default 'not_sent'
                            check (status in ('not_sent', 'sent', 'in_progress', 'submitted', 'reviewed')),
  -- Link (only the hash of the secret token; NULL after revocation)
  token_hash              text unique check (token_hash ~ '^[0-9a-f]{64}$'),
  token_expires_at        timestamptz,
  link_generated_at       timestamptz,
  revoked_at              timestamptz,
  -- Moderator actions
  created_by              uuid references auth.users (id) on delete set null,
  sent_at                 timestamptz,
  sent_channel            text check (sent_channel in ('email', 'instagram')),
  send_count              integer not null default 0 check (send_count >= 0),
  reviewed_at             timestamptz,
  reviewed_by             uuid references auth.users (id) on delete set null,
  -- Client activity
  first_opened_at         timestamptz,
  last_client_activity_at timestamptz,
  draft_answers           jsonb check (draft_answers is null or jsonb_typeof(draft_answers) = 'object'),
  draft_saved_at          timestamptz,
  draft_purged_at         timestamptz,
  answers                 jsonb check (answers is null or jsonb_typeof(answers) = 'object'),
  submitted_at            timestamptz,
  schema_version          smallint not null default 1,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  check ((answers is null) = (submitted_at is null)),
  check (status not in ('submitted', 'reviewed') or submitted_at is not null),
  check ((status = 'reviewed') = (reviewed_at is not null)),
  check (submitted_at is null or draft_answers is null)
);

create index client_questionnaires_cleanup_idx on public.client_questionnaires (token_expires_at)
  where submitted_at is null and draft_answers is not null;

-- ── 2. Immutability and transition guard (applies to every writer) ──

create or replace function public.questionnaire_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.message_id is distinct from old.message_id or new.id is distinct from old.id then
    raise exception 'A questionnaire cannot be moved to another lead.' using errcode = '42501';
  end if;
  if old.submitted_at is not null then
    if new.answers is distinct from old.answers or new.submitted_at is distinct from old.submitted_at then
      raise exception 'Submitted questionnaire answers cannot be changed.' using errcode = '42501';
    end if;
    if new.draft_answers is not null then
      raise exception 'A submitted questionnaire has no draft.' using errcode = '42501';
    end if;
  end if;
  -- Allowed status transitions (no going back).
  if new.status is distinct from old.status and not (
       (old.status = 'not_sent' and new.status in ('sent', 'in_progress', 'submitted'))
    or (old.status = 'sent' and new.status in ('in_progress', 'submitted'))
    or (old.status = 'in_progress' and new.status = 'submitted')
    or (old.status = 'submitted' and new.status = 'reviewed')
  ) then
    raise exception 'Invalid questionnaire status change from % to %.', old.status, new.status using errcode = '22023';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create trigger client_questionnaires_guard before update on public.client_questionnaires
  for each row execute function public.questionnaire_guard();

-- ── 3. Access: RLS (read-only for admins and the current moderator) ──

revoke all on public.client_questionnaires from anon, authenticated;
alter table public.client_questionnaires enable row level security;

-- Every column except token_hash; no insert/update/delete for any client role.
grant select (
  id, message_id, status, token_expires_at, link_generated_at, revoked_at, created_by, sent_at, sent_channel,
  send_count, reviewed_at, reviewed_by, first_opened_at, last_client_activity_at, draft_answers, draft_saved_at,
  draft_purged_at, answers, submitted_at, schema_version, created_at, updated_at
) on public.client_questionnaires to authenticated;

create policy "client_questionnaires: admins and current moderator read"
  on public.client_questionnaires for select to authenticated
  using ((select public.is_admin()) or public.is_current_moderator_of(message_id));

-- ── 4. Extend existing allowed values (all existing values kept) ──

alter table public.lead_activity_logs
  drop constraint lead_activity_logs_action_check,
  add constraint lead_activity_logs_action_check check (action in (
    -- existing (20261123000001)
    'moderator_created', 'moderator_activated', 'moderator_deactivated',
    'assignment_created', 'assignment_transferred', 'assignment_returned',
    'status_changed', 'client_contacted', 'client_response_recorded',
    'client_info_updated', 'brief_created', 'brief_updated', 'brief_submitted',
    'review_started', 'changes_requested', 'brief_approved', 'assignment_archived',
    'note_added', 'help_requested',
    -- new
    'questionnaire_link_created', 'questionnaire_link_resent', 'questionnaire_sent',
    'questionnaire_revoked', 'questionnaire_started', 'questionnaire_submitted',
    'questionnaire_reviewed', 'questionnaire_applied_to_brief'));

alter table public.internal_notifications
  drop constraint internal_notifications_type_check,
  add constraint internal_notifications_type_check check (type in (
    -- existing (20261123000001)
    'brief_submitted', 'help_requested', 'assignment_returned', 'assignment_status',
    'moderator_attention', 'assignment_new', 'changes_requested', 'assignment_transferred',
    'admin_note', 'brief_approved',
    -- new
    'questionnaire_submitted'));

-- ── 5. Internal helpers (not callable by clients) ──────────────────

/** New secret token: 32 CSPRNG bytes → 43-char base64url, plus its sha256 hex. */
create or replace function public.questionnaire_new_token(out token text, out token_hash text)
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_bytes bytea := extensions.gen_random_bytes(32);
begin
  if v_bytes is null or octet_length(v_bytes) <> 32 then
    raise exception 'Secure token generation failed.';
  end if;
  token := translate(rtrim(encode(v_bytes, 'base64'), '='), '+/', '-_');
  if token !~ '^[A-Za-z0-9_-]{43}$' then
    raise exception 'Secure token generation failed.';
  end if;
  token_hash := encode(sha256(convert_to(token, 'UTF8')), 'hex');
end;
$$;

/** sha256 hex of a well-formed token, else NULL (malformed input never reaches a lookup). */
create or replace function public.questionnaire_token_hash(p_token text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case when p_token ~ '^[A-Za-z0-9_-]{43}$'
              then encode(sha256(convert_to(p_token, 'UTF8')), 'hex') end;
$$;

/** The current assignment if the lead may still receive questionnaire input, else NULL. */
create or replace function public.questionnaire_eligible_assignment(p_message_id uuid)
returns public.lead_assignments
language sql
stable
security definer
set search_path = ''
as $$
  select a.* from public.lead_assignments a
  where a.message_id = p_message_id and a.released_at is null
    and a.status in ('new_assignment', 'contacted', 'in_discussion', 'waiting_for_client',
                     'brief_in_progress', 'changes_requested');
$$;

/** Salted network key from the VERIFIED IP header only (see analytics_config); NULL if unverified. */
create or replace function public.questionnaire_network_key()
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_headers jsonb;
  v_ip      text;
begin
  begin
    v_headers := nullif(current_setting('request.headers', true), '')::jsonb;
  exception when others then
    return null;
  end;
  select public.analytics_ip_from_headers(v_headers, trusted_ip_header) into v_ip
  from public.analytics_config where id = 1 and trusted_ip_header is not null;
  if v_ip is null then
    return null;
  end if;
  return encode(sha256(convert_to(public.analytics_daily_salt() || '|qnet|' || pg_catalog.host(pg_catalog.network(
    pg_catalog.set_masklen(v_ip::inet, case when pg_catalog.family(v_ip::inet) = 4 then 24 else 48 end))), 'UTF8')), 'hex');
end;
$$;

-- ── Answer validation (server-side; never trusts the browser) ──────
-- Raises errcode 22023 with DETAIL = field key and a client-safe message.

create or replace function public.questionnaire_fail(p_field text, p_message text)
returns void
language plpgsql
set search_path = ''
as $$
begin
  raise exception '%', p_message using errcode = '22023', detail = p_field;
end;
$$;

create or replace function public.questionnaire_text(p jsonb, p_key text, p_max integer)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  v text;
begin
  if p -> p_key is null or jsonb_typeof(p -> p_key) = 'null' then
    return '{}'::jsonb;
  end if;
  if jsonb_typeof(p -> p_key) <> 'string' then
    perform public.questionnaire_fail(p_key, 'Invalid value.');
  end if;
  if char_length(p ->> p_key) > p_max then
    perform public.questionnaire_fail(p_key, format('Please keep this under %s characters.', p_max));
  end if;
  v := public.clean_text(p ->> p_key, p_max);
  return case when v is null then '{}'::jsonb else jsonb_build_object(p_key, v) end;
end;
$$;

create or replace function public.questionnaire_choice(p jsonb, p_key text, p_allowed text[])
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
begin
  if p -> p_key is null or jsonb_typeof(p -> p_key) = 'null' or p ->> p_key = '' then
    return '{}'::jsonb;
  end if;
  if jsonb_typeof(p -> p_key) <> 'string' or not ((p ->> p_key) = any (p_allowed)) then
    perform public.questionnaire_fail(p_key, 'Please choose one of the listed options.');
  end if;
  return jsonb_build_object(p_key, p ->> p_key);
end;
$$;

create or replace function public.questionnaire_choices(p jsonb, p_key text, p_allowed text[])
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  v_out text[] := '{}';
  v_el  jsonb;
begin
  if p -> p_key is null or jsonb_typeof(p -> p_key) = 'null' then
    return '{}'::jsonb;
  end if;
  if jsonb_typeof(p -> p_key) <> 'array' or jsonb_array_length(p -> p_key) > array_length(p_allowed, 1) then
    perform public.questionnaire_fail(p_key, 'Invalid selection.');
  end if;
  for v_el in select * from jsonb_array_elements(p -> p_key) loop
    if jsonb_typeof(v_el) <> 'string' or not ((v_el #>> '{}') = any (p_allowed)) then
      perform public.questionnaire_fail(p_key, 'Invalid selection.');
    end if;
    if not ((v_el #>> '{}') = any (v_out)) then
      v_out := v_out || (v_el #>> '{}');
    end if;
  end loop;
  return case when cardinality(v_out) = 0 then '{}'::jsonb else jsonb_build_object(p_key, to_jsonb(v_out)) end;
end;
$$;

create or replace function public.questionnaire_links(p jsonb, p_key text)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  v_out text[] := '{}';
  v_el  jsonb;
  v     text;
begin
  if p -> p_key is null or jsonb_typeof(p -> p_key) = 'null' then
    return '{}'::jsonb;
  end if;
  if jsonb_typeof(p -> p_key) <> 'array' or jsonb_array_length(p -> p_key) > 10 then
    perform public.questionnaire_fail(p_key, 'Please add at most 10 links.');
  end if;
  for v_el in select * from jsonb_array_elements(p -> p_key) loop
    if jsonb_typeof(v_el) <> 'string' then
      perform public.questionnaire_fail(p_key, 'Invalid link.');
    end if;
    v := trim(v_el #>> '{}');
    continue when v = '';
    if char_length(v) > 500 or v !~* '^https?://[^\s<>"''`]+$' then
      perform public.questionnaire_fail(p_key, 'Links must start with http:// or https://.');
    end if;
    if not (v = any (v_out)) then
      v_out := v_out || v;
    end if;
  end loop;
  return case when cardinality(v_out) = 0 then '{}'::jsonb else jsonb_build_object(p_key, to_jsonb(v_out)) end;
end;
$$;

/**
 * Builds a clean answers object from untrusted input: only known keys, allowed options,
 * length limits, sanitised text, valid links and dates. p_final adds the submit rules
 * (required fields, budget currency).
 */
create or replace function public.questionnaire_clean_answers(p_input jsonb, p_final boolean)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  p jsonb := coalesce(p_input, '{}'::jsonb);
  r jsonb := '{}'::jsonb;
  v_date date;
begin
  if jsonb_typeof(p) <> 'object' then
    perform public.questionnaire_fail('answers', 'Invalid answers.');
  end if;
  if octet_length(p::text) > 32768 then
    perform public.questionnaire_fail('answers', 'The answers are too long.');
  end if;

  -- A. Website
  r := r || public.questionnaire_choice(p, 'website_type', array['business_website', 'portfolio_website', 'ecommerce_website', 'landing_page', 'booking_website', 'other']);
  r := r || public.questionnaire_text(p, 'website_type_other', 200);
  r := r || public.questionnaire_text(p, 'project_name', 200);
  r := r || public.questionnaire_text(p, 'project_description', 5000);
  -- B. Functionality
  r := r || public.questionnaire_choices(p, 'features', array['contact_form', 'booking', 'admin_dashboard', 'payments', 'user_accounts', 'catalog', 'gallery', 'blog', 'multilingual', 'other']);
  r := r || public.questionnaire_text(p, 'features_other', 500);
  -- C. Design
  r := r || public.questionnaire_choice(p, 'visual_style', array['minimal', 'modern', 'elegant', 'bold', 'playful', 'corporate', 'not_sure']);
  r := r || public.questionnaire_text(p, 'preferred_colors', 500);
  r := r || public.questionnaire_links(p, 'reference_links');
  r := r || public.questionnaire_text(p, 'design_notes', 2000);
  -- D. Budget (currency stored separately; meaningless when not decided)
  r := r || public.questionnaire_choice(p, 'budget_range', array['under_500', '500_1000', '1000_2500', '2500_5000', '5000_10000', '10000_plus', 'not_decided']);
  r := r || public.questionnaire_choice(p, 'budget_currency', array['EUR', 'BAM', 'USD']);
  r := r || public.questionnaire_text(p, 'budget_notes', 1000);
  if r ->> 'budget_range' = 'not_decided' then
    r := r - 'budget_currency';
  end if;
  -- E. Deadline
  if p -> 'deadline' is not null and jsonb_typeof(p -> 'deadline') <> 'null' and p ->> 'deadline' <> '' then
    if jsonb_typeof(p -> 'deadline') <> 'string' or p ->> 'deadline' !~ '^\d{4}-\d{2}-\d{2}$' then
      perform public.questionnaire_fail('deadline', 'Please enter a valid date.');
    end if;
    begin
      v_date := (p ->> 'deadline')::date;
    exception when others then
      perform public.questionnaire_fail('deadline', 'Please enter a valid date.');
    end;
    if v_date < current_date or v_date > current_date + interval '3 years' then
      perform public.questionnaire_fail('deadline', 'Please choose a date between today and three years from now.');
    end if;
    r := r || jsonb_build_object('deadline', to_char(v_date, 'YYYY-MM-DD'));
  end if;
  r := r || public.questionnaire_choice(p, 'urgency', array['flexible', 'normal', 'soon', 'urgent']);
  r := r || public.questionnaire_text(p, 'deadline_notes', 1000);
  -- F. Additional
  r := r || public.questionnaire_text(p, 'additional_requirements', 5000);
  r := r || public.questionnaire_links(p, 'additional_links');

  if p_final then
    if r ->> 'website_type' is null then
      perform public.questionnaire_fail('website_type', 'Please choose the type of website.');
    end if;
    if char_length(coalesce(r ->> 'project_description', '')) < 20 then
      perform public.questionnaire_fail('project_description', 'Please describe your project in at least 20 characters.');
    end if;
    if r ? 'budget_range' and r ->> 'budget_range' <> 'not_decided' and not (r ? 'budget_currency') then
      perform public.questionnaire_fail('budget_currency', 'Please choose a currency for your budget.');
    end if;
  end if;
  return r;
end;
$$;

/**
 * The ONLY shape a moderator function returns: an explicit allow-list of fields.
 * Never token_hash (excluded from column grants) and never answers or drafts
 * (the dashboard reads those through RLS-protected column selects).
 */
create or replace function public.questionnaire_safe_summary(p_row public.client_questionnaires)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'id', p_row.id,
    'message_id', p_row.message_id,
    'status', p_row.status,
    'link_active', p_row.token_hash is not null and p_row.revoked_at is null and p_row.token_expires_at > now(),
    'token_expires_at', p_row.token_expires_at,
    'link_generated_at', p_row.link_generated_at,
    'revoked_at', p_row.revoked_at,
    'sent_at', p_row.sent_at,
    'sent_channel', p_row.sent_channel,
    'send_count', p_row.send_count,
    'first_opened_at', p_row.first_opened_at,
    'last_client_activity_at', p_row.last_client_activity_at,
    'draft_saved_at', p_row.draft_saved_at,
    'submitted_at', p_row.submitted_at,
    'reviewed_at', p_row.reviewed_at,
    'reviewed_by', p_row.reviewed_by,
    'updated_at', p_row.updated_at
  );
$$;

-- ── 6. Moderator functions (current assignment required) ───────────

/** Creates the questionnaire link, or issues a new one (old link stops working). Returns the raw token ONCE. */
create or replace function public.questionnaire_generate_link(p_message_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.client_questionnaires;
  v_tok record;
  v_a   public.lead_assignments;
  v_resent boolean := false;
begin
  if not public.lead_is_editable_by_moderator(p_message_id) then
    raise exception 'You can only manage questionnaires for active leads assigned to you.' using errcode = '42501';
  end if;
  v_a := public.lead_current_assignment_for_message(p_message_id);
  select * into v_row from public.client_questionnaires where message_id = p_message_id for update;
  if found and v_row.submitted_at is not null then
    raise exception 'This questionnaire has already been submitted.' using errcode = '22023';
  end if;

  select * into v_tok from public.questionnaire_new_token();
  if v_row.id is null then
    insert into public.client_questionnaires (message_id, token_hash, token_expires_at, link_generated_at, created_by)
    values (p_message_id, v_tok.token_hash, now() + interval '30 days', now(), auth.uid())
    returning * into v_row;
  else
    v_resent := true;
    update public.client_questionnaires
    set token_hash = v_tok.token_hash, token_expires_at = now() + interval '30 days',
        link_generated_at = now(), revoked_at = null
    where id = v_row.id
    returning * into v_row;
  end if;

  perform public.lead_log(case when v_resent then 'questionnaire_link_resent' else 'questionnaire_link_created' end,
                          v_a.id, p_message_id, v_a.moderator_id, jsonb_build_object('expires_at', v_row.token_expires_at));
  return public.questionnaire_safe_summary(v_row)
      || jsonb_build_object('token', v_tok.token, 'expires_at', v_row.token_expires_at, 'resent', v_resent);
end;
$$;

/** Records that the moderator sent the link (email / Instagram); also adds an outgoing communication record. */
create or replace function public.questionnaire_mark_sent(p_message_id uuid, p_channel text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.client_questionnaires;
  v_a   public.lead_assignments;
begin
  if not public.lead_is_editable_by_moderator(p_message_id) then
    raise exception 'You can only manage questionnaires for active leads assigned to you.' using errcode = '42501';
  end if;
  if p_channel is null or p_channel not in ('email', 'instagram') then
    raise exception 'Choose email or Instagram.' using errcode = '22023';
  end if;
  select * into v_row from public.client_questionnaires where message_id = p_message_id for update;
  if not found or v_row.token_hash is null or v_row.token_expires_at <= now() then
    raise exception 'Generate a questionnaire link first.' using errcode = '22023';
  end if;
  if v_row.submitted_at is not null then
    raise exception 'This questionnaire has already been submitted.' using errcode = '22023';
  end if;
  v_a := public.lead_current_assignment_for_message(p_message_id);

  update public.client_questionnaires
  set sent_at = now(), sent_channel = p_channel, send_count = send_count + 1,
      status = case when status = 'not_sent' then 'sent' else status end
  where id = v_row.id
  returning * into v_row;

  -- Existing communication history (author stamped by its trigger).
  insert into public.communication_logs (message_id, channel, direction, summary, author_role)
  values (p_message_id, p_channel, 'outgoing', 'Sent the project questionnaire link to the client.', 'moderator');

  perform public.lead_log('questionnaire_sent', v_a.id, p_message_id, v_a.moderator_id, jsonb_build_object('channel', p_channel));
  return public.questionnaire_safe_summary(v_row);
end;
$$;

/** Disables the current link immediately. */
create or replace function public.questionnaire_revoke(p_message_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.client_questionnaires;
  v_a   public.lead_assignments;
begin
  if not public.is_current_moderator_of(p_message_id) then
    raise exception 'You can only manage questionnaires for leads assigned to you.' using errcode = '42501';
  end if;
  select * into v_row from public.client_questionnaires where message_id = p_message_id for update;
  if not found or v_row.token_hash is null then
    raise exception 'There is no active questionnaire link.' using errcode = '22023';
  end if;
  v_a := public.lead_current_assignment_for_message(p_message_id);
  update public.client_questionnaires set token_hash = null, revoked_at = now() where id = v_row.id returning * into v_row;
  perform public.lead_log('questionnaire_revoked', v_a.id, p_message_id, v_a.moderator_id, '{}'::jsonb);
  return public.questionnaire_safe_summary(v_row);
end;
$$;

/** Explicit review only (applying answers to the brief does not mark it reviewed). */
create or replace function public.questionnaire_mark_reviewed(p_message_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.client_questionnaires;
  v_a   public.lead_assignments;
begin
  if not public.is_current_moderator_of(p_message_id) then
    raise exception 'You can only manage questionnaires for leads assigned to you.' using errcode = '42501';
  end if;
  select * into v_row from public.client_questionnaires where message_id = p_message_id for update;
  if not found or v_row.status <> 'submitted' then
    raise exception 'Only a submitted questionnaire can be marked as reviewed.' using errcode = '22023';
  end if;
  v_a := public.lead_current_assignment_for_message(p_message_id);
  update public.client_questionnaires set status = 'reviewed', reviewed_at = now(), reviewed_by = auth.uid()
  where id = v_row.id returning * into v_row;
  perform public.lead_log('questionnaire_reviewed', v_a.id, p_message_id, v_a.moderator_id, '{}'::jsonb);
  return public.questionnaire_safe_summary(v_row);
end;
$$;

/** Audit entry when the moderator used the answers to prefill the existing Project Brief. */
create or replace function public.questionnaire_record_applied(p_message_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_a public.lead_assignments;
begin
  if not public.lead_is_editable_by_moderator(p_message_id) then
    raise exception 'You can only manage questionnaires for active leads assigned to you.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.client_questionnaires where message_id = p_message_id and submitted_at is not null) then
    raise exception 'The questionnaire has not been submitted yet.' using errcode = '22023';
  end if;
  v_a := public.lead_current_assignment_for_message(p_message_id);
  perform public.lead_log('questionnaire_applied_to_brief', v_a.id, p_message_id, v_a.moderator_id, '{}'::jsonb);
end;
$$;

-- ── 7. Client functions (no account; secret link) ──────────────────
-- Uniform answer {ok:false, error:'unavailable'} for unknown, malformed,
-- expired, revoked and ineligible links, so links cannot be probed.

/**
 * Finds and locks the questionnaire for a valid, active token; NULL otherwise.
 * INTERNAL ONLY: returns the full row (incl. token_hash) to the calling definer
 * functions; it is never granted to any role and its result is never returned.
 */
create or replace function public.questionnaire_by_token(p_token text)
returns public.client_questionnaires
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_hash text := public.questionnaire_token_hash(p_token);
  v_row  public.client_questionnaires;
begin
  if v_hash is null then
    return null;
  end if;
  select * into v_row from public.client_questionnaires
  where token_hash = v_hash and revoked_at is null and token_expires_at > now()
  for update;
  return v_row;
end;
$$;

/**
 * Rate limits for client calls, in two stages:
 *  - p_token_key NULL (before the token lookup): per-network limit only, and only with a
 *    VERIFIED IP source. Unknown/forged tokens therefore never create per-token counter
 *    rows and never consume the shared global budget.
 *  - p_token_key set (after a valid token was found): per-token and global limits.
 */
create or replace function public.questionnaire_allow(p_action text, p_token_key text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_net text;
begin
  if p_token_key is null then
    v_net := public.questionnaire_network_key();
    return v_net is null or public.analytics_hit('q:n:' || p_action || ':' || v_net, interval '1 hour',
             case p_action when 'open' then 120 when 'save' then 600 else 30 end);
  end if;
  if not public.analytics_hit('q:t:' || p_action || ':' || p_token_key, interval '1 hour',
       case p_action when 'open' then 60 when 'save' then 300 else 10 end) then
    return false;
  end if;
  return public.analytics_hit('q:g:' || p_action, interval '1 hour',
       case p_action when 'open' then 5000 when 'save' then 10000 else 1000 end);
end;
$$;

create or replace function public.questionnaire_open(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row  public.client_questionnaires;
  v_key  text := left(public.questionnaire_token_hash(p_token), 32);
  v_name text;
begin
  if not public.questionnaire_allow('open', null) then
    return jsonb_build_object('ok', false, 'error', 'rate_limited');
  end if;
  v_row := public.questionnaire_by_token(p_token);
  if v_row.id is null then
    return jsonb_build_object('ok', false, 'error', 'unavailable');
  end if;
  if not public.questionnaire_allow('open', v_key) then
    return jsonb_build_object('ok', false, 'error', 'rate_limited');
  end if;
  select nullif(split_part(public.clean_text(full_name, 120), ' ', 1), '') into v_name
  from public.contact_messages where id = v_row.message_id;
  if v_row.submitted_at is not null then
    return jsonb_build_object('ok', true, 'status', 'submitted', 'first_name', v_name);
  end if;
  if public.questionnaire_eligible_assignment(v_row.message_id) is null then
    return jsonb_build_object('ok', false, 'error', 'unavailable');
  end if;
  update public.client_questionnaires
  set first_opened_at = coalesce(first_opened_at, now()), last_client_activity_at = now()
  where id = v_row.id;
  return jsonb_build_object('ok', true, 'status', 'open', 'first_name', v_name,
                            'draft', coalesce(v_row.draft_answers, '{}'::jsonb), 'draft_saved_at', v_row.draft_saved_at,
                            'expires_at', v_row.token_expires_at);
end;
$$;

create or replace function public.questionnaire_save_draft(p_token text, p_answers jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row   public.client_questionnaires;
  v_key   text := left(public.questionnaire_token_hash(p_token), 32);
  v_clean jsonb;
  v_a     public.lead_assignments;
  v_field text;
begin
  if not public.questionnaire_allow('save', null) then
    return jsonb_build_object('ok', false, 'error', 'rate_limited');
  end if;
  v_row := public.questionnaire_by_token(p_token);
  if v_row.id is null or v_row.submitted_at is not null then
    return jsonb_build_object('ok', false, 'error', case when v_row.submitted_at is not null then 'submitted' else 'unavailable' end);
  end if;
  if not public.questionnaire_allow('save', v_key) then
    return jsonb_build_object('ok', false, 'error', 'rate_limited');
  end if;
  v_a := public.questionnaire_eligible_assignment(v_row.message_id);
  if v_a.id is null then
    return jsonb_build_object('ok', false, 'error', 'unavailable');
  end if;
  begin
    v_clean := public.questionnaire_clean_answers(p_answers, false);
  exception when sqlstate '22023' then
    get stacked diagnostics v_field = pg_exception_detail;
    return jsonb_build_object('ok', false, 'error', 'invalid', 'field', v_field, 'message', sqlerrm);
  end;

  update public.client_questionnaires
  set draft_answers = v_clean, draft_saved_at = now(), draft_purged_at = null, last_client_activity_at = now(),
      first_opened_at = coalesce(first_opened_at, now()),
      status = case when status in ('not_sent', 'sent') then 'in_progress' else status end
  where id = v_row.id;
  if v_row.status in ('not_sent', 'sent') then
    perform public.lead_log('questionnaire_started', v_a.id, v_row.message_id, v_a.moderator_id, jsonb_build_object('by', 'client'));
  end if;
  return jsonb_build_object('ok', true, 'saved_at', now());
end;
$$;

create or replace function public.questionnaire_submit(p_token text, p_answers jsonb, p_elapsed_ms integer default null, p_website text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row   public.client_questionnaires;
  v_key   text := left(public.questionnaire_token_hash(p_token), 32);
  v_clean jsonb;
  v_a     public.lead_assignments;
  v_name  text;
  v_field text;
  v_active boolean;
begin
  -- Spam protection: honeypot and implausibly fast submissions are acknowledged but ignored.
  if nullif(trim(coalesce(p_website, '')), '') is not null or coalesce(p_elapsed_ms, 0) < 1500 then
    return jsonb_build_object('ok', true, 'status', 'submitted');
  end if;
  if not public.questionnaire_allow('submit', null) then
    return jsonb_build_object('ok', false, 'error', 'rate_limited');
  end if;
  v_row := public.questionnaire_by_token(p_token);
  if v_row.id is null then
    return jsonb_build_object('ok', false, 'error', 'unavailable');
  end if;
  if not public.questionnaire_allow('submit', v_key) then
    return jsonb_build_object('ok', false, 'error', 'rate_limited');
  end if;
  if v_row.submitted_at is not null then
    return jsonb_build_object('ok', true, 'status', 'submitted'); -- idempotent; answers never change
  end if;
  v_a := public.questionnaire_eligible_assignment(v_row.message_id);
  if v_a.id is null then
    return jsonb_build_object('ok', false, 'error', 'unavailable');
  end if;
  begin
    v_clean := public.questionnaire_clean_answers(p_answers, true);
  exception when sqlstate '22023' then
    get stacked diagnostics v_field = pg_exception_detail;
    return jsonb_build_object('ok', false, 'error', 'invalid', 'field', v_field, 'message', sqlerrm);
  end;

  update public.client_questionnaires
  set answers = v_clean, submitted_at = now(), status = 'submitted', draft_answers = null, draft_saved_at = null,
      first_opened_at = coalesce(first_opened_at, now()), last_client_activity_at = now()
  where id = v_row.id;

  -- Notification + audit only. The lead status is deliberately NOT changed.
  select full_name into v_name from public.contact_messages where id = v_row.message_id;
  perform public.lead_log('questionnaire_submitted', v_a.id, v_row.message_id, v_a.moderator_id,
                          jsonb_build_object('by', 'client', 'client', v_name));
  select is_active into v_active from public.moderators where id = v_a.moderator_id;
  if coalesce(v_active, false) then
    perform public.lead_notify(v_a.moderator_id, 'questionnaire_submitted', 'Questionnaire submitted: ' || v_name,
                               'The client submitted the project questionnaire.', v_row.message_id, v_a.id);
  else
    perform public.lead_notify_admins('questionnaire_submitted', 'Questionnaire submitted: ' || v_name,
                                      'The assigned moderator is inactive; the lead needs an owner.', v_row.message_id, v_a.id);
  end if;
  return jsonb_build_object('ok', true, 'status', 'submitted');
end;
$$;

-- ── 8. Retention: unsubmitted drafts only ──────────────────────────

/** Deletes draft answers 30 days after the link expired or was revoked. Never touches submitted answers. */
create or replace function public.questionnaire_cleanup()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  update public.client_questionnaires
  set draft_answers = null, draft_saved_at = null, draft_purged_at = now()
  where submitted_at is null
    and draft_answers is not null
    and ((revoked_at is not null and revoked_at < now() - interval '30 days')
      or (token_expires_at is not null and token_expires_at < now() - interval '30 days'));
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

do $$
begin
  if exists (select 1 from pg_catalog.pg_extension where extname = 'pg_cron') then
    perform cron.schedule('ek-questionnaire-cleanup', '37 3 * * *', 'select public.questionnaire_cleanup()');
    raise notice 'Scheduled daily questionnaire draft cleanup (pg_cron job "ek-questionnaire-cleanup").';
  else
    raise notice 'pg_cron is not installed: run "select public.questionnaire_cleanup();" periodically.';
  end if;
end;
$$;

-- ── 9. Function privileges ─────────────────────────────────────────

revoke all on function public.questionnaire_guard() from public, anon, authenticated;
revoke all on function public.questionnaire_new_token() from public, anon, authenticated;
revoke all on function public.questionnaire_token_hash(text) from public, anon, authenticated;
revoke all on function public.questionnaire_eligible_assignment(uuid) from public, anon, authenticated;
revoke all on function public.questionnaire_network_key() from public, anon, authenticated;
revoke all on function public.questionnaire_fail(text, text) from public, anon, authenticated;
revoke all on function public.questionnaire_text(jsonb, text, integer) from public, anon, authenticated;
revoke all on function public.questionnaire_choice(jsonb, text, text[]) from public, anon, authenticated;
revoke all on function public.questionnaire_choices(jsonb, text, text[]) from public, anon, authenticated;
revoke all on function public.questionnaire_links(jsonb, text) from public, anon, authenticated;
revoke all on function public.questionnaire_clean_answers(jsonb, boolean) from public, anon, authenticated;
revoke all on function public.questionnaire_generate_link(uuid) from public, anon, authenticated;
revoke all on function public.questionnaire_mark_sent(uuid, text) from public, anon, authenticated;
revoke all on function public.questionnaire_revoke(uuid) from public, anon, authenticated;
revoke all on function public.questionnaire_mark_reviewed(uuid) from public, anon, authenticated;
revoke all on function public.questionnaire_record_applied(uuid) from public, anon, authenticated;
revoke all on function public.questionnaire_by_token(text) from public, anon, authenticated;
revoke all on function public.questionnaire_safe_summary(public.client_questionnaires) from public, anon, authenticated;
revoke all on function public.questionnaire_allow(text, text) from public, anon, authenticated;
revoke all on function public.questionnaire_open(text) from public, anon, authenticated;
revoke all on function public.questionnaire_save_draft(text, jsonb) from public, anon, authenticated;
revoke all on function public.questionnaire_submit(text, jsonb, integer, text) from public, anon, authenticated;
revoke all on function public.questionnaire_cleanup() from public, anon, authenticated;

-- Moderators (authorization re-checked inside: current assignment; admins are refused).
grant execute on function public.questionnaire_generate_link(uuid) to authenticated;
grant execute on function public.questionnaire_mark_sent(uuid, text) to authenticated;
grant execute on function public.questionnaire_revoke(uuid) to authenticated;
grant execute on function public.questionnaire_mark_reviewed(uuid) to authenticated;
grant execute on function public.questionnaire_record_applied(uuid) to authenticated;
-- Clients with a link (no account).
grant execute on function public.questionnaire_open(text) to anon, authenticated;
grant execute on function public.questionnaire_save_draft(text, jsonb) to anon, authenticated;
grant execute on function public.questionnaire_submit(text, jsonb, integer, text) to anon, authenticated;

commit;
