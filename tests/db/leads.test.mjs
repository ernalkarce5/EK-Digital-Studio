// Moderator & lead-management security tests.
// Runs every migration in PGlite (real PostgreSQL in WASM) on a stub of
// Supabase's auth/storage schemas, then checks RLS, column privileges,
// workflow functions, audit logging and notifications as: admin, two
// moderators, an ordinary signed-in user and an anonymous visitor.
//
//   npm run test:db
import { PGlite } from '@electric-sql/pglite';
import { readdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const migrationsDir = join(root, 'supabase', 'migrations');

const SUPABASE_STUB = `
  create role anon nologin;
  create role authenticated nologin;
  create role service_role nologin bypassrls;
  create schema auth;
  create table auth.users (id uuid primary key, email text unique);
  create function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
  $$;
  grant usage on schema auth to anon, authenticated;
  grant execute on function auth.uid() to anon, authenticated;
  create schema storage;
  create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
  create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text references storage.buckets(id), name text, owner uuid);
  alter table storage.objects enable row level security;
  grant usage on schema storage to anon, authenticated;
  grant all on storage.objects to anon, authenticated;
  -- Supabase grants these by default; the migrations must lock new tables down despite them.
  alter default privileges in schema public grant all on tables to anon, authenticated;
`;

const ADMIN = '11111111-1111-1111-1111-111111111111';
const MOD1 = '33333333-3333-3333-3333-333333333333';
const MOD2 = '44444444-4444-4444-4444-444444444444';
const USER = '22222222-2222-2222-2222-222222222222';
const MOD3 = '55555555-5555-5555-5555-555555555555';

const db = new PGlite();
let passed = 0;
let failed = 0;
const failures = [];

async function test(name, fn) {
  try {
    await db.exec('reset role');
    await fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    failed++;
    failures.push(name);
    console.log(`  ✗ ${name}\n      ${err.message}`);
  } finally {
    await db.exec('reset role');
  }
}
const assert = (cond, msg) => {
  if (!cond) throw new Error(msg);
};
async function as(role, uid) {
  await db.exec('reset role');
  await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [uid ?? '']);
  await db.exec(`set role ${role}`);
}
const admin = () => as('authenticated', ADMIN);
const mod1 = () => as('authenticated', MOD1);
const mod2 = () => as('authenticated', MOD2);
async function rejects(sql, params = [], pattern) {
  try {
    await db.query(sql, params);
  } catch (err) {
    if (pattern && !pattern.test(err.message)) throw new Error(`wrong error: ${err.message}`);
    return err.message;
  }
  throw new Error(`expected failure: ${sql}`);
}
async function rows(sql, params = []) {
  return (await db.query(sql, params)).rows;
}
async function one(sql, params = []) {
  return (await rows(sql, params))[0];
}
async function su(sql, params = []) {
  await db.exec('reset role');
  return rows(sql, params);
}

// ── Setup ──────────────────────────────────────────────────────────
await db.exec(SUPABASE_STUB);
const files = readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort();
console.log(`\nApplying ${files.length} migrations`);
for (const f of files) {
  try {
    await db.exec(readFileSync(join(migrationsDir, f), 'utf8'));
    console.log(`  ✓ ${f}`);
  } catch (err) {
    console.log(`  ✗ ${f}: ${err.message}`);
    process.exit(1);
  }
}

await db.exec(`
  insert into auth.users (id, email) values
    ('${ADMIN}', 'admin@example.com'), ('${MOD1}', 'mod1@example.com'), ('${MOD2}', 'mod2@example.com'),
    ('${USER}', 'user@example.com'), ('${MOD3}', 'mod3@example.com');
  insert into public.profiles (id, is_admin, is_public, full_name) values ('${ADMIN}', true, true, 'Admin');
`);
const msg = {};
for (const key of ['m1', 'm2', 'm3', 'm4', 'm5']) {
  const r = await one(
    `insert into public.contact_messages (full_name, email, project_type, message)
     values ($1, $2, 'Website Design', 'Original inquiry message for this lead.') returning id`,
    [`Client ${key}`, `${key}@client.test`],
  );
  msg[key] = r.id;
}
const current = async (messageId) =>
  su(`select * from public.lead_assignments where message_id = $1 and released_at is null`, [messageId]).then((r) => r[0]);

