-- ════════════════════════════════════════════════════════════════════
-- EK Digital Studio — Moderators & client (lead) management
--
-- Additive only. Existing tables, policies and functions are unchanged,
-- except for ONE new read policy on contact_messages that lets the
-- currently assigned, active moderator read that single inquiry.
--
-- Model
--   • Admin      = profiles.is_admin (unchanged, public.is_admin()).
--   • Moderator  = row in public.moderators with is_active = true.
--   • A contact message becomes a "lead" when assigned. Assignments are
--     history rows; the current one has released_at IS NULL (max one per
--     message). Transfers/returns release the row and keep the history.
--   • Lead data (client info, brief, communication, notes) is keyed by
--     message_id, so it survives transfers; only the CURRENT moderator
--     (and admins) can see it.
--   • Ownership/status changes go through security-definer functions that
--     validate role + status transitions, write the audit log and create
--     notifications. Moderators have no direct write access to
--     assignments, audit logs or notifications.
-- ════════════════════════════════════════════════════════════════════

-- ── Moderators ─────────────────────────────────────────────────────

create table public.moderators (
  id             uuid primary key references auth.users (id) on delete cascade,
  full_name      text not null check (char_length(trim(full_name)) between 1 and 120),
  email          text not null check (char_length(email) between 3 and 254),
  is_active      boolean not null default true,
  created_by     uuid references auth.users (id) on delete set null,
  deactivated_at timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create unique index moderators_email_idx on public.moderators (lower(email));

create trigger moderators_updated_at before update on public.moderators
  for each row execute function public.set_updated_at();

create or replace function public.is_moderator()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.moderators
    where id = auth.uid() and is_active
  );
$$;

/** 'admin' | 'moderator' | null — used by the frontend to route users. */
create or replace function public.app_role()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when public.is_admin() then 'admin'
    when public.is_moderator() then 'moderator'
    else null
  end;
$$;

-- ── Lead assignments ───────────────────────────────────────────────

create table public.lead_assignments (
  id             uuid primary key default gen_random_uuid(),
  message_id     uuid not null references public.contact_messages (id) on delete restrict,
  moderator_id   uuid not null references public.moderators (id) on delete restrict,
  status         text not null default 'new_assignment' check (status in (
                   'new_assignment', 'contacted', 'in_discussion', 'waiting_for_client',
                   'brief_in_progress', 'brief_completed', 'admin_review',
                   'changes_requested', 'approved', 'archived')),
  admin_note     text check (char_length(admin_note) <= 2000),
  assigned_by    uuid references auth.users (id) on delete set null,
  assigned_at    timestamptz not null default now(),
  released_at    timestamptz,
  release_reason text check (release_reason in ('transferred', 'returned_by_admin', 'returned_by_moderator')),
  submitted_at   timestamptz,
  approved_at    timestamptz,
  archived_at    timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  check ((released_at is null) = (release_reason is null))
);

-- One current assignment per message; history rows are unlimited.
create unique index lead_assignments_current_idx on public.lead_assignments (message_id) where released_at is null;
create index lead_assignments_moderator_idx on public.lead_assignments (moderator_id, status) where released_at is null;
create index lead_assignments_status_idx on public.lead_assignments (status) where released_at is null;
create index lead_assignments_message_idx on public.lead_assignments (message_id, assigned_at desc);

create trigger lead_assignments_updated_at before update on public.lead_assignments
  for each row execute function public.set_updated_at();

/** True when the caller is the active moderator currently assigned to the message. */
create or replace function public.is_current_moderator_of(p_message_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.lead_assignments a
    join public.moderators m on m.id = a.moderator_id
    where a.message_id = p_message_id
      and a.released_at is null
      and a.moderator_id = auth.uid()
      and m.is_active
  );
$$;

