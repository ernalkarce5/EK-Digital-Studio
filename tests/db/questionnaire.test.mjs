// Client Project Questionnaire: database security tests.
// Runs every migration in PGlite (real PostgreSQL in WASM) with pgcrypto in the
// "extensions" schema, like Supabase, and checks tokens, authorization, RLS,
// validation, immutability, notifications, rate limits, cleanup and privileges.
//
//   npm run test:db
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const migrationsDir = join(root, 'supabase', 'migrations');
const MIGRATION = '20261128000001_client_questionnaires.sql';

const STUB = (withPgcrypto) => `
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
  create schema extensions;
  ${withPgcrypto ? 'create extension pgcrypto with schema extensions;' : ''}
  create schema storage;
  create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
  create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text references storage.buckets(id), name text, owner uuid);
  alter table storage.objects enable row level security;
  grant usage on schema storage to anon, authenticated;
  grant all on storage.objects to anon, authenticated;
  -- Worst case for privileges: Supabase-style default grants on new tables AND functions.
  alter default privileges in schema public grant all on tables to anon, authenticated;
  alter default privileges in schema public grant execute on functions to anon, authenticated;
`;

const ADMIN = '11111111-1111-1111-1111-111111111111';
const USER = '22222222-2222-2222-2222-222222222222';
const MOD1 = '33333333-3333-3333-3333-333333333333';
const MOD2 = '44444444-4444-4444-4444-444444444444';

const db = new PGlite({ extensions: { pgcrypto } });
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
const rows = async (sql, params = []) => (await db.query(sql, params)).rows;
const one = async (sql, params = []) => (await rows(sql, params))[0];
async function su(sql, params = []) {
  await db.exec('reset role');
  return rows(sql, params);
}
async function rejects(sql, params = [], pattern) {
  try {
    await db.query(sql, params);
  } catch (err) {
    if (pattern && !pattern.test(err.message)) throw new Error(`wrong error: ${err.message}`);
    return err.message;
  }
  throw new Error(`expected failure: ${sql}`);
}
/** Request through a Cloudflare-like gateway (cf-connecting-ip set by the gateway). */
async function as(uid = null, ip = '203.0.113.10') {
  await db.exec('reset role');
  await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [uid ?? '']);
  await db.query(`select set_config('request.headers', $1, false)`, [
    JSON.stringify({ 'cf-connecting-ip': ip, 'x-forwarded-for': `100.64.0.1, ${ip}`, 'user-agent': 'Mozilla/5.0 Test' }),
  ]);
  await db.exec(`set role ${uid ? 'authenticated' : 'anon'}`);
}
const admin = () => as(ADMIN);
const mod1 = () => as(MOD1);
const mod2 = () => as(MOD2);
const client = (ip) => as(null, ip);
const sha = (t) => createHash('sha256').update(t, 'utf8').digest('hex');

const generate = async (messageId) => (await one('select public.questionnaire_generate_link($1) r', [messageId])).r;
const open = async (token) => (await one('select public.questionnaire_open($1) r', [token])).r;
const save = async (token, answers) => (await one('select public.questionnaire_save_draft($1, $2) r', [token, JSON.stringify(answers)])).r;
const submit = async (token, answers, elapsed = 60000, website = null) =>
  (await one('select public.questionnaire_submit($1, $2, $3, $4) r', [token, JSON.stringify(answers), elapsed, website])).r;
const qrow = async (messageId) => (await su('select * from public.client_questionnaires where message_id = $1', [messageId]))[0];
const leadStatus = async (messageId) =>
  (await su('select status from public.lead_assignments where message_id = $1 and released_at is null', [messageId]))[0]?.status;
const clearLimits = () => su('delete from public.analytics_rate_limits');

const VALID = {
  website_type: 'booking_website',
  project_name: 'Harbor Apartments',
  project_description: 'Four apartments in Mostar need online booking with a calendar.',
  features: ['booking', 'payments', 'multilingual'],
  budget_range: '2500_5000',
  budget_currency: 'EUR',
  urgency: 'soon',
};

// ── Migration pre-check: aborts without pgcrypto ───────────────────
console.log('\nMigration pre-check');
await test('without pgcrypto the migration aborts with a clear error and creates nothing', async () => {
  const bare = new PGlite();
  await bare.exec(STUB(false));
  for (const f of readdirSync(migrationsDir).filter((f) => f.endsWith('.sql') && f !== MIGRATION).sort()) {
    await bare.exec(readFileSync(join(migrationsDir, f), 'utf8'));
  }
  let message = '';
  try {
    await bare.exec(readFileSync(join(migrationsDir, MIGRATION), 'utf8'));
  } catch (err) {
    message = err.message;
  }
  try {
    await bare.exec('rollback');
  } catch {
    /* already rolled back */
  }
  assert(/require pgcrypto/i.test(message) && /Nothing was changed/.test(message), 'unexpected: ' + message);
  const t = (await bare.query(`select to_regclass('public.client_questionnaires') as t, to_regprocedure('public.questionnaire_open(text)') as f`)).rows[0];
  assert(t.t === null && t.f === null, 'objects were created: ' + JSON.stringify(t));
  const c = (await bare.query(`select pg_get_constraintdef(oid) d from pg_constraint where conname = 'lead_activity_logs_action_check'`)).rows[0].d;
  assert(!c.includes('questionnaire'), 'existing constraint was changed');
  await bare.close();
});