// ── Moderator accounts ─────────────────────────────────────────────
console.log('\nModerator accounts');
await test('non-admins cannot create moderators', async () => {
  await as('authenticated', USER);
  await rejects(`select public.admin_add_moderator('mod1@example.com', 'Mod One')`, [], /administrators/i);
  await as('anon');
  await rejects(`select public.admin_add_moderator('mod1@example.com', 'Mod One')`);
});
await test('admin links existing accounts as moderators', async () => {
  await admin();
  const a = await one(`select * from public.admin_add_moderator('MOD1@example.com', 'Mod One')`);
  const b = await one(`select * from public.admin_add_moderator('mod2@example.com', 'Mod Two')`);
  assert(a.id === MOD1 && a.is_active && a.email === 'mod1@example.com', JSON.stringify(a));
  assert(b.id === MOD2, JSON.stringify(b));
});
await test('unknown email and administrators are refused', async () => {
  await admin();
  await rejects(`select public.admin_add_moderator('nobody@example.com', 'X')`, [], /Invite the moderator first/);
  await rejects(`select public.admin_add_moderator('admin@example.com', 'X')`, [], /Administrators cannot be moderators/);
});
await test('app_role() reports admin / moderator / null', async () => {
  await admin();
  assert((await one(`select public.app_role() r`)).r === 'admin', 'admin');
  await mod1();
  assert((await one(`select public.app_role() r`)).r === 'moderator', 'moderator');
  await as('authenticated', USER);
  assert((await one(`select public.app_role() r`)).r === null, 'user');
});

// ── Lockdown of new tables ─────────────────────────────────────────
console.log('\nPrivileges on new tables');
const NEW_TABLES = ['moderators', 'lead_assignments', 'lead_clients', 'project_briefs', 'communication_logs', 'lead_notes', 'internal_notifications', 'lead_activity_logs'];
await test('anonymous visitors cannot read any new table', async () => {
  for (const t of NEW_TABLES) {
    await as('anon');
    await rejects(`select * from public.${t}`, [], /permission denied/);
  }
});
await test('ordinary signed-in users see nothing in new tables', async () => {
  for (const t of NEW_TABLES) {
    await as('authenticated', USER);
    const r = await rows(`select * from public.${t}`);
    assert(r.length === 0, `${t}: ${r.length} rows`);
  }
});

// ── Assignment ─────────────────────────────────────────────────────
console.log('\nAssignment');
let a1; // m1 → MOD1
await test('moderators cannot assign leads', async () => {
  await mod1();
  await rejects(`select public.assign_lead($1, $2, null)`, [msg.m1, MOD1], /administrators/i);
});
await test('admin assigns a message to a moderator with a private note', async () => {
  await admin();
  a1 = await one(`select * from public.assign_lead($1, $2, 'Warm lead, reply quickly')`, [msg.m1, MOD1]);
  assert(a1.status === 'new_assignment' && a1.moderator_id === MOD1 && a1.admin_note === 'Warm lead, reply quickly', JSON.stringify(a1));
  await admin();
  await one(`select (public.assign_lead($1, $2, null)).id`, [msg.m3, MOD2]);
  await one(`select (public.assign_lead($1, $2, null)).id`, [msg.m4, MOD1]);
});
await test('a message cannot have two current assignments', async () => {
  await admin();
  await rejects(`select public.assign_lead($1, $2, null)`, [msg.m1, MOD2], /already assigned/);
});
await test('the original message is preserved, not copied', async () => {
  const r = await su(`select count(*)::int n from public.contact_messages where email = 'm1@client.test'`);
  assert(r[0].n === 1, `copies: ${r[0].n}`);
});
await test('moderator sees own assignment and its original message only', async () => {
  await mod1();
  const as1 = await rows(`select message_id from public.lead_assignments order by assigned_at`);
  assert(as1.length === 2 && as1.every((r) => [msg.m1, msg.m4].includes(r.message_id)), JSON.stringify(as1));
  const msgs = await rows(`select id, full_name, email from public.contact_messages`);
  assert(msgs.length === 2 && msgs.every((r) => [msg.m1, msg.m4].includes(r.id)), JSON.stringify(msgs));
});
await test('moderator cannot see unassigned messages or another moderator’s lead', async () => {
  await mod1();
  assert((await rows(`select id from public.contact_messages where id in ($1, $2)`, [msg.m2, msg.m3])).length === 0, 'leak');
  assert((await rows(`select id from public.lead_assignments where message_id = $1`, [msg.m3])).length === 0, 'assignment leak');
  await mod2();
  assert((await rows(`select id from public.contact_messages where id = $1`, [msg.m1])).length === 0, 'mod2 sees m1');
});
await test('moderator cannot delete or modify original contact messages', async () => {
  await mod1();
  const d = await rows(`delete from public.contact_messages where id = $1 returning id`, [msg.m1]);
  const u = await rows(`update public.contact_messages set message = 'tampered message here...' where id = $1 returning id`, [msg.m1]);
  assert(d.length === 0 && u.length === 0, 'modified');
});
await test('moderator cannot write assignments directly', async () => {
  await mod1();
  await rejects(`update public.lead_assignments set status = 'approved' where id = $1`, [a1.id], /permission denied/);
  await rejects(`insert into public.lead_assignments (message_id, moderator_id) values ($1, $2)`, [msg.m2, MOD1], /permission denied/);
  await rejects(`delete from public.lead_assignments where id = $1`, [a1.id], /permission denied/);
});
await test('new assignment notifies the moderator', async () => {
  await mod1();
  const n = await rows(`select type, title from public.internal_notifications where type = 'assignment_new'`);
  assert(n.length === 2 && n.some((x) => x.title.includes('Client m1')), JSON.stringify(n));
});