/** Statuses in which the current moderator may still edit client info and the brief. */
create or replace function public.lead_is_editable_by_moderator(p_message_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_current_moderator_of(p_message_id) and exists (
    select 1 from public.lead_assignments
    where message_id = p_message_id and released_at is null
      and status in ('new_assignment', 'contacted', 'in_discussion', 'waiting_for_client',
                     'brief_in_progress', 'changes_requested')
  );
$$;

-- ── Lead data (keyed by message, survives transfers) ───────────────

create table public.lead_clients (
  message_id          uuid primary key references public.contact_messages (id) on delete cascade,
  company             text not null default '' check (char_length(company) <= 200),
  industry            text not null default '' check (char_length(industry) <= 200),
  preferred_contact   text not null default '' check (char_length(preferred_contact) <= 200),
  additional_contacts text not null default '' check (char_length(additional_contacts) <= 2000),
  notes               text not null default '' check (char_length(notes) <= 5000),
  updated_by          uuid references auth.users (id) on delete set null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create trigger lead_clients_updated_at before update on public.lead_clients
  for each row execute function public.set_updated_at();

create table public.project_briefs (
  message_id             uuid primary key references public.contact_messages (id) on delete cascade,
  project_type           text check (project_type in (
                           'business_website', 'portfolio_website', 'ecommerce_website', 'landing_page',
                           'web_application', 'booking_website', 'website_redesign', 'other')),
  description            text not null default '' check (char_length(description) <= 5000),
  objectives             text not null default '' check (char_length(objectives) <= 5000),
  target_audience        text not null default '' check (char_length(target_audience) <= 3000),
  design_style           text not null default '' check (char_length(design_style) <= 3000),
  preferred_colors       text not null default '' check (char_length(preferred_colors) <= 1000),
  required_pages         text not null default '' check (char_length(required_pages) <= 3000),
  required_functionality text not null default '' check (char_length(required_functionality) <= 5000),
  reference_websites     text not null default '' check (char_length(reference_websites) <= 3000),
  special_requirements   text not null default '' check (char_length(special_requirements) <= 3000),
  preferred_technologies text not null default '' check (char_length(preferred_technologies) <= 2000),
  frontend_requirements  text not null default '' check (char_length(frontend_requirements) <= 3000),
  backend_requirements   text not null default '' check (char_length(backend_requirements) <= 3000),
  database_requirements  text not null default '' check (char_length(database_requirements) <= 3000),
  integrations           text not null default '' check (char_length(integrations) <= 3000),
  hosting_requirements   text not null default '' check (char_length(hosting_requirements) <= 2000),
  budget                 text not null default '' check (char_length(budget) <= 200),
  deadline               date,
  priority               text check (priority in ('low', 'medium', 'high', 'urgent')),
  additional_information text not null default '' check (char_length(additional_information) <= 5000),
  -- Set only by submit_brief() / review_brief(); not writable by clients.
  submitted_at           timestamptz,
  submitted_by           uuid references auth.users (id) on delete set null,
  approved_at            timestamptz,
  approved_by            uuid references auth.users (id) on delete set null,
  updated_by             uuid references auth.users (id) on delete set null,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

create trigger project_briefs_updated_at before update on public.project_briefs
  for each row execute function public.set_updated_at();

create table public.communication_logs (
  id          uuid primary key default gen_random_uuid(),
  message_id  uuid not null references public.contact_messages (id) on delete cascade,
  author_id   uuid references auth.users (id) on delete set null,
  author_role text not null check (author_role in ('admin', 'moderator')),
  channel     text not null check (channel in ('email', 'instagram', 'phone', 'whatsapp', 'linkedin', 'meeting', 'other')),
  direction   text not null check (direction in ('outgoing', 'incoming', 'note')),
  occurred_at timestamptz not null default now(),
  summary     text not null check (char_length(trim(summary)) between 1 and 5000),
  created_at  timestamptz not null default now(),
  check (occurred_at <= created_at + interval '1 day')
);

create index communication_logs_message_idx on public.communication_logs (message_id, occurred_at);

create table public.lead_notes (
  id          uuid primary key default gen_random_uuid(),
  message_id  uuid not null references public.contact_messages (id) on delete cascade,
  author_id   uuid references auth.users (id) on delete set null,
  author_role text not null check (author_role in ('admin', 'moderator')),
  visibility  text not null default 'shared' check (visibility in ('shared', 'admin_only')),
  kind        text not null default 'note' check (kind in ('note', 'help_request')),
  body        text not null check (char_length(trim(body)) between 1 and 3000),
  created_at  timestamptz not null default now(),
  check (not (author_role = 'moderator' and visibility = 'admin_only')),
  check (not (author_role = 'admin' and kind = 'help_request'))
);

create index lead_notes_message_idx on public.lead_notes (message_id, created_at);

-- ── Notifications ──────────────────────────────────────────────────

create table public.internal_notifications (
  id            bigint generated always as identity primary key,
  recipient_id  uuid not null references auth.users (id) on delete cascade,
  type          text not null check (type in (
                  'brief_submitted', 'help_requested', 'assignment_returned', 'assignment_status',
                  'moderator_attention', 'assignment_new', 'changes_requested', 'assignment_transferred',
                  'admin_note', 'brief_approved')),
  title         text not null check (char_length(title) <= 200),
  body          text not null default '' check (char_length(body) <= 1000),
  message_id    uuid references public.contact_messages (id) on delete cascade,
  assignment_id uuid references public.lead_assignments (id) on delete set null,
  read_at       timestamptz,
  created_at    timestamptz not null default now()
);

create index internal_notifications_recipient_idx on public.internal_notifications (recipient_id, created_at desc);
create index internal_notifications_unread_idx on public.internal_notifications (recipient_id) where read_at is null;

-- ── Lead activity log (append-only audit) ──────────────────────────

create table public.lead_activity_logs (
  id            bigint generated always as identity primary key,
  actor_id      uuid references auth.users (id) on delete set null,
  actor_role    text not null check (actor_role in ('admin', 'moderator', 'system')),
  action        text not null check (action in (
                  'moderator_created', 'moderator_activated', 'moderator_deactivated',
                  'assignment_created', 'assignment_transferred', 'assignment_returned',
                  'status_changed', 'client_contacted', 'client_response_recorded',
                  'client_info_updated', 'brief_created', 'brief_updated', 'brief_submitted',
                  'review_started', 'changes_requested', 'brief_approved', 'assignment_archived',
                  'note_added', 'help_requested')),
  assignment_id uuid references public.lead_assignments (id) on delete set null,
  message_id    uuid references public.contact_messages (id) on delete set null,
  moderator_id  uuid references public.moderators (id) on delete set null,
  metadata      jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now()
);

create index lead_activity_logs_created_idx on public.lead_activity_logs (created_at desc);
create index lead_activity_logs_message_idx on public.lead_activity_logs (message_id, created_at desc);
create index lead_activity_logs_actor_idx on public.lead_activity_logs (actor_id, created_at desc);

-- ── Internal helpers (not callable by clients) ─────────────────────

create or replace function public.lead_log(
  p_action text, p_assignment_id uuid, p_message_id uuid, p_moderator_id uuid, p_metadata jsonb default '{}'::jsonb
)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.lead_activity_logs (actor_id, actor_role, action, assignment_id, message_id, moderator_id, metadata)
  values (auth.uid(), coalesce(public.app_role(), 'system'), p_action, p_assignment_id, p_message_id, p_moderator_id,
          coalesce(p_metadata, '{}'::jsonb));
$$;

create or replace function public.lead_notify(
  p_recipient uuid, p_type text, p_title text, p_body text, p_message_id uuid, p_assignment_id uuid
)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.internal_notifications (recipient_id, type, title, body, message_id, assignment_id)
  select p_recipient, p_type, left(p_title, 200), left(coalesce(p_body, ''), 1000), p_message_id, p_assignment_id
  where p_recipient is not null;
$$;

create or replace function public.lead_notify_admins(
  p_type text, p_title text, p_body text, p_message_id uuid, p_assignment_id uuid
)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.internal_notifications (recipient_id, type, title, body, message_id, assignment_id)
  select id, p_type, left(p_title, 200), left(coalesce(p_body, ''), 1000), p_message_id, p_assignment_id
  from public.profiles where is_admin;
$$;

create or replace function public.lead_require_admin()
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Only administrators can do this.' using errcode = '42501';
  end if;
end;
$$;

/** Locks and returns the CURRENT assignment row, or raises. */
create or replace function public.lead_current_assignment(p_assignment_id uuid)
returns public.lead_assignments
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.lead_assignments;
begin
  select * into v from public.lead_assignments where id = p_assignment_id for update;
  if not found then
    raise exception 'Assignment not found.' using errcode = 'P0002';
  end if;
  if v.released_at is not null then
    raise exception 'This assignment is no longer active.' using errcode = '22023';
  end if;
  return v;
end;
$$;

-- ── Moderator account management (admin) ───────────────────────────

/**
 * Makes an EXISTING Supabase Auth user a moderator (or reactivates one).
 * Account creation itself (invite email) happens server-side in the
 * Netlify function, which then calls this with the admin's own session.
 */
create or replace function public.admin_add_moderator(p_email text, p_full_name text)
returns public.moderators
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid;
  v_row     public.moderators;
  v_name    text := nullif(trim(coalesce(p_full_name, '')), '');
begin
  perform public.lead_require_admin();
  if v_name is null then
    raise exception 'Please enter the moderator''s name.' using errcode = '22023';
  end if;

  select id into v_user_id from auth.users where lower(email) = lower(trim(p_email));
  if v_user_id is null then
    raise exception 'No account exists for that email yet. Invite the moderator first.' using errcode = 'P0002';
  end if;
  if exists (select 1 from public.profiles where id = v_user_id and is_admin) then
    raise exception 'Administrators cannot be moderators.' using errcode = '22023';
  end if;

  insert into public.moderators (id, full_name, email, is_active, created_by)
  values (v_user_id, left(v_name, 120), lower(trim(p_email)), true, auth.uid())
  on conflict (id) do update
    set full_name = excluded.full_name, is_active = true, deactivated_at = null
  returning * into v_row;

  perform public.lead_log('moderator_created', null, null, v_row.id, jsonb_build_object('name', v_row.full_name));
  return v_row;
end;
$$;

create or replace function public.admin_set_moderator_active(p_moderator_id uuid, p_active boolean)
returns public.moderators
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row  public.moderators;
  v_open integer;
begin
  perform public.lead_require_admin();
  update public.moderators
  set is_active = p_active, deactivated_at = case when p_active then null else now() end
  where id = p_moderator_id
  returning * into v_row;
  if not found then
    raise exception 'Moderator not found.' using errcode = 'P0002';
  end if;
  select count(*) into v_open from public.lead_assignments
  where moderator_id = v_row.id and released_at is null and status not in ('approved', 'archived');
  perform public.lead_log(case when p_active then 'moderator_activated' else 'moderator_deactivated' end,
                          null, null, v_row.id, jsonb_build_object('open_leads', v_open));
  -- A deactivated moderator can no longer see their leads: flag any that still need an owner.
  if not p_active and v_open > 0 then
    perform public.lead_notify_admins('moderator_attention',
      v_row.full_name || ' was deactivated with ' || v_open || ' open lead(s)',
      'Transfer or retrieve these leads so the clients are not left waiting.', null, null);
  end if;
  return v_row;
end;
$$;

-- ── Assignment workflow (admin) ────────────────────────────────────

create or replace function public.assign_lead(p_message_id uuid, p_moderator_id uuid, p_note text default null)
returns public.lead_assignments
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row  public.lead_assignments;
  v_name text;
begin
  perform public.lead_require_admin();
  if not exists (select 1 from public.moderators where id = p_moderator_id and is_active) then
    raise exception 'Choose an active moderator.' using errcode = '22023';
  end if;
  select full_name into v_name from public.contact_messages where id = p_message_id;
  if not found then
    raise exception 'Message not found.' using errcode = 'P0002';
  end if;
  if exists (select 1 from public.lead_assignments where message_id = p_message_id and released_at is null) then
    raise exception 'This message is already assigned. Transfer it instead.' using errcode = '22023';
  end if;

  insert into public.lead_assignments (message_id, moderator_id, admin_note, assigned_by)
  values (p_message_id, p_moderator_id, nullif(left(trim(coalesce(p_note, '')), 2000), ''), auth.uid())
  returning * into v_row;

  perform public.lead_log('assignment_created', v_row.id, p_message_id, p_moderator_id,
                          jsonb_build_object('client', v_name));
  perform public.lead_notify(p_moderator_id, 'assignment_new', 'New lead assigned: ' || v_name,
                             coalesce(v_row.admin_note, ''), p_message_id, v_row.id);
  return v_row;
end;
$$;

/** Moves the current assignment to another moderator. Lead data and status carry over. */
create or replace function public.transfer_lead(p_assignment_id uuid, p_moderator_id uuid, p_note text default null)
returns public.lead_assignments
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old  public.lead_assignments;
  v_new  public.lead_assignments;
  v_name text;
begin
  perform public.lead_require_admin();
  v_old := public.lead_current_assignment(p_assignment_id);
  if v_old.moderator_id = p_moderator_id then
    raise exception 'The lead is already assigned to this moderator.' using errcode = '22023';
  end if;
  if not exists (select 1 from public.moderators where id = p_moderator_id and is_active) then
    raise exception 'Choose an active moderator.' using errcode = '22023';
  end if;
  select full_name into v_name from public.contact_messages where id = v_old.message_id;

  update public.lead_assignments set released_at = now(), release_reason = 'transferred' where id = v_old.id;
  insert into public.lead_assignments (message_id, moderator_id, status, admin_note, assigned_by, submitted_at, approved_at, archived_at)
  values (v_old.message_id, p_moderator_id, v_old.status,
          coalesce(nullif(left(trim(coalesce(p_note, '')), 2000), ''), v_old.admin_note), auth.uid(),
          v_old.submitted_at, v_old.approved_at, v_old.archived_at)
  returning * into v_new;

  perform public.lead_log('assignment_transferred', v_new.id, v_old.message_id, p_moderator_id,
                          jsonb_build_object('from_moderator', v_old.moderator_id, 'to_moderator', p_moderator_id,
                                             'previous_assignment', v_old.id, 'client', v_name));
  perform public.lead_notify(v_old.moderator_id, 'assignment_transferred', 'Lead transferred: ' || v_name,
                             'This lead was reassigned to another moderator.', v_old.message_id, null);
  perform public.lead_notify(p_moderator_id, 'assignment_new', 'Lead transferred to you: ' || v_name,
                             coalesce(v_new.admin_note, ''), v_old.message_id, v_new.id);
  return v_new;
end;
$$;

/** Admin retrieves a lead: it returns to the unassigned inbox. History is kept. */
create or replace function public.return_lead(p_assignment_id uuid, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v    public.lead_assignments;
  v_name text;
begin
  perform public.lead_require_admin();
  v := public.lead_current_assignment(p_assignment_id);
  select full_name into v_name from public.contact_messages where id = v.message_id;
  update public.lead_assignments set released_at = now(), release_reason = 'returned_by_admin' where id = v.id;
  perform public.lead_log('assignment_returned', v.id, v.message_id, v.moderator_id,
                          jsonb_build_object('by', 'admin', 'reason', coalesce(p_reason, ''), 'client', v_name));
  perform public.lead_notify(v.moderator_id, 'assignment_transferred', 'Lead retrieved by admin: ' || v_name,
                             coalesce(p_reason, ''), v.message_id, null);
end;
$$;

-- ── Status management ──────────────────────────────────────────────

/** Allowed manual transitions for moderators (submission/approval have their own functions). */
create or replace function public.lead_moderator_transition_allowed(p_from text, p_to text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select case
    when p_from = p_to then false
    when p_from in ('new_assignment', 'contacted', 'in_discussion', 'waiting_for_client', 'brief_in_progress', 'changes_requested')
      then p_to in ('contacted', 'in_discussion', 'waiting_for_client', 'brief_in_progress')
    when p_from = 'approved' then p_to = 'archived'
    else false
  end;
$$;

create or replace function public.moderator_set_status(p_assignment_id uuid, p_status text)
returns public.lead_assignments
language plpgsql
security definer
set search_path = ''
as $$
declare
  v    public.lead_assignments;
  v_name text;
begin
  v := public.lead_current_assignment(p_assignment_id);
  if v.moderator_id <> auth.uid() or not public.is_moderator() then
    raise exception 'You can only update your own assignments.' using errcode = '42501';
  end if;
  if not public.lead_moderator_transition_allowed(v.status, p_status) then
    raise exception 'Status cannot change from % to %.', v.status, p_status using errcode = '22023';
  end if;
  select full_name into v_name from public.contact_messages where id = v.message_id;

  update public.lead_assignments
  set status = p_status, archived_at = case when p_status = 'archived' then now() else archived_at end
  where id = v.id
  returning * into v;

  perform public.lead_log(case when p_status = 'archived' then 'assignment_archived' else 'status_changed' end,
                          v.id, v.message_id, v.moderator_id, jsonb_build_object('to', p_status, 'client', v_name));
  perform public.lead_notify_admins('assignment_status', v_name || ': ' || replace(p_status, '_', ' '),
                                    'Status updated by the moderator.', v.message_id, v.id);
  return v;
end;
$$;

/** Admin override: any status. */
create or replace function public.admin_set_status(p_assignment_id uuid, p_status text, p_note text default null)
returns public.lead_assignments
language plpgsql
security definer
set search_path = ''
as $$
declare
  v    public.lead_assignments;
  v_from text;
begin
  perform public.lead_require_admin();
  v := public.lead_current_assignment(p_assignment_id);
  v_from := v.status;
  if v_from = p_status then
    return v;
  end if;
  update public.lead_assignments
  set status = p_status,
      archived_at = case when p_status = 'archived' then now() else archived_at end,
      approved_at = case when p_status = 'approved' then coalesce(approved_at, now()) else approved_at end
  where id = v.id
  returning * into v;
  perform public.lead_log(case when p_status = 'archived' then 'assignment_archived' else 'status_changed' end,
                          v.id, v.message_id, v.moderator_id,
                          jsonb_build_object('from', v_from, 'to', p_status, 'override', true, 'note', coalesce(p_note, '')));
  perform public.lead_notify(v.moderator_id, 'admin_note', 'Status changed by admin: ' || replace(p_status, '_', ' '),
                             coalesce(p_note, ''), v.message_id, v.id);
  return v;
end;
$$;

-- ── Brief submission & review ──────────────────────────────────────

create or replace function public.submit_brief(p_assignment_id uuid)
returns public.lead_assignments
language plpgsql
security definer
set search_path = ''
as $$
declare
  v    public.lead_assignments;
  v_name text;
begin
  v := public.lead_current_assignment(p_assignment_id);
  if v.moderator_id <> auth.uid() or not public.is_moderator() then
    raise exception 'You can only submit briefs for your own assignments.' using errcode = '42501';
  end if;
  if v.status not in ('new_assignment', 'contacted', 'in_discussion', 'waiting_for_client', 'brief_in_progress', 'changes_requested') then
    raise exception 'This brief has already been submitted.' using errcode = '22023';
  end if;
  if not exists (select 1 from public.project_briefs where message_id = v.message_id) then
    raise exception 'Save the project brief before submitting it.' using errcode = '22023';
  end if;
  select full_name into v_name from public.contact_messages where id = v.message_id;

  update public.project_briefs set submitted_at = now(), submitted_by = auth.uid() where message_id = v.message_id;
  update public.lead_assignments set status = 'brief_completed', submitted_at = now() where id = v.id returning * into v;

  perform public.lead_log('brief_submitted', v.id, v.message_id, v.moderator_id, jsonb_build_object('client', v_name));
  perform public.lead_notify_admins('brief_submitted', 'Project brief submitted: ' || v_name,
                                    'Awaiting your review.', v.message_id, v.id);
  return v;
end;
$$;

/** p_decision: 'start_review' | 'approve' | 'request_changes' */
create or replace function public.review_brief(p_assignment_id uuid, p_decision text, p_note text default null)
returns public.lead_assignments
language plpgsql
security definer
set search_path = ''
as $$
declare
  v      public.lead_assignments;
  v_name text;
  v_note text := nullif(trim(coalesce(p_note, '')), '');
begin
  perform public.lead_require_admin();
  v := public.lead_current_assignment(p_assignment_id);
  select full_name into v_name from public.contact_messages where id = v.message_id;

  if p_decision = 'start_review' then
    if v.status <> 'brief_completed' then
      raise exception 'Only submitted briefs can be reviewed.' using errcode = '22023';
    end if;
    update public.lead_assignments set status = 'admin_review' where id = v.id returning * into v;
    perform public.lead_log('review_started', v.id, v.message_id, v.moderator_id, jsonb_build_object('client', v_name));

  elsif p_decision = 'approve' then
    if v.status not in ('brief_completed', 'admin_review') then
      raise exception 'Only submitted briefs can be approved.' using errcode = '22023';
    end if;
    update public.project_briefs set approved_at = now(), approved_by = auth.uid() where message_id = v.message_id;
    update public.lead_assignments set status = 'approved', approved_at = now() where id = v.id returning * into v;
    perform public.lead_log('brief_approved', v.id, v.message_id, v.moderator_id, jsonb_build_object('client', v_name));
    perform public.lead_notify(v.moderator_id, 'brief_approved', 'Brief approved: ' || v_name,
                               coalesce(v_note, ''), v.message_id, v.id);

  elsif p_decision = 'request_changes' then
    if v.status not in ('brief_completed', 'admin_review') then
      raise exception 'Only submitted briefs can be returned.' using errcode = '22023';
    end if;
    if v_note is null then
      raise exception 'Describe what additional information is needed.' using errcode = '22023';
    end if;
    update public.project_briefs set submitted_at = null, submitted_by = null where message_id = v.message_id;
    update public.lead_assignments set status = 'changes_requested' where id = v.id returning * into v;
    -- Logged BEFORE the note so the note trigger sees it and skips a duplicate "admin_note" notification.
    perform public.lead_log('changes_requested', v.id, v.message_id, v.moderator_id,
                            jsonb_build_object('client', v_name, 'note', left(v_note, 500)));
    insert into public.lead_notes (message_id, author_id, author_role, visibility, kind, body)
    values (v.message_id, auth.uid(), 'admin', 'shared', 'note', left(v_note, 3000));
    perform public.lead_notify(v.moderator_id, 'changes_requested', 'More information needed: ' || v_name,
                               left(v_note, 1000), v.message_id, v.id);
  else
    raise exception 'Unknown review decision.' using errcode = '22023';
  end if;
  return v;
end;
$$;

/** Moderator hands a lead back to the admin (e.g. not a fit). */
create or replace function public.moderator_return_lead(p_assignment_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v      public.lead_assignments;
  v_name text;
  v_reason text := nullif(trim(coalesce(p_reason, '')), '');
begin
  v := public.lead_current_assignment(p_assignment_id);
  if v.moderator_id <> auth.uid() or not public.is_moderator() then
    raise exception 'You can only return your own assignments.' using errcode = '42501';
  end if;
  if v.status in ('approved', 'archived') then
    raise exception 'Completed leads cannot be returned.' using errcode = '22023';
  end if;
  if v_reason is null then
    raise exception 'Please explain why the lead is being returned.' using errcode = '22023';
  end if;
  select full_name into v_name from public.contact_messages where id = v.message_id;
  update public.lead_assignments set released_at = now(), release_reason = 'returned_by_moderator' where id = v.id;
  perform public.lead_log('assignment_returned', v.id, v.message_id, v.moderator_id,
                          jsonb_build_object('by', 'moderator', 'reason', left(v_reason, 500), 'client', v_name));
  perform public.lead_notify_admins('assignment_returned', 'Lead returned: ' || v_name, left(v_reason, 1000), v.message_id, null);
end;
$$;

-- ── Triggers: authorship, audit and notifications for lead data ────

/** Stamps author/updater from the session so it cannot be spoofed. */
create or replace function public.lead_stamp_author()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_table_name in ('communication_logs', 'lead_notes') then
    new.author_id := auth.uid();
    new.author_role := coalesce(public.app_role(), new.author_role);
  else
    new.updated_by := auth.uid();
  end if;
  return new;
end;
$$;

create trigger lead_clients_stamp before insert or update on public.lead_clients
  for each row execute function public.lead_stamp_author();
create trigger project_briefs_stamp before insert or update on public.project_briefs
  for each row execute function public.lead_stamp_author();
create trigger communication_logs_stamp before insert on public.communication_logs
  for each row execute function public.lead_stamp_author();
create trigger lead_notes_stamp before insert on public.lead_notes
  for each row execute function public.lead_stamp_author();

create or replace function public.lead_current_assignment_for_message(p_message_id uuid)
returns public.lead_assignments
language sql
stable
security definer
set search_path = ''
as $$
  select * from public.lead_assignments where message_id = p_message_id and released_at is null;
$$;

create or replace function public.lead_after_data_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  a public.lead_assignments := public.lead_current_assignment_for_message(new.message_id);
begin
  if tg_table_name = 'project_briefs' then
    -- Only content changes are logged (submit/approve stamps are logged by their functions).
    if tg_op = 'UPDATE' and (to_jsonb(new) - 'updated_at' - 'updated_by' - 'submitted_at' - 'submitted_by' - 'approved_at' - 'approved_by')
                          = (to_jsonb(old) - 'updated_at' - 'updated_by' - 'submitted_at' - 'submitted_by' - 'approved_at' - 'approved_by') then
      return null;
    end if;
    perform public.lead_log(case when tg_op = 'INSERT' then 'brief_created' else 'brief_updated' end,
                            a.id, new.message_id, a.moderator_id, '{}'::jsonb);
  elsif tg_table_name = 'lead_clients' then
    perform public.lead_log('client_info_updated', a.id, new.message_id, a.moderator_id, '{}'::jsonb);
  elsif tg_table_name = 'communication_logs' then
    perform public.lead_log(case when new.direction = 'incoming' then 'client_response_recorded' else 'client_contacted' end,
                            a.id, new.message_id, a.moderator_id,
                            jsonb_build_object('channel', new.channel, 'direction', new.direction));
    -- First outgoing contact moves a fresh assignment to "contacted".
    if a.id is not null and a.status = 'new_assignment' and new.direction = 'outgoing' then
      update public.lead_assignments set status = 'contacted' where id = a.id;
    end if;
  elsif tg_table_name = 'lead_notes' then
    if new.kind = 'help_request' then
      perform public.lead_log('help_requested', a.id, new.message_id, a.moderator_id, '{}'::jsonb);
      perform public.lead_notify_admins('help_requested', 'Moderator requests assistance',
                                        left(new.body, 1000), new.message_id, a.id);
    else
      perform public.lead_log('note_added', a.id, new.message_id, a.moderator_id,
                              jsonb_build_object('visibility', new.visibility));
      if new.author_role = 'admin' and new.visibility = 'shared' and a.id is not null
         and not exists (  -- review_brief() already notifies for change requests
           select 1 from public.lead_activity_logs l
           where l.message_id = new.message_id and l.action = 'changes_requested' and l.created_at = now()) then
        perform public.lead_notify(a.moderator_id, 'admin_note', 'Admin added a note',
                                   left(new.body, 1000), new.message_id, a.id);
      end if;
    end if;
  end if;
  return null;
end;
$$;

create trigger lead_clients_audit after insert or update on public.lead_clients
  for each row execute function public.lead_after_data_change();
create trigger project_briefs_audit after insert or update on public.project_briefs
  for each row execute function public.lead_after_data_change();
create trigger communication_logs_audit after insert on public.communication_logs
  for each row execute function public.lead_after_data_change();
create trigger lead_notes_audit after insert on public.lead_notes
  for each row execute function public.lead_after_data_change();

-- ── Privileges (defence in depth; RLS still applies) ───────────────

revoke all on public.moderators, public.lead_assignments, public.lead_clients, public.project_briefs,
              public.communication_logs, public.lead_notes, public.internal_notifications,
              public.lead_activity_logs
  from anon, authenticated;

grant select on public.moderators, public.lead_assignments, public.lead_clients, public.project_briefs,
               public.communication_logs, public.lead_notes, public.internal_notifications,
               public.lead_activity_logs
  to authenticated;

-- Moderators may only rename themselves; is_active / email are function-only.
grant update (full_name) on public.moderators to authenticated;

grant insert, update on public.lead_clients to authenticated;
grant delete on public.lead_clients to authenticated;

-- Brief content columns only: submission/approval stamps are function-only.
grant insert (message_id, project_type, description, objectives, target_audience, design_style, preferred_colors,
              required_pages, required_functionality, reference_websites, special_requirements,
              preferred_technologies, frontend_requirements, backend_requirements, database_requirements,
              integrations, hosting_requirements, budget, deadline, priority, additional_information)
  on public.project_briefs to authenticated;
grant update (project_type, description, objectives, target_audience, design_style, preferred_colors,
              required_pages, required_functionality, reference_websites, special_requirements,
              preferred_technologies, frontend_requirements, backend_requirements, database_requirements,
              integrations, hosting_requirements, budget, deadline, priority, additional_information)
  on public.project_briefs to authenticated;

grant insert (message_id, channel, direction, occurred_at, summary, author_role) on public.communication_logs to authenticated;
grant delete on public.communication_logs to authenticated;
grant insert (message_id, visibility, kind, body, author_role) on public.lead_notes to authenticated;
grant delete on public.lead_notes to authenticated;
grant update (read_at) on public.internal_notifications to authenticated;
grant delete on public.internal_notifications to authenticated;

-- ── Row Level Security ─────────────────────────────────────────────

alter table public.moderators             enable row level security;
alter table public.lead_assignments       enable row level security;
alter table public.lead_clients           enable row level security;
alter table public.project_briefs         enable row level security;
alter table public.communication_logs     enable row level security;
alter table public.lead_notes             enable row level security;
alter table public.internal_notifications enable row level security;
alter table public.lead_activity_logs     enable row level security;

-- moderators
create policy "moderators: admins read all, moderators read self"
  on public.moderators for select to authenticated
  using ((select public.is_admin()) or id = (select auth.uid()));
create policy "moderators: rename self or admin"
  on public.moderators for update to authenticated
  using ((select public.is_admin()) or (id = (select auth.uid()) and (select public.is_moderator())))
  with check ((select public.is_admin()) or (id = (select auth.uid()) and (select public.is_moderator())));

-- lead_assignments (writes only through functions)
create policy "lead_assignments: admins read all, moderators read own current"
  on public.lead_assignments for select to authenticated
  using ((select public.is_admin())
         or (moderator_id = (select auth.uid()) and released_at is null and (select public.is_moderator())));

-- contact_messages: the ONLY change to existing tables — read access for the current moderator.
create policy "contact_messages: current moderator reads assigned"
  on public.contact_messages for select to authenticated
  using (public.is_current_moderator_of(id));

-- lead_clients
create policy "lead_clients: read" on public.lead_clients for select to authenticated
  using ((select public.is_admin()) or public.is_current_moderator_of(message_id));
create policy "lead_clients: insert" on public.lead_clients for insert to authenticated
  with check ((select public.is_admin()) or public.lead_is_editable_by_moderator(message_id));
create policy "lead_clients: update" on public.lead_clients for update to authenticated
  using ((select public.is_admin()) or public.lead_is_editable_by_moderator(message_id))
  with check ((select public.is_admin()) or public.lead_is_editable_by_moderator(message_id));
create policy "lead_clients: admins delete" on public.lead_clients for delete to authenticated
  using ((select public.is_admin()));

-- project_briefs
create policy "project_briefs: read" on public.project_briefs for select to authenticated
  using ((select public.is_admin()) or public.is_current_moderator_of(message_id));
create policy "project_briefs: insert" on public.project_briefs for insert to authenticated
  with check ((select public.is_admin()) or public.lead_is_editable_by_moderator(message_id));
create policy "project_briefs: update" on public.project_briefs for update to authenticated
  using ((select public.is_admin()) or public.lead_is_editable_by_moderator(message_id))
  with check ((select public.is_admin()) or public.lead_is_editable_by_moderator(message_id));

-- communication_logs (append-only for moderators)
create policy "communication_logs: read" on public.communication_logs for select to authenticated
  using ((select public.is_admin()) or public.is_current_moderator_of(message_id));
create policy "communication_logs: insert" on public.communication_logs for insert to authenticated
  with check ((select public.is_admin()) or public.is_current_moderator_of(message_id));
create policy "communication_logs: admins delete" on public.communication_logs for delete to authenticated
  using ((select public.is_admin()));

-- lead_notes
create policy "lead_notes: read" on public.lead_notes for select to authenticated
  using ((select public.is_admin()) or (visibility = 'shared' and public.is_current_moderator_of(message_id)));
create policy "lead_notes: insert" on public.lead_notes for insert to authenticated
  with check ((select public.is_admin())
              or (public.is_current_moderator_of(message_id) and visibility = 'shared' and author_role = 'moderator'));
create policy "lead_notes: admins delete" on public.lead_notes for delete to authenticated
  using ((select public.is_admin()));

-- internal_notifications (own only; created by functions)
create policy "notifications: read own" on public.internal_notifications for select to authenticated
  using (recipient_id = (select auth.uid()));
create policy "notifications: mark own read" on public.internal_notifications for update to authenticated
  using (recipient_id = (select auth.uid())) with check (recipient_id = (select auth.uid()));
create policy "notifications: delete own" on public.internal_notifications for delete to authenticated
  using (recipient_id = (select auth.uid()));

-- lead_activity_logs (read-only for everyone; written by functions/triggers)
create policy "lead_activity: admins all, moderators own or own leads"
  on public.lead_activity_logs for select to authenticated
  using ((select public.is_admin())
         or ((select public.is_moderator())
             and (actor_id = (select auth.uid()) or (message_id is not null and public.is_current_moderator_of(message_id)))));

-- ── Function privileges ────────────────────────────────────────────

revoke all on function public.is_moderator() from public;
revoke all on function public.app_role() from public;
revoke all on function public.is_current_moderator_of(uuid) from public;
revoke all on function public.lead_is_editable_by_moderator(uuid) from public;
revoke all on function public.lead_log(text, uuid, uuid, uuid, jsonb) from public;
revoke all on function public.lead_notify(uuid, text, text, text, uuid, uuid) from public;
revoke all on function public.lead_notify_admins(text, text, text, uuid, uuid) from public;
revoke all on function public.lead_require_admin() from public;
revoke all on function public.lead_current_assignment(uuid) from public;
revoke all on function public.lead_current_assignment_for_message(uuid) from public;
revoke all on function public.lead_moderator_transition_allowed(text, text) from public;
revoke all on function public.lead_stamp_author() from public;
revoke all on function public.lead_after_data_change() from public;
revoke all on function public.admin_add_moderator(text, text) from public;
revoke all on function public.admin_set_moderator_active(uuid, boolean) from public;
revoke all on function public.assign_lead(uuid, uuid, text) from public;
revoke all on function public.transfer_lead(uuid, uuid, text) from public;
revoke all on function public.return_lead(uuid, text) from public;
revoke all on function public.moderator_set_status(uuid, text) from public;
revoke all on function public.admin_set_status(uuid, text, text) from public;
revoke all on function public.submit_brief(uuid) from public;
revoke all on function public.review_brief(uuid, text, text) from public;
revoke all on function public.moderator_return_lead(uuid, text) from public;

grant execute on function public.is_moderator() to authenticated;
grant execute on function public.app_role() to anon, authenticated;
-- Used inside RLS policies evaluated as the caller.
grant execute on function public.is_current_moderator_of(uuid) to authenticated;
grant execute on function public.lead_is_editable_by_moderator(uuid) to authenticated;

grant execute on function public.admin_add_moderator(text, text) to authenticated;
grant execute on function public.admin_set_moderator_active(uuid, boolean) to authenticated;
grant execute on function public.assign_lead(uuid, uuid, text) to authenticated;
grant execute on function public.transfer_lead(uuid, uuid, text) to authenticated;
grant execute on function public.return_lead(uuid, text) to authenticated;
grant execute on function public.moderator_set_status(uuid, text) to authenticated;
grant execute on function public.admin_set_status(uuid, text, text) to authenticated;
grant execute on function public.submit_brief(uuid) to authenticated;
grant execute on function public.review_brief(uuid, text, text) to authenticated;
grant execute on function public.moderator_return_lead(uuid, text) to authenticated;