// ── Setup ──────────────────────────────────────────────────────────
await db.exec(STUB(true));
for (const f of readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort()) {
  try {
    await db.exec(readFileSync(join(migrationsDir, f), 'utf8'));
  } catch (err) {
    console.log(`  ✗ ${f}: ${err.message}`);
    process.exit(1);
  }
}
await db.exec(`
  insert into auth.users (id, email) values
    ('${ADMIN}', 'admin@example.com'), ('${USER}', 'user@example.com'), ('${MOD1}', 'mod1@example.com'), ('${MOD2}', 'mod2@example.com');
  insert into public.profiles (id, is_admin, is_public, full_name) values ('${ADMIN}', true, true, 'Admin');
  insert into public.moderators (id, full_name, email) values ('${MOD1}', 'Mila', 'mod1@example.com'), ('${MOD2}', 'Noah', 'mod2@example.com');
`);
const msg = {};
for (const key of ['a', 'b', 'c', 'd', 'e', 'f', 'g']) {
  msg[key] = (await one(
    `insert into public.contact_messages (full_name, email, project_type, message) values ($1, $2, 'Website Design', 'Original inquiry about a website project.') returning id`,
    [`Lana ${key.toUpperCase()} Client`, `${key}@client.test`],
  )).id;
}
await admin();
for (const [key, mod] of [['a', MOD1], ['b', MOD1], ['c', MOD2], ['d', MOD1], ['e', MOD1], ['f', MOD1]]) {
  await db.query(`select * from public.assign_lead($1, $2, null)`, [msg[key], mod]);
}
// msg.g stays unassigned.

// ── Tokens ─────────────────────────────────────────────────────────
console.log('\nTokens');
let tokA;
await test('the assigned moderator generates a 256-bit token; only its sha256 is stored', async () => {
  await mod1();
  const r = await generate(msg.a);
  tokA = r.token;
  assert(/^[A-Za-z0-9_-]{43}$/.test(tokA), 'format: ' + tokA);
  assert(Buffer.from(tokA, 'base64url').length === 32, 'not 32 bytes');
  assert(r.resent === false && r.status === 'not_sent', JSON.stringify(r));
  const row = await qrow(msg.a);
  assert(row.token_hash === sha(tokA), 'stored value is not sha256(token)');
  const everything = JSON.stringify(await su('select * from public.client_questionnaires')) +
    JSON.stringify(await su('select * from public.lead_activity_logs')) + JSON.stringify(await su('select * from public.internal_notifications'));
  assert(!everything.includes(tokA), 'raw token stored somewhere');
  const exp = new Date(row.token_expires_at).getTime() - Date.now();
  assert(exp > 29.9 * 864e5 && exp < 30.1 * 864e5, 'expiry not 30 days');
});
await test('tokens are unique across questionnaires and generations', async () => {
  await mod1();
  const seen = new Set([tokA]);
  for (const key of ['b', 'd', 'e']) seen.add((await generate(msg[key])).token);
  assert(seen.size === 4, 'duplicate tokens');
});
await test('resend issues a new token, revokes the old one, and keeps the draft and status', async () => {
  await client('198.51.100.1');
  assert((await save(tokA, { project_name: 'Draft name' })).ok, 'save');
  const before = await qrow(msg.a);
  await mod1();
  const r = await generate(msg.a);
  assert(r.resent === true && r.token !== tokA && r.status === 'in_progress', JSON.stringify(r));
  await client('198.51.100.1');
  assert((await open(tokA)).error === 'unavailable', 'old token still works');
  const o = await open(r.token);
  assert(o.ok && o.draft.project_name === 'Draft name', JSON.stringify(o));
  const after = await qrow(msg.a);
  assert(after.status === before.status && after.first_opened_at, 'status or history changed');
  assert((await su(`select 1 from public.lead_activity_logs where message_id = $1 and action = 'questionnaire_link_resent'`, [msg.a])).length === 1, 'resend not logged');
  tokA = r.token;
});