// ── Client info, brief drafts, communication ───────────────────────
console.log('\nClient workspace');
await test('moderator saves client info and a partial brief draft', async () => {
  await mod1();
  await db.query(`insert into public.lead_clients (message_id, company, industry) values ($1, 'Acme', 'Tourism')`, [msg.m1]);
  await db.query(`insert into public.project_briefs (message_id, description) values ($1, 'Booking site for 4 apartments')`, [msg.m1]);
  await db.query(`update public.project_briefs set project_type = 'booking_website', priority = 'high', deadline = '2027-03-01' where message_id = $1`, [msg.m1]);
  const b = await one(`select project_type, description, priority, updated_by from public.project_briefs where message_id = $1`, [msg.m1]);
  assert(b.project_type === 'booking_website' && b.updated_by === MOD1, JSON.stringify(b));
});
await test('moderator cannot set submission/approval stamps directly', async () => {
  await mod1();
  await rejects(`update public.project_briefs set approved_at = now() where message_id = $1`, [msg.m1], /permission denied/);
  await rejects(`insert into public.project_briefs (message_id, submitted_at) values ($1, now())`, [msg.m4], /permission denied/);
});
await test('moderator cannot create data for leads that are not theirs', async () => {
  await mod1();
  await rejects(`insert into public.project_briefs (message_id, description) values ($1, 'x')`, [msg.m3], /row-level security/);
  await rejects(`insert into public.lead_clients (message_id) values ($1)`, [msg.m2], /row-level security/);
  await rejects(`insert into public.communication_logs (message_id, channel, direction, summary) values ($1, 'email', 'outgoing', 'x')`, [msg.m3], /row-level security/);
});
await test('first outgoing contact moves the lead to "contacted"; history is chronological', async () => {
  await mod1();
  await db.query(`insert into public.communication_logs (message_id, channel, direction, summary, occurred_at, author_role)
                  values ($1, 'email', 'outgoing', 'Sent intro email', now() - interval '2 hours', 'admin')`, [msg.m1]);
  await db.query(`insert into public.communication_logs (message_id, channel, direction, summary, occurred_at)
                  values ($1, 'instagram', 'incoming', 'Client replied on Instagram', now() - interval '1 hour')`, [msg.m1]);
  const c = await rows(`select channel, direction, author_id, author_role from public.communication_logs where message_id = $1 order by occurred_at`, [msg.m1]);
  assert(c.length === 2 && c[0].direction === 'outgoing' && c[1].direction === 'incoming', JSON.stringify(c));
  assert(c.every((x) => x.author_id === MOD1 && x.author_role === 'moderator'), 'author spoofable');
  assert((await current(msg.m1)).status === 'contacted', 'not auto-advanced');
});
await test('communication records are append-only for moderators and private', async () => {
  await mod1();
  await rejects(`update public.communication_logs set summary = 'edited'`, [], /permission denied/);
  const d = await rows(`delete from public.communication_logs returning id`);
  assert(d.length === 0, 'moderator deleted records');
  await mod2();
  assert((await rows(`select * from public.communication_logs`)).length === 0, 'mod2 reads mod1 records');
  await as('authenticated', USER);
  assert((await rows(`select * from public.communication_logs`)).length === 0, 'user reads records');
});
await test('other moderators cannot read client info, briefs or notes', async () => {
  await mod2();
  for (const t of ['lead_clients', 'project_briefs', 'lead_notes']) {
    assert((await rows(`select * from public.${t} where message_id = $1`, [msg.m1])).length === 0, t);
  }
});

