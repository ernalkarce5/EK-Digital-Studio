// Database security test suite.
// Runs every migration in PGlite (Postgres compiled to WASM) on top of a
// minimal stub of Supabase's auth/storage schemas and roles, then checks
// Row Level Security and RPC behaviour as anon, a non-admin user and an admin.
//
//   npm run test:db
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
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
  -- Supabase installs pgcrypto in the "extensions" schema.
  create schema extensions;
  create extension pgcrypto with schema extensions;
  create schema storage;
  create table storage.buckets (
    id text primary key, name text, public boolean,
    file_size_limit bigint, allowed_mime_types text[]
  );
  create table storage.objects (
    id uuid primary key default gen_random_uuid(),
    bucket_id text references storage.buckets(id), name text, owner uuid
  );
  alter table storage.objects enable row level security;
  grant usage on schema storage to anon, authenticated;
  grant all on storage.objects to anon, authenticated;
  -- Supabase grants these by default; the migrations must work despite them.
  alter default privileges in schema public grant all on tables to anon, authenticated;
`;

const ADMIN = '11111111-1111-1111-1111-111111111111';
const USER = '22222222-2222-2222-2222-222222222222';

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

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

async function as(role, uid, headers) {
  await db.exec('reset role');
  await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [uid ?? '']);
  await db.query(`select set_config('request.headers', $1, false)`, [JSON.stringify(headers ?? {})]);
  await db.exec(`set role ${role}`);
}

async function rejects(sql, params = []) {
  try {
    await db.query(sql, params);
  } catch (err) {
    return err.message;
  }
  throw new Error(`expected failure: ${sql}`);
}

async function contact(overrides = {}, headers = { 'x-forwarded-for': '203.0.113.7' }) {
  await as('anon', null, headers);
  const args = {
    name: 'Jane Visitor', email: 'jane@example.com', type: 'Website Design',
    message: 'I would like a new website for my small business, please.',
    company: null, budget: null, preferred: 'email', website: null, elapsed: 8000, phone: null,
    ...overrides,
  };
  const { rows } = await db.query(
    `select public.submit_contact_message($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) as r`,
    [args.name, args.email, args.type, args.message, args.company, args.budget, args.preferred, args.website, args.elapsed, args.phone],
  );
  return rows[0].r;
}

// ── Setup ──────────────────────────────────────────────────────────
await db.exec(SUPABASE_STUB);
const files = readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort();
console.log(`\nApplying ${files.length} migrations`);
// Profiles are created after the initial schema but BEFORE the consolidation
// migration, so the data copy (profile → site_settings) is exercised.
const CONSOLIDATION = '20261122000001_contact_phone_and_settings_consolidation.sql';
for (const f of files) {
  if (f === CONSOLIDATION) {
    await db.exec(`
      insert into auth.users (id, email) values ('${ADMIN}', 'admin@example.com'), ('${USER}', 'user@example.com');
      insert into public.profiles (id, is_admin, is_public, full_name, email, location, social_links, availability_status, availability_note)
        values ('${ADMIN}', true, true, 'Admin', 'me@example.com', 'Sarajevo',
                '{"github": "https://github.com/me", "instagram": "https://instagram.com/profile"}', 'limited', 'Booking March');
      insert into public.profiles (id, is_admin, is_public, full_name) values ('${USER}', false, false, 'Someone');
      update public.site_settings set social_links = '{"instagram": "https://instagram.com/settings"}';
    `);
  }
  try {
    await db.exec(readFileSync(join(migrationsDir, f), 'utf8'));
    console.log(`  ✓ ${f}`);
  } catch (err) {
    console.log(`  ✗ ${f}: ${err.message}`);
    process.exit(1);
  }
}

await test('consolidation migration copied profile values into site_settings', async () => {
  const { rows } = await db.query(`select availability_status, availability_note, contact_email, location, social_links from public.site_settings`);
  const s = rows[0];
  assert(s.availability_status === 'limited' && s.availability_note === 'Booking March', JSON.stringify(s));
  assert(s.contact_email === 'me@example.com' && s.location === 'Sarajevo', JSON.stringify(s));
  assert(s.social_links.github === 'https://github.com/me', 'github not copied');
  assert(s.social_links.instagram === 'https://instagram.com/settings', 'settings value should win on conflict');
});
const { rows: cats } = await db.query(`select id from public.categories where slug = 'other'`);
const catId = cats[0].id;
await db.query(
  `insert into public.projects (title, slug, short_description, category_id, status, cover_image_path)
   values ('Published One', 'published-one', 'A published project', $1, 'published', 'projects/a/cover.jpg'),
          ('Draft One', 'draft-one', 'A draft project', $1, 'draft', null)`,
  [catId],
);
await db.exec(`
  insert into public.testimonials (author_name, content, is_published) values ('Hidden', 'Unpublished', false);
  insert into storage.objects (bucket_id, name) values ('media', 'projects/a/cover.jpg'), ('media', 'general/unused.jpg');