// ── Authorization ──────────────────────────────────────────────────
console.log('\nAuthorization');
await test('only the moderator currently assigned to the lead can manage its questionnaire', async () => {
  await mod2();
  for (const sql of [
    'select public.questionnaire_generate_link($1)',
    "select public.questionnaire_mark_sent($1, 'email')",
    'select public.questionnaire_revoke($1)',
    'select public.questionnaire_mark_reviewed($1)',
    'select public.questionnaire_record_applied($1)',
  ]) await rejects(sql, [msg.a], /assigned to you/);
  await mod2();
  await rejects('select public.questionnaire_generate_link($1)', [msg.g], /assigned to you/); // unassigned lead
});
await test('admins can read questionnaire rows but cannot modify or manage them', async () => {
  await admin();
  const r = await rows('select id, status, answers from public.client_questionnaires where message_id = $1', [msg.a]);
  assert(r.length === 1, 'admin cannot read');
  for (const sql of [
    'select public.questionnaire_generate_link($1)',
    "select public.questionnaire_mark_sent($1, 'email')",
    'select public.questionnaire_revoke($1)',
    'select public.questionnaire_mark_reviewed($1)',
    'select public.questionnaire_record_applied($1)',
  ]) await rejects(sql, [msg.a], /assigned to you/);
  await rejects(`update public.client_questionnaires set status = 'reviewed' where message_id = $1`, [msg.a], /permission denied/);
  await rejects(`delete from public.client_questionnaires`, [], /permission denied/);
  await rejects(`insert into public.client_questionnaires (message_id) values ($1)`, [msg.g], /permission denied/);
  await rejects('select token_hash from public.client_questionnaires', [], /permission denied/);
});
await test('other moderators, ordinary users and visitors cannot read questionnaires', async () => {
  await mod2();
  assert((await rows('select id from public.client_questionnaires where message_id = $1', [msg.a])).length === 0, 'mod2 reads mod1 lead');
  await as(USER);
  assert((await rows('select id from public.client_questionnaires')).length === 0, 'user reads');
  await client();
  await rejects('select id from public.client_questionnaires', [], /permission denied/);
  for (const sql of ['select public.questionnaire_generate_link($1)', 'select public.questionnaire_revoke($1)']) {
    await rejects(sql, [msg.a], /permission denied/);
  }
});
await test('the moderator reads their own questionnaire without the token hash', async () => {
  await mod1();
  const r = await rows('select id, status, draft_answers from public.client_questionnaires where message_id = $1', [msg.a]);
  assert(r.length === 1, 'moderator cannot read');
  await rejects('select * from public.client_questionnaires', [], /permission denied/);
});
await test('after a transfer the link keeps working and only the new moderator manages it', async () => {
  await mod1();
  const tokD = (await generate(msg.d)).token;
  await admin();
  const a = (await su('select id from public.lead_assignments where message_id = $1 and released_at is null', [msg.d]))[0];
  await admin();
  await db.query('select * from public.transfer_lead($1, $2, null)', [a.id, MOD2]);
  await client('198.51.100.2');
  assert((await open(tokD)).ok === true, 'link broken by transfer');
  await mod1();
  await rejects('select public.questionnaire_revoke($1)', [msg.d], /assigned to you/);
  await mod2();
  await db.query('select public.questionnaire_revoke($1)', [msg.d]);
  await client('198.51.100.2');
  assert((await open(tokD)).error === 'unavailable', 'revoked link works');
});

// ── Client access ──────────────────────────────────────────────────
console.log('\nClient access');
await test('a valid token opens only its own questionnaire with minimal data', async () => {
  await clearLimits();
  await client('198.51.100.3');
  const r = await open(tokA);
  assert(r.ok && r.status === 'open' && r.first_name === 'Lana', JSON.stringify(r));
  assert(JSON.stringify(Object.keys(r).sort()) === JSON.stringify(['draft', 'draft_saved_at', 'expires_at', 'first_name', 'ok', 'status']), 'extra keys: ' + Object.keys(r));
  const text = JSON.stringify(r);
  for (const leak of ['Original inquiry', '@client.test', 'Mila', MOD1, 'admin_note']) assert(!text.includes(leak), 'leaked ' + leak);
});
await test('unknown, malformed, expired, revoked and ineligible links get the same neutral answer', async () => {
  await clearLimits();
  await client('198.51.100.4');
  const random = Buffer.alloc(32, 7).toString('base64url');
  for (const t of [random, 'short', '', null, "x' or 1=1 --", tokA + 'x']) {
    const r = await open(t);
    assert(r.ok === false && r.error === 'unavailable', `${t}: ${JSON.stringify(r)}`);
  }
  // Expired
  await mod1();
  const tokE = (await generate(msg.e)).token;
  await su(`update public.client_questionnaires set token_expires_at = now() - interval '1 minute' where message_id = $1`, [msg.e]);
  await client('198.51.100.4');
  assert((await open(tokE)).error === 'unavailable', 'expired link works');
  assert((await save(tokE, { project_name: 'x' })).error === 'unavailable', 'expired save');
  // Ineligible: brief approved by admin (lead no longer editable)
  await mod1();
  const tokF = (await generate(msg.f)).token;
  await admin();
  const af = (await su('select id from public.lead_assignments where message_id = $1 and released_at is null', [msg.f]))[0];
  await admin();
  await db.query(`select * from public.admin_set_status($1, 'approved', null)`, [af.id]);
  await client('198.51.100.4');
  assert((await open(tokF)).error === 'unavailable', 'ineligible lead accepts input');
});
await test('clients cannot read lead data, notes, communication or briefs directly', async () => {
  await client();
  for (const t of ['contact_messages', 'lead_notes', 'communication_logs', 'project_briefs', 'lead_assignments', 'client_questionnaires']) {
    await rejects(`select * from public.${t}`, [], /permission denied/);
  }
});