// ── Status transitions ─────────────────────────────────────────────
console.log('\nStatus transitions');
await test('moderator can move between working statuses', async () => {
  await mod1();
  const r = await one(`select (public.moderator_set_status($1, 'in_discussion')).status s`, [a1.id]);
  assert(r.s === 'in_discussion', r.s);
  await one(`select (public.moderator_set_status($1, 'brief_in_progress')).status`, [a1.id]);
});
await test('moderator cannot jump to review/approval statuses', async () => {
  await mod1();
  for (const s of ['brief_completed', 'admin_review', 'approved', 'archived', 'changes_requested']) {
    await rejects(`select public.moderator_set_status($1, $2)`, [a1.id, s], /cannot change/);
  }
});
await test('moderator cannot change another moderator’s status', async () => {
  const a3 = await current(msg.m3);
  await mod1();
  await rejects(`select public.moderator_set_status($1, 'contacted')`, [a3.id], /own assignments/);
});

// ── Brief submission & review ──────────────────────────────────────
console.log('\nBrief submission & review');
await test('cannot submit without a saved brief', async () => {
  const a4 = await current(msg.m4);
  await mod1();
  await rejects(`select public.submit_brief($1)`, [a4.id], /Save the project brief/);
});
await test('moderator submits; admins are notified; brief is locked', async () => {
  await mod1();
  const r = await one(`select (public.submit_brief($1)).status s`, [a1.id]);
  assert(r.s === 'brief_completed', r.s);
  const b = await su(`select submitted_at, submitted_by from public.project_briefs where message_id = $1`, [msg.m1]);
  assert(b[0].submitted_at && b[0].submitted_by === MOD1, JSON.stringify(b));
  await admin();
  const n = await rows(`select type from public.internal_notifications where type = 'brief_submitted'`);
  assert(n.length === 1, JSON.stringify(n));
  await mod1();
  const u = await rows(`update public.project_briefs set description = 'late edit' where message_id = $1 returning 1`, [msg.m1]);
  assert(u.length === 0, 'edited a submitted brief');
});
await test('only admins can review; request changes needs a note', async () => {
  await mod1();
  await rejects(`select public.review_brief($1, 'approve', null)`, [a1.id], /administrators/i);
  await admin();
  await one(`select (public.review_brief($1, 'start_review', null)).status`, [a1.id]);
  assert((await current(msg.m1)).status === 'admin_review', 'not in review');
  await rejects(`select public.review_brief($1, 'request_changes', '  ')`, [a1.id], /Describe what/);
});
await test('admin requests changes: lead returns to moderator with one notification', async () => {
  await admin();
  await one(`select (public.review_brief($1, 'request_changes', 'Please confirm the budget range')).status`, [a1.id]);
  assert((await current(msg.m1)).status === 'changes_requested', 'status');
  await mod1();
  const n = await rows(`select type from public.internal_notifications where message_id = $1 and type in ('changes_requested', 'admin_note')`, [msg.m1]);
  assert(n.length === 1 && n[0].type === 'changes_requested', JSON.stringify(n));
  const notes = await rows(`select body, author_role from public.lead_notes where message_id = $1`, [msg.m1]);
  assert(notes.some((x) => x.body.includes('budget') && x.author_role === 'admin'), JSON.stringify(notes));
  const u = await rows(`update public.project_briefs set budget = '€3,000' where message_id = $1 returning 1`, [msg.m1]);
  assert(u.length === 1, 'moderator could not update after changes requested');
});
await test('resubmit and approve; moderator archives', async () => {
  await mod1();
  await one(`select (public.submit_brief($1)).status`, [a1.id]);
  await admin();
  const r = await one(`select (public.review_brief($1, 'approve', 'Great work')).status s`, [a1.id]);
  assert(r.s === 'approved', r.s);
  const b = await su(`select approved_at, approved_by from public.project_briefs where message_id = $1`, [msg.m1]);
  assert(b[0].approved_at && b[0].approved_by === ADMIN, JSON.stringify(b));
  await mod1();
  const a = await one(`select * from public.moderator_set_status($1, 'archived')`, [a1.id]);
  assert(a.status === 'archived' && a.archived_at, JSON.stringify(a));
  // Archived lead stays readable (archive view) with all its data.
  const data = await one(`select (select count(*) from public.communication_logs where message_id = $1)::int c,
                                 (select count(*) from public.project_briefs where message_id = $1)::int b`, [msg.m1]);
  assert(data.c === 2 && data.b === 1, JSON.stringify(data));
});
await test('admin can override any status', async () => {
  await admin();
  const r = await one(`select (public.admin_set_status($1, 'in_discussion', 'Reopened')).status s`, [a1.id]);
  assert(r.s === 'in_discussion', r.s);
  await one(`select (public.admin_set_status($1, 'archived', null)).status`, [a1.id]);
});