`);

// ── Seed ───────────────────────────────────────────────────────────
console.log('\nSeed data');
await test('seeds 6 categories, 7 services, 1 settings row, no projects/testimonials beyond fixtures', async () => {
  const { rows } = await db.query(`select
    (select count(*) from public.categories)::int c, (select count(*) from public.services)::int s,
    (select count(*) from public.site_settings)::int st`);
  assert(rows[0].c === 6 && rows[0].s === 7 && rows[0].st === 1, JSON.stringify(rows[0]));
});

// ── Anonymous visitor ──────────────────────────────────────────────
console.log('\nAnonymous visitor');
await test('reads only published projects', async () => {
  await as('anon');
  const { rows } = await db.query('select slug from public.projects');
  assert(rows.length === 1 && rows[0].slug === 'published-one', JSON.stringify(rows));
});
await test('cannot read unpublished testimonials', async () => {
  await as('anon');
  const { rows } = await db.query('select * from public.testimonials');
  assert(rows.length === 0, `saw ${rows.length}`);
});
await test('reads site settings and published services/categories', async () => {
  await as('anon');
  const { rows } = await db.query(`select (select count(*) from public.site_settings)::int a,
    (select count(*) from public.services)::int b, (select count(*) from public.categories)::int c`);
  assert(rows[0].a === 1 && rows[0].b === 7 && rows[0].c === 6, JSON.stringify(rows[0]));
});
await test('reads public profile columns but not is_admin', async () => {
  await as('anon');
  const { rows } = await db.query('select full_name from public.profiles');
  assert(rows.length === 1 && rows[0].full_name === 'Admin', JSON.stringify(rows));
  await rejects('select is_admin from public.profiles');
});
await test('cannot read contact messages', async () => {
  await as('anon');
  await rejects('select * from public.contact_messages');
});
await test('cannot read activity logs', async () => {
  await as('anon');
  await rejects('select * from public.admin_activity_logs');
});
await test('cannot insert/update/delete projects', async () => {
  await as('anon');
  await rejects(`insert into public.projects (title, slug, short_description) values ('x','x','x')`);
  await rejects(`update public.projects set title = 'hacked'`);
  await rejects(`delete from public.projects`);
});
await test('cannot insert contact messages directly', async () => {
  await as('anon');
  await rejects(`insert into public.contact_messages (full_name,email,project_type,message) values ('aa','a@b.co','Other','xxxxxxxxxxxxxxxxxxxxxxxx')`);
});
await test('cannot update site settings or profiles', async () => {
  await as('anon');
  await rejects(`update public.site_settings set website_name = 'hacked'`);
  await rejects(`update public.profiles set is_admin = true`);
});
await test('cannot call admin-only media_usage()', async () => {
  await as('anon');
  await rejects('select * from public.media_usage()');
});
await test('cannot list or upload storage objects', async () => {
  await as('anon');
  const { rows } = await db.query('select * from storage.objects');
  assert(rows.length === 0, 'listed objects');
  await rejects(`insert into storage.objects (bucket_id, name) values ('media', 'evil.png')`);
});

// ── Contact submission RPC ─────────────────────────────────────────
console.log('\nContact submission');
await test('valid submission is stored with sanitized content', async () => {
  const r = await contact({ name: '  <b>Jane</b> Visitor ', message: 'Hello <script>alert(1)</script> I need a new website soon.' });
  assert(r.ok === true, JSON.stringify(r));
  await db.exec('reset role');
  const { rows } = await db.query(`select full_name, message, ip_hash, status from public.contact_messages`);
  assert(rows.length === 1, `rows=${rows.length}`);
  assert(rows[0].full_name === 'Jane Visitor', rows[0].full_name);
  assert(!rows[0].message.includes('<script>'), rows[0].message);
  assert(rows[0].ip_hash && !rows[0].ip_hash.includes('203.0.113.7'), 'raw IP stored');
  assert(rows[0].status === 'new', rows[0].status);
});
await test('rejects invalid email', async () => {
  const r = await contact({ email: 'not-an-email' });
  assert(r.ok === false && r.field === 'email', JSON.stringify(r));
});
await test('rejects short message', async () => {
  const r = await contact({ message: 'too short' });
  assert(r.ok === false && r.field === 'message', JSON.stringify(r));
});
await test('rejects unknown project type', async () => {
  const r = await contact({ type: 'Hacking' });
  assert(r.ok === false && r.field === 'projectType', JSON.stringify(r));
});
await test('phone is required when preferred contact is phone or WhatsApp', async () => {
  for (const preferred of ['phone', 'whatsapp']) {
    const r = await contact({ preferred, email: `need-phone-${preferred}@example.com` });
    assert(r.ok === false && r.field === 'phone', JSON.stringify(r));
  }
});
await test('invalid phone numbers are rejected', async () => {
  for (const phone of ['12345', 'call me maybe', '+1234567890123456', '++38761']) {
    const r = await contact({ preferred: 'phone', phone, email: 'badphone@example.com' });
    assert(r.ok === false && r.field === 'phone', `${phone}: ${JSON.stringify(r)}`);
  }
});
await test('valid phone is normalised and stored', async () => {
  const r = await contact({ preferred: 'whatsapp', phone: '+387 (61) 234-567', email: 'phone-ok@example.com' }, { 'x-forwarded-for': '203.0.113.50' });
  assert(r.ok === true, JSON.stringify(r));
  await db.exec('reset role');
  const { rows } = await db.query(`select phone, preferred_contact from public.contact_messages where email = 'phone-ok@example.com'`);
  assert(rows[0]?.phone === '+38761234567' && rows[0].preferred_contact === 'whatsapp', JSON.stringify(rows));
});
await test('honeypot submission is silently discarded', async () => {
  await db.exec('reset role');
  const before = (await db.query('select count(*)::int n from public.contact_messages')).rows[0].n;
  const r = await contact({ website: 'http://spam.example', email: 'bot@example.com' });
  await db.exec('reset role');
  const after = (await db.query('select count(*)::int n from public.contact_messages')).rows[0].n;
  assert(r.ok === true && before === after, `before=${before} after=${after}`);
});
await test('too-fast submission is silently discarded', async () => {
  await db.exec('reset role');
  const before = (await db.query('select count(*)::int n from public.contact_messages')).rows[0].n;
  await contact({ elapsed: 300, email: 'fast@example.com' });
  await db.exec('reset role');
  const after = (await db.query('select count(*)::int n from public.contact_messages')).rows[0].n;
  assert(before === after, 'stored a too-fast submission');
});
await test('rate limits a single IP after 5 messages per hour', async () => {
  const hdr = { 'x-forwarded-for': '198.51.100.9, 10.0.0.1' };
  const results = [];
  for (let i = 0; i < 6; i++) results.push(await contact({ email: `p${i}@example.com` }, hdr));
  assert(results.slice(0, 5).every((r) => r.ok), JSON.stringify(results));
  assert(results[5].ok === false && results[5].error === 'rate_limited', JSON.stringify(results[5]));
});
await test('rate limits a single email after 3 messages per hour', async () => {
  const results = [];
  for (let i = 0; i < 4; i++) results.push(await contact({ email: 'same@example.com' }, { 'x-forwarded-for': `192.0.2.${i}` }));
  assert(results[3].ok === false && results[3].error === 'rate_limited', JSON.stringify(results));
});
await test('submission is logged in activity as "received"', async () => {
  await db.exec('reset role');
  const { rows } = await db.query(`select count(*)::int n from public.admin_activity_logs where action = 'received'`);
  assert(rows[0].n >= 1, 'no log');
});

// ── Authenticated but NOT admin ────────────────────────────────────
console.log('\nAuthenticated non-admin user');
await test('cannot read drafts or messages', async () => {
  await as('authenticated', USER);
  const p = await db.query('select slug from public.projects');
  assert(p.rows.length === 1, 'saw drafts');
  const m = await db.query('select * from public.contact_messages');
  assert(m.rows.length === 0, 'saw messages');
});
await test('cannot modify content', async () => {
  await as('authenticated', USER);
  await rejects(`insert into public.projects (title, slug, short_description) values ('x','x-y','x')`);
  const u = await db.query(`update public.projects set title = 'hacked' returning id`);
  assert(u.rows.length === 0, 'updated a project');
  const s = await db.query(`update public.site_settings set website_name = 'hacked' returning id`);
  assert(s.rows.length === 0, 'updated settings');
});
await test('cannot promote self to admin', async () => {
  await as('authenticated', USER);
  const { rows } = await db.query(`update public.profiles set is_admin = true where id = $1 returning id`, [USER]);
  assert(rows.length === 0, 'self-promotion succeeded');
});
await test('cannot upload to storage', async () => {
  await as('authenticated', USER);
  await rejects(`insert into storage.objects (bucket_id, name) values ('media', 'evil.png')`);
});

// ── Admin ──────────────────────────────────────────────────────────
console.log('\nAdmin');
await test('reads drafts and messages', async () => {
  await as('authenticated', ADMIN);
  const p = await db.query('select slug from public.projects');
  assert(p.rows.length === 2, `projects=${p.rows.length}`);
  const m = await db.query('select * from public.contact_messages');
  assert(m.rows.length >= 1, 'no messages');
});
await test('creates, publishes and deletes a project; activity is logged with actor', async () => {
  await as('authenticated', ADMIN);
  const ins = await db.query(
    `insert into public.projects (title, slug, short_description) values ('New', 'new-one', 'Desc') returning id, status`,
  );
  assert(ins.rows[0].status === 'draft', 'default not draft');
  const id = ins.rows[0].id;
  const pub = await db.query(`update public.projects set status = 'published' where id = $1 returning published_at`, [id]);
  assert(pub.rows[0].published_at, 'published_at not set');
  await db.query(`delete from public.projects where id = $1`, [id]);
  const log = await db.query(
    `select action, actor_id from public.admin_activity_logs where entity_id = $1 order by id`, [id]);
  const actions = log.rows.map((r) => r.action).join(',');
  assert(actions === 'create,publish,delete', actions);
  assert(log.rows.every((r) => r.actor_id === ADMIN), 'actor missing');
});
await test('duplicate project slug is rejected', async () => {
  await as('authenticated', ADMIN);
  const msg = await rejects(`insert into public.projects (title, slug, short_description) values ('Dup', 'published-one', 'x')`);
  assert(/projects_slug_key|duplicate/.test(msg), msg);
});
await test('invalid slug format is rejected', async () => {
  await as('authenticated', ADMIN);
  await rejects(`insert into public.projects (title, slug, short_description) values ('Bad', 'Bad Slug!', 'x')`);
});
await test('category in use cannot be deleted; unused can', async () => {
  await as('authenticated', ADMIN);
  await rejects(`delete from public.categories where id = $1`, [catId]);
  const { rows } = await db.query(`delete from public.categories where slug = 'real-estate' returning id`);
  assert(rows.length === 1, 'unused category not deleted');
});
await test('updates message status', async () => {
  await as('authenticated', ADMIN);
  const { rows } = await db.query(`update public.contact_messages set status = 'read' where status = 'new' returning id`);
  assert(rows.length >= 1, 'no update');
  await rejects(`update public.contact_messages set status = 'bogus'`);
});
await test('updates site settings and profile', async () => {
  await as('authenticated', ADMIN);
  const s = await db.query(`update public.site_settings set studio_name = 'EK Studio' returning studio_name`);
  assert(s.rows[0].studio_name === 'EK Studio', 'settings');
  const a = await db.query(`update public.site_settings set availability_status = 'limited' returning availability_status`);
  assert(a.rows[0].availability_status === 'limited', 'availability');
  const p = await db.query(`update public.profiles set biography = 'Updated' where id = $1 returning id`, [ADMIN]);
  assert(p.rows.length === 1, 'profile');
});
await test('settings have a single source of truth (duplicate profile columns removed)', async () => {
  await db.exec('reset role');
  const { rows } = await db.query(`select column_name from information_schema.columns
    where table_schema = 'public' and table_name = 'profiles'
      and column_name in ('social_links', 'availability_status', 'availability_note', 'email', 'location')`);
  assert(rows.length === 0, JSON.stringify(rows));
});
await test('anon can read availability from site settings', async () => {
  await as('anon');
  const { rows } = await db.query(`select availability_status, availability_note from public.site_settings`);
  assert(rows.length === 1, JSON.stringify(rows));
});
await test('media_usage() lists referenced images', async () => {
  await as('authenticated', ADMIN);
  const { rows } = await db.query('select * from public.media_usage()');
  assert(rows.some((r) => r.path === 'projects/a/cover.jpg'), JSON.stringify(rows));
});
await test('storage: in-use image cannot be deleted; unused image can', async () => {
  await as('authenticated', ADMIN);
  const used = await db.query(`delete from storage.objects where name = 'projects/a/cover.jpg' returning id`);
  assert(used.rows.length === 0, 'deleted an in-use image');
  const unused = await db.query(`delete from storage.objects where name = 'general/unused.jpg' returning id`);
  assert(unused.rows.length === 1, 'could not delete unused image');
});
await test('storage: admin can upload', async () => {
  await as('authenticated', ADMIN);
  const { rows } = await db.query(`insert into storage.objects (bucket_id, name) values ('media', 'general/new.png') returning id`);
  assert(rows.length === 1, 'upload failed');
});
await test('only one public profile allowed', async () => {
  await db.exec('reset role');
  await rejects(`update public.profiles set is_public = true where id = $1`, [USER]);
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) {
  console.log('Failed:\n - ' + failures.join('\n - '));
  process.exit(1);
}