// ── Validation ─────────────────────────────────────────────────────
console.log('\nValidation');
await test('drafts accept partial answers; unknown keys are dropped; text is sanitised', async () => {
  await clearLimits();
  await client('198.51.100.5');
  const r = await save(tokA, { project_name: '<b>Harbor</b>\u0007 Apartments', evil: 'x', __proto__x: 1, budget_range: 'not_decided', budget_currency: 'EUR' });
  assert(r.ok, JSON.stringify(r));
  const d = (await qrow(msg.a)).draft_answers;
  assert(d.project_name === 'Harbor Apartments', 'not sanitised: ' + d.project_name);
  assert(!('evil' in d) && !('__proto__x' in d), 'unknown keys kept');
  assert(d.budget_range === 'not_decided' && !('budget_currency' in d), 'currency kept with not decided');
});
await test('invalid options, lengths, links, dates and sizes are rejected with the field name', async () => {
  await client('198.51.100.6');
  const cases = [
    [{ website_type: 'casino' }, 'website_type'],
    [{ features: ['booking', 'mining'] }, 'features'],
    [{ budget_currency: 'GBP' }, 'budget_currency'],
    [{ project_name: 'x'.repeat(201) }, 'project_name'],
    [{ reference_links: ['javascript:alert(1)'] }, 'reference_links'],
    [{ reference_links: Array.from({ length: 11 }, (_, i) => `https://e.com/${i}`) }, 'reference_links'],
    [{ deadline: '2020-01-01' }, 'deadline'],
    [{ deadline: '2026-02-30' }, 'deadline'],
    [{ urgency: 5 }, 'urgency'],
    [{ project_description: 'x'.repeat(40000) }, 'answers'],
  ];
  for (const [input, field] of cases) {
    await clearLimits();
    const r = await save(tokA, input);
    assert(r.ok === false && r.error === 'invalid' && r.field === field, `${JSON.stringify(input).slice(0, 60)} → ${JSON.stringify(r)}`);
  }
  const good = await save(tokA, { reference_links: ['https://example.com/a', 'https://example.com/a', ' '], deadline: '2027-06-01' });
  assert(good.ok, JSON.stringify(good));
  const d = (await qrow(msg.a)).draft_answers;
  assert(d.reference_links.length === 1 && d.deadline === '2027-06-01', JSON.stringify(d));
});
await test('submit requires website type, a 20-character description and a currency for a budget range', async () => {
  await clearLimits();
  await client('198.51.100.7');
  let r = await submit(tokA, { project_description: 'Long enough description here.' });
  assert(r.error === 'invalid' && r.field === 'website_type', JSON.stringify(r));
  r = await submit(tokA, { website_type: 'other', project_description: 'Too short' });
  assert(r.error === 'invalid' && r.field === 'project_description', JSON.stringify(r));
  r = await submit(tokA, { ...VALID, budget_currency: undefined });
  assert(r.error === 'invalid' && r.field === 'budget_currency', JSON.stringify(r));
  assert((await qrow(msg.a)).submitted_at === null, 'invalid submission stored');
});