// ── Notes ──────────────────────────────────────────────────────────
console.log('\nNotes & help requests');
await test('moderator help request notifies admins; admin-only notes stay private', async () => {
  await mod1();
  await db.query(`insert into public.lead_notes (message_id, kind, body, author_role) values ($1, 'help_request', 'Client asks about hosting costs', 'moderator')`, [msg.m4]);
  await rejects(`insert into public.lead_notes (message_id, visibility, body, author_role) values ($1, 'admin_only', 'x', 'moderator')`, [msg.m4], /row-level security|check constraint/);
  await admin();
  assert((await rows(`select 1 from public.internal_notifications where type = 'help_requested'`)).length === 1, 'no admin notification');
  await db.query(`insert into public.lead_notes (message_id, visibility, body, author_role) values ($1, 'admin_only', 'Internal pricing thoughts', 'admin')`, [msg.m4]);
  await db.query(`insert into public.lead_notes (message_id, visibility, body, author_role) values ($1, 'shared', 'Hosting is included', 'admin')`, [msg.m4]);
  await mod1();
  const seen = await rows(`select body from public.lead_notes where message_id = $1`, [msg.m4]);
  assert(!seen.some((x) => x.body.includes('Internal pricing')), 'admin-only note leaked');
  assert(seen.some((x) => x.body.includes('Hosting is included')), 'shared note missing');
  assert((await rows(`select 1 from public.internal_notifications where type = 'admin_note' and message_id = $1`, [msg.m4])).length === 1, 'admin_note notification');
});

// ── Transfer & return ──────────────────────────────────────────────
console.log('\nTransfer & return');
await test('admin transfers a lead: data moves with it, previous moderator loses access', async () => {
  await mod1();
  await db.query(`insert into public.project_briefs (message_id, description) values ($1, 'Brief written by mod1')`, [msg.m4]);
  const a4 = await current(msg.m4);
  await admin();
  const t = await one(`select * from public.transfer_lead($1, $2, 'Mod2 has capacity')`, [a4.id, MOD2]);
  assert(t.moderator_id === MOD2 && t.id !== a4.id, JSON.stringify(t));
  await mod1();
  assert((await rows(`select 1 from public.contact_messages where id = $1`, [msg.m4])).length === 0, 'mod1 still sees message');
  assert((await rows(`select 1 from public.project_briefs where message_id = $1`, [msg.m4])).length === 0, 'mod1 still sees brief');
  assert((await rows(`select 1 from public.internal_notifications where type = 'assignment_transferred'`)).length === 1, 'mod1 not notified');
  await mod2();
  const b = await one(`select description from public.project_briefs where message_id = $1`, [msg.m4]);
  assert(b?.description === 'Brief written by mod1', 'brief did not carry over');
  await admin();
  const hist = await rows(`select release_reason from public.lead_assignments where message_id = $1 order by assigned_at`, [msg.m4]);
  assert(hist.length === 2 && hist[0].release_reason === 'transferred' && hist[1].release_reason === null, JSON.stringify(hist));
});
await test('admin retrieves a lead back to the unassigned inbox', async () => {
  const a3 = await current(msg.m3);
  await admin();
  await db.query(`select public.return_lead($1, 'Handling personally')`, [a3.id]);
  assert(!(await current(msg.m3)), 'still assigned');
  await mod2();
  assert((await rows(`select 1 from public.contact_messages where id = $1`, [msg.m3])).length === 0, 'mod2 still sees');
  await admin();
  assert((await rows(`select 1 from public.lead_assignments where message_id = $1`, [msg.m3])).length === 1, 'history lost');
  // Can be assigned again afterwards.
  await one(`select (public.assign_lead($1, $2, null)).id`, [msg.m3, MOD1]);
});
await test('moderator can return a lead with a reason; admins are notified', async () => {
  const a3 = await current(msg.m3);
  await mod1();
  await rejects(`select public.moderator_return_lead($1, ' ')`, [a3.id], /explain why/);
  await db.query(`select public.moderator_return_lead($1, 'Client wants a mobile app, not a website')`, [a3.id]);
  await admin();
  assert((await rows(`select 1 from public.internal_notifications where type = 'assignment_returned'`)).length === 1, 'admin not notified');
  assert(!(await current(msg.m3)), 'still assigned');
});
await test('admin cannot delete a message that has assignment history', async () => {
  await admin();
  await rejects(`delete from public.contact_messages where id = $1`, [msg.m3], /foreign key/);
});

// ── Roles & self-promotion ─────────────────────────────────────────
console.log('\nRoles');
await test('moderator cannot promote themselves or change activation', async () => {
  await mod1();
  assert((await rows(`update public.profiles set is_admin = true where id = $1 returning 1`, [MOD1])).length === 0, 'profiles update');
  await rejects(`insert into public.profiles (id, is_admin) values ($1, true)`, [MOD1]);
  await rejects(`update public.moderators set is_active = false where id = $1`, [MOD2], /permission denied/);
  await rejects(`select public.admin_set_moderator_active($1, true)`, [MOD1], /administrators/i);
  assert((await one(`select public.is_admin() a`)).a === false, 'became admin');
});
await test('moderator can rename only themselves', async () => {
  await mod1();
  assert((await rows(`update public.moderators set full_name = 'Mod One Renamed' where id = $1 returning 1`, [MOD1])).length === 1, 'self rename');
  assert((await rows(`update public.moderators set full_name = 'Hacked' where id = $1 returning 1`, [MOD2])).length === 0, 'renamed other');
  const seen = await rows(`select id from public.moderators`);
  assert(seen.length === 1 && seen[0].id === MOD1, 'sees other moderators');
});
await test('moderator cannot call admin workflow functions', async () => {
  const a4 = await current(msg.m4);
  await mod2();
  for (const [sql, params] of [
    [`select public.transfer_lead($1, $2, null)`, [a4.id, MOD1]],
    [`select public.return_lead($1, null)`, [a4.id]],
    [`select public.admin_set_status($1, 'approved', null)`, [a4.id]],
    [`select public.review_brief($1, 'approve', null)`, [a4.id]],
  ]) {
    await rejects(sql, params, /administrators/i);
  }
});

// ── Notifications ──────────────────────────────────────────────────
console.log('\nNotifications');
await test('users read and mark only their own notifications', async () => {
  await mod1();
  const own = await rows(`select id, recipient_id from public.internal_notifications`);
  assert(own.length > 0 && own.every((n) => n.recipient_id === MOD1), 'foreign notifications visible');
  const u = await rows(`update public.internal_notifications set read_at = now() where id = $1 returning 1`, [own[0].id]);
  assert(u.length === 1, 'cannot mark read');
  await rejects(`update public.internal_notifications set title = 'x' where id = $1`, [own[0].id], /permission denied/);
  await rejects(`insert into public.internal_notifications (recipient_id, type, title) values ($1, 'admin_note', 'spoof')`, [ADMIN], /permission denied/);
  await mod2();
  const n2 = await rows(`update public.internal_notifications set read_at = now() where recipient_id = $1 returning 1`, [MOD1]);
  assert(n2.length === 0, 'marked another user’s notifications');
});