// ── Status, notifications, immutability ────────────────────────────
console.log('\nStatus, notifications and immutability');
let tokB;
await test('mark as sent: Not sent → Sent, outgoing communication recorded (existing auto-advance applies)', async () => {
  await mod1();
  tokB = (await generate(msg.b)).token;
  assert((await qrow(msg.b)).status === 'not_sent', 'initial');
  await rejects(`select public.questionnaire_mark_sent($1, 'carrier pigeon')`, [msg.b], /email or Instagram/);
  await mod1();
  await db.query(`select public.questionnaire_mark_sent($1, 'instagram')`, [msg.b]);
  const q = await qrow(msg.b);
  assert(q.status === 'sent' && q.sent_channel === 'instagram' && q.send_count === 1, JSON.stringify(q));
  const c = await su(`select * from public.communication_logs where message_id = $1`, [msg.b]);
  assert(c.length === 1 && c[0].channel === 'instagram' && c[0].direction === 'outgoing' && c[0].author_id === MOD1 && c[0].author_role === 'moderator', JSON.stringify(c));
  // Existing workflow: the first outgoing communication moves a new assignment to "contacted".
  assert((await leadStatus(msg.b)) === 'contacted', 'existing auto-advance not applied');
});
await test('first draft save → In progress (logged once); marking sent again keeps In progress', async () => {
  await clearLimits();
  await client('198.51.100.8');
  assert((await save(tokB, { project_name: 'One' })).ok, 'save 1');
  assert((await save(tokB, { project_name: 'Two' })).ok, 'save 2');
  assert((await qrow(msg.b)).status === 'in_progress', 'not in progress');
  const started = await su(`select * from public.lead_activity_logs where message_id = $1 and action = 'questionnaire_started'`, [msg.b]);
  assert(started.length === 1 && started[0].actor_role === 'system', JSON.stringify(started));
  await mod1();
  await db.query(`select public.questionnaire_mark_sent($1, 'email')`, [msg.b]);
  const q = await qrow(msg.b);
  assert(q.status === 'in_progress' && q.send_count === 2, JSON.stringify(q));
});
await test('submission: Submitted, notification to the moderator, activity logged, lead status unchanged', async () => {
  await clearLimits();
  const statusBefore = await leadStatus(msg.b);
  await client('198.51.100.9');
  const r = await submit(tokB, VALID);
  assert(r.ok && r.status === 'submitted', JSON.stringify(r));
  const q = await qrow(msg.b);
  assert(q.status === 'submitted' && q.submitted_at && q.draft_answers === null, JSON.stringify(q));
  assert(q.answers.website_type === 'booking_website' && q.answers.budget_currency === 'EUR', JSON.stringify(q.answers));
  assert((await leadStatus(msg.b)) === statusBefore, 'lead status changed by submission');
  const n = await su(`select * from public.internal_notifications where type = 'questionnaire_submitted' and message_id = $1`, [msg.b]);
  assert(n.length === 1 && n[0].recipient_id === MOD1, JSON.stringify(n));
  assert((await su(`select 1 from public.lead_activity_logs where message_id = $1 and action = 'questionnaire_submitted'`, [msg.b])).length === 1, 'not logged');
  const after = await open(tokB);
  assert(after.ok && after.status === 'submitted' && !('draft' in after), 'answers exposed after submit: ' + JSON.stringify(after));
});
await test('submitted answers cannot change: resubmit is idempotent, drafts and resends are refused', async () => {
  await clearLimits();
  const before = await qrow(msg.b);
  await client('198.51.100.9');
  const r = await submit(tokB, { ...VALID, project_name: 'Changed' });
  assert(r.ok && r.status === 'submitted', JSON.stringify(r));
  assert((await save(tokB, { project_name: 'Changed' })).error === 'submitted', 'draft after submit');
  assert(JSON.stringify((await qrow(msg.b)).answers) === JSON.stringify(before.answers), 'answers changed');
  await mod1();
  await rejects('select public.questionnaire_generate_link($1)', [msg.b], /already been submitted/);
  await mod1();
  await rejects(`select public.questionnaire_mark_sent($1, 'email')`, [msg.b], /already been submitted/);
});
await test('immutability is enforced at database level, even for the table owner', async () => {
  await rejects(`update public.client_questionnaires set answers = '{"x":1}' where message_id = $1`, [msg.b], /cannot be changed/);
  await rejects(`update public.client_questionnaires set submitted_at = now() where message_id = $1`, [msg.b], /cannot be changed/);
  await rejects(`update public.client_questionnaires set status = 'in_progress' where message_id = $1`, [msg.b], /Invalid questionnaire status/);
  await rejects(`update public.client_questionnaires set draft_answers = '{}' where message_id = $1`, [msg.b], /no draft/);
  await rejects(`update public.client_questionnaires set message_id = $2 where message_id = $1`, [msg.b, msg.g], /another lead/);
});
await test('Reviewed only by explicit action; applying to the brief does not change the status', async () => {
  await mod1();
  await rejects('select public.questionnaire_mark_reviewed($1)', [msg.e], /Only a submitted/);
  await mod1();
  await db.query('select public.questionnaire_record_applied($1)', [msg.b]);
  assert((await qrow(msg.b)).status === 'submitted', 'applying changed the status');
  await mod1();
  await db.query('select public.questionnaire_mark_reviewed($1)', [msg.b]);
  const q = await qrow(msg.b);
  assert(q.status === 'reviewed' && q.reviewed_by === MOD1 && q.reviewed_at, JSON.stringify(q));
  const actions = (await su(`select action from public.lead_activity_logs where message_id = $1 order by id`, [msg.b])).map((r) => r.action);
  for (const a of ['questionnaire_link_created', 'questionnaire_sent', 'questionnaire_started', 'questionnaire_submitted', 'questionnaire_applied_to_brief', 'questionnaire_reviewed']) {
    assert(actions.includes(a), 'missing activity ' + a);
  }
});
await test('with an inactive moderator, admins are notified instead', async () => {
  await clearLimits();
  await mod2();
  const tokC = (await generate(msg.c)).token;
  await su(`update public.moderators set is_active = false where id = $1`, [MOD2]);
  await client('198.51.100.10');
  assert((await submit(tokC, VALID)).ok, 'submit');
  const n = await su(`select recipient_id from public.internal_notifications where type = 'questionnaire_submitted' and message_id = $1`, [msg.c]);
  assert(n.length === 1 && n[0].recipient_id === ADMIN, JSON.stringify(n));
  await su(`update public.moderators set is_active = true where id = $1`, [MOD2]);
});