// ── Audit log ──────────────────────────────────────────────────────
console.log('\nActivity log');
await test('every workflow step is recorded with actor and role', async () => {
  const actions = (await su(`select action from public.lead_activity_logs`)).map((r) => r.action);
  for (const a of ['moderator_created', 'assignment_created', 'assignment_transferred', 'assignment_returned', 'client_contacted',
                   'client_response_recorded', 'client_info_updated', 'brief_created', 'brief_updated', 'brief_submitted',
                   'review_started', 'changes_requested', 'brief_approved', 'assignment_archived', 'status_changed',
                   'help_requested', 'note_added']) {
    assert(actions.includes(a), `missing ${a}`);
  }
  const roles = await su(`select distinct actor_role from public.lead_activity_logs`);
  assert(roles.some((r) => r.actor_role === 'admin') && roles.some((r) => r.actor_role === 'moderator'), JSON.stringify(roles));
});
await test('moderators cannot modify or delete audit records', async () => {
  await mod1();
  await rejects(`update public.lead_activity_logs set action = 'brief_approved'`, [], /permission denied/);
  await rejects(`delete from public.lead_activity_logs`, [], /permission denied/);
  await rejects(`insert into public.lead_activity_logs (actor_role, action) values ('admin', 'brief_approved')`, [], /permission denied/);
});
await test('moderators read only their own or their leads’ activity', async () => {
  await mod2();
  const r = await rows(`select actor_id, message_id from public.lead_activity_logs`);
  const allowed = new Set([msg.m4]);
  assert(r.every((x) => x.actor_id === MOD2 || allowed.has(x.message_id)), 'foreign activity visible');
});

// ── Deactivation ───────────────────────────────────────────────────
console.log('\nDeactivation');
await test('deactivated moderator loses all access; admins are alerted about open leads', async () => {
  await admin();
  await db.query(`select public.admin_set_moderator_active($1, false)`, [MOD2]);
  assert((await rows(`select 1 from public.internal_notifications where type = 'moderator_attention'`)).length === 1, 'no alert');
  await mod2();
  assert((await one(`select public.app_role() r`)).r === null, 'still a moderator');
  for (const t of ['lead_assignments', 'contact_messages', 'project_briefs', 'communication_logs']) {
    assert((await rows(`select 1 from public.${t}`)).length === 0, `${t} still visible`);
  }
  await admin();
  await db.query(`select public.admin_set_moderator_active($1, true)`, [MOD2]);
  await mod2();
  assert((await rows(`select 1 from public.contact_messages`)).length === 1, 'reactivation did not restore access');
});

// ── Existing behaviour untouched ───────────────────────────────────
console.log('\nRegression');
await test('public contact form still works and new inquiries are unassigned', async () => {
  await as('anon');
  const r = await one(`select public.submit_contact_message('New Person', 'new@client.test', 'Other', 'A brand new inquiry for the studio.', null, null, 'email', null, 9000, null) r`);
  assert(r.r.ok === true, JSON.stringify(r));
  await mod1();
  assert((await rows(`select 1 from public.contact_messages where email = 'new@client.test'`)).length === 0, 'moderator sees new inquiry');
  await admin();
  assert((await rows(`select 1 from public.contact_messages where email = 'new@client.test'`)).length === 1, 'admin cannot see it');
});
await test('moderators have no access to admin-only content', async () => {
  await mod1();
  assert((await rows(`select * from public.admin_activity_logs`)).length === 0, 'admin activity visible');
  await rejects(`insert into public.projects (title, slug, short_description) values ('x', 'x-mod', 'x')`, [], /row-level security/);
  assert((await rows(`update public.site_settings set website_name = 'x' returning 1`)).length === 0, 'settings');
  await rejects(`insert into storage.objects (bucket_id, name) values ('media', 'mod.png')`, [], /row-level security/);
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) {
  console.log('Failed:\n - ' + failures.join('\n - '));
  process.exit(1);
}