// ── Spam protection and rate limits ────────────────────────────────
console.log('\nSpam protection and rate limits');
await test('honeypot and too-fast submissions are acknowledged but not stored', async () => {
  await clearLimits();
  await mod1();
  const t = (await generate(msg.e)).token; // e: resend gives a fresh, valid link
  await client('198.51.100.11');
  assert((await submit(t, VALID, 60000, 'http://spam.example')).ok, 'honeypot');
  assert((await submit(t, VALID, 300)).ok, 'too fast');
  assert((await qrow(msg.e)).submitted_at === null, 'spam stored');
});
await test('unknown or forged links create no counters and never consume the global budget', async () => {
  await clearLimits();
  await client('198.51.100.13');
  for (let i = 0; i < 25; i++) {
    const forged = Buffer.alloc(32, i + 1).toString('base64url');
    assert((await open(forged)).error === 'unavailable', 'forged link accepted');
    assert((await save(forged, { project_name: 'x' })).error === 'unavailable', 'forged save');
    assert((await submit(forged, VALID)).error === 'unavailable', 'forged submit');
  }
  const n = (await su('select count(*)::int as n from public.analytics_rate_limits'))[0].n;
  assert(n === 0, 'forged links created counters: ' + n);
  // A full global budget blocks only after a valid link is found (and is reported as rate limiting).
  await su(`insert into public.analytics_rate_limits (key, window_start, hits)
            values ('q:g:open', date_bin(interval '1 hour', now(), timestamptz '2000-01-01 00:00:00+00'), 5000)`);
  await client('198.51.100.13');
  assert((await open(Buffer.alloc(32, 99).toString('base64url'))).error === 'unavailable', 'forged link must stay neutral');
  assert((await open(tokA)).error === 'rate_limited', 'global limit not applied to valid links');
  await clearLimits();
});
await test('per-token and global limits apply; per-network limits only with a verified IP source', async () => {
  await clearLimits();
  await client('198.51.100.12');
  await open(tokA);
  let keys = (await su('select key from public.analytics_rate_limits')).map((r) => r.key);
  assert(keys.some((k) => k.startsWith('q:t:open:')) && keys.includes('q:g:open'), 'missing keys: ' + keys);
  assert(!keys.some((k) => k.startsWith('q:n:')), 'network limit used without a verified IP');
  assert(!keys.join(' ').includes('198.51.100'), 'raw IP in keys');
  // Exhaust the per-token budget.
  await su(`update public.analytics_rate_limits set hits = 60 where key like 'q:t:open:%'`);
  await client('198.51.100.12');
  assert((await open(tokA)).error === 'rate_limited', 'per-token limit not applied');
  // Verified IP source → per-network keys appear (salted hashes, no raw IP).
  await clearLimits();
  await su(`update public.analytics_config set trusted_ip_header = 'cf-connecting-ip', verified_at = now()`);
  await client('198.51.100.12');
  await open(tokA);
  keys = (await su('select key from public.analytics_rate_limits')).map((r) => r.key);
  assert(keys.some((k) => /^q:n:open:[0-9a-f]{64}$/.test(k)), 'network limit missing: ' + keys);
  assert(!keys.join(' ').includes('198.51.100'), 'raw IP in keys');
  await su(`update public.analytics_rate_limits set hits = 120 where key like 'q:n:open:%'`);
  await client('198.51.100.99'); // same /24 network
  assert((await open(tokA)).error === 'rate_limited', 'network limit not applied');
  await su(`update public.analytics_config set trusted_ip_header = null, verified_at = null`);
  await clearLimits();
});

// ── Draft retention ────────────────────────────────────────────────
console.log('\nDraft retention');
await test('cleanup deletes only unsubmitted drafts 30+ days after expiry or revocation', async () => {
  const mk = async (name, set) => {
    const id = (await su(`insert into public.contact_messages (full_name, email, project_type, message) values ($1, $2, 'Other', 'An inquiry used for questionnaire tests.') returning id`, [name, `${name}@t.test`]))[0].id;
    await su(`insert into public.client_questionnaires (message_id, token_expires_at, draft_answers, status) values ($1, now() + interval '30 days', '{"project_name":"keep?"}', 'in_progress')`, [id]);
    if (set) await su(`update public.client_questionnaires set ${set} where message_id = $1`, [id]);
    return id;
  };
  const revokedOld = await mk('r1', `revoked_at = now() - interval '31 days'`);
  const expiredOld = await mk('r2', `token_expires_at = now() - interval '31 days'`);
  const expiredRecent = await mk('r3', `token_expires_at = now() - interval '10 days'`);
  const revokedRecent = await mk('r4', `revoked_at = now() - interval '5 days'`);
  const active = await mk('r5', null);
  const submittedOld = (await su(`insert into public.contact_messages (full_name, email, project_type, message) values ('r6', 'r6@t.test', 'Other', 'An inquiry used for questionnaire tests.') returning id`))[0].id;
  await su(`insert into public.client_questionnaires (message_id, token_expires_at, answers, submitted_at, status)
            values ($1, now() - interval '400 days', '{"website_type":"other"}', now() - interval '370 days', 'submitted')`, [submittedOld]);
  const n = (await su('select public.questionnaire_cleanup() n'))[0].n;
  assert(n === 2, 'purged ' + n);
  for (const id of [revokedOld, expiredOld]) {
    const q = await qrow(id);
    assert(q.draft_answers === null && q.draft_purged_at, 'not purged');
  }
  for (const id of [expiredRecent, revokedRecent, active]) assert((await qrow(id)).draft_answers !== null, 'purged too early');
  const s = await qrow(submittedOld);
  assert(s.answers.website_type === 'other' && s.submitted_at, 'submitted answers touched');
  await as(USER);
  await rejects('select public.questionnaire_cleanup()', [], /permission denied/);
});

// ── Privileges and constraints ─────────────────────────────────────
console.log('\nPrivileges and constraints');
await test('has_function_privilege: only the intended entry points are executable', async () => {
  const entry = {
    'questionnaire_open(text)': { anon: true, authenticated: true },
    'questionnaire_save_draft(text, jsonb)': { anon: true, authenticated: true },
    'questionnaire_submit(text, jsonb, integer, text)': { anon: true, authenticated: true },
    'questionnaire_generate_link(uuid)': { anon: false, authenticated: true },
    'questionnaire_mark_sent(uuid, text)': { anon: false, authenticated: true },
    'questionnaire_revoke(uuid)': { anon: false, authenticated: true },
    'questionnaire_mark_reviewed(uuid)': { anon: false, authenticated: true },
    'questionnaire_record_applied(uuid)': { anon: false, authenticated: true },
  };
  const all = (await su(`select p.oid::regprocedure::text as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname like 'questionnaire%'`)).map((r) => r.sig.replace(/^public\./, ''));
  assert(all.length === 23, 'functions: ' + all.length + ' ' + all.join(', '));
  for (const sig of all) {
    for (const role of ['anon', 'authenticated']) {
      const ok = (await su(`select has_function_privilege($1, $2, 'execute') ok`, [role, 'public.' + sig]))[0].ok;
      const expected = entry[Object.keys(entry).find((k) => k.replace(/\s/g, '') === sig)]?.[role] ?? false;
      assert(ok === expected, `${role} on ${sig}: ${ok}`);
    }
  }
});
await test('every SECURITY DEFINER questionnaire function pins an empty search_path', async () => {
  const fns = await su(`select p.proname, p.prosecdef, p.proconfig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname like 'questionnaire%'`);
  for (const f of fns) assert((f.proconfig ?? []).some((c) => /^search_path=(""|)$/.test(c)), `${f.proname}: ${f.proconfig}`);
  assert(fns.filter((f) => f.prosecdef).length === 13, 'definers: ' + fns.filter((f) => f.prosecdef).map((f) => f.proname));
});
await test('every existing activity action and notification type is still accepted', async () => {
  const oldActions = ['moderator_created', 'moderator_activated', 'moderator_deactivated', 'assignment_created', 'assignment_transferred',
    'assignment_returned', 'status_changed', 'client_contacted', 'client_response_recorded', 'client_info_updated', 'brief_created',
    'brief_updated', 'brief_submitted', 'review_started', 'changes_requested', 'brief_approved', 'assignment_archived', 'note_added', 'help_requested'];
  const newActions = ['questionnaire_link_created', 'questionnaire_link_resent', 'questionnaire_sent', 'questionnaire_revoked',
    'questionnaire_started', 'questionnaire_submitted', 'questionnaire_reviewed', 'questionnaire_applied_to_brief'];
  for (const a of [...oldActions, ...newActions]) await su(`insert into public.lead_activity_logs (actor_role, action) values ('system', $1)`, [a]);
  await rejects(`insert into public.lead_activity_logs (actor_role, action) values ('system', 'made_up')`, [], /check constraint/);
  const oldTypes = ['brief_submitted', 'help_requested', 'assignment_returned', 'assignment_status', 'moderator_attention', 'assignment_new',
    'changes_requested', 'assignment_transferred', 'admin_note', 'brief_approved'];
  for (const t of [...oldTypes, 'questionnaire_submitted']) {
    await su(`insert into public.internal_notifications (recipient_id, type, title) values ($1, $2, 'x')`, [ADMIN, t]);
  }
  await rejects(`insert into public.internal_notifications (recipient_id, type, title) values ($1, 'made_up', 'x')`, [ADMIN], /check constraint/);
});
await test('moderator function responses never contain token_hash (key or value) and only allow-listed fields', async () => {
  const SAFE = ['id', 'message_id', 'status', 'link_active', 'token_expires_at', 'link_generated_at', 'revoked_at', 'sent_at',
    'sent_channel', 'send_count', 'first_opened_at', 'last_client_activity_at', 'draft_saved_at', 'submitted_at', 'reviewed_at',
    'reviewed_by', 'updated_at'];
  const check = (label, r, hash, extra = []) => {
    const text = JSON.stringify(r);
    assert(!('token_hash' in r) && !text.includes('token_hash'), `${label}: token_hash key present`);
    assert(!text.includes(hash), `${label}: token hash value present`);
    for (const k of Object.keys(r)) assert(SAFE.includes(k) || extra.includes(k), `${label}: unexpected field ${k}`);
    for (const k of ['answers', 'draft_answers']) assert(!(k in r), `${label}: ${k} present`);
  };
  await clearLimits();
  await mod1();
  const gen = await generate(msg.e);
  const hashE = (await qrow(msg.e)).token_hash;
  assert(/^[0-9a-f]{64}$/.test(hashE), 'stored hash missing');
  check('generate_link', gen, hashE, ['token', 'expires_at', 'resent']);
  assert(gen.link_active === true && gen.status && gen.token_expires_at, 'generate_link lost fields: ' + JSON.stringify(gen));

  await mod1();
  const sent = (await one(`select public.questionnaire_mark_sent($1, 'email') r`, [msg.e])).r;
  check('mark_sent', sent, hashE);
  assert(sent.sent_channel === 'email' && sent.send_count >= 1 && sent.sent_at && sent.link_active === true, 'mark_sent lost fields: ' + JSON.stringify(sent));

  await mod1();
  const revoked = (await one('select public.questionnaire_revoke($1) r', [msg.e])).r;
  check('revoke', revoked, hashE);
  assert(revoked.revoked_at && revoked.link_active === false, 'revoke lost fields: ' + JSON.stringify(revoked));

  // msg.c was submitted earlier (moderator MOD2).
  const hashC = (await qrow(msg.c)).token_hash;
  await mod2();
  const reviewed = (await one('select public.questionnaire_mark_reviewed($1) r', [msg.c])).r;
  check('mark_reviewed', reviewed, hashC);
  assert(reviewed.status === 'reviewed' && reviewed.reviewed_by === MOD2 && reviewed.reviewed_at, 'mark_reviewed lost fields: ' + JSON.stringify(reviewed));

  // Behaviour preserved: activity logged for each action.
  const actions = (await su(`select action from public.lead_activity_logs where message_id in ($1, $2)`, [msg.e, msg.c])).map((r) => r.action);
  for (const a of ['questionnaire_link_resent', 'questionnaire_sent', 'questionnaire_revoked', 'questionnaire_reviewed']) {
    assert(actions.includes(a), 'missing activity ' + a);
  }
});
await test('the moderator still cannot SELECT token_hash directly (column privilege)', async () => {
  await mod1();
  await rejects('select token_hash from public.client_questionnaires where message_id = $1', [msg.a], /permission denied/);
  await rejects('select * from public.client_questionnaires where message_id = $1', [msg.a], /permission denied/);
  await rejects(`select (q).token_hash from (select q from public.client_questionnaires q) s`, [], /permission denied/);
  await mod1();
  const ok = await rows('select id, status from public.client_questionnaires where message_id = $1', [msg.a]);
  assert(ok.length === 1, 'allowed columns no longer readable');
  // The internal full-row lookup is not callable by any client role.
  await mod1();
  await rejects('select public.questionnaire_by_token($1)', ['x'.repeat(43)], /permission denied/);
  await rejects('select public.questionnaire_safe_summary(null::public.client_questionnaires)', [], /permission denied/);
});
await test('deleting an inquiry removes its questionnaire (no orphaned answers)', async () => {
  const id = (await su(`insert into public.contact_messages (full_name, email, project_type, message) values ('Del', 'del@t.test', 'Other', 'An inquiry used for questionnaire tests.') returning id`))[0].id;
  await su(`insert into public.client_questionnaires (message_id, answers, submitted_at, status) values ($1, '{"website_type":"other"}', now(), 'submitted')`, [id]);
  await su('delete from public.contact_messages where id = $1', [id]);
  assert((await su('select 1 from public.client_questionnaires where message_id = $1', [id])).length === 0, 'orphan');
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) {
  console.log('Failed:\n - ' + failures.join('\n - '));
  process.exit(1);
}
