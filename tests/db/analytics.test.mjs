// Website analytics security tests: privacy, filtering, access control, reporting.
// Runs every migration in PGlite (real PostgreSQL in WASM) on a stub of
// Supabase's auth/storage schemas.
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
  -- Worst case: also grant EXECUTE on new functions, so the analytics migration must revoke explicitly.
  alter default privileges in schema public grant execute on functions to anon, authenticated;
`;

const ADMIN = '11111111-1111-1111-1111-111111111111';
const USER = '22222222-2222-2222-2222-222222222222';
const MOD1 = '33333333-3333-3333-3333-333333333333';

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
async function rejects(sql, params = [], pattern) {
  try {
    await db.query(sql, params);
  } catch (err) {
    if (pattern && !pattern.test(err.message)) throw new Error(`wrong error: ${err.message}`);
    return err.message;
  }
  throw new Error(`expected failure: ${sql}`);
}

const CHROME = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36';
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';

let spoofSeq = 0;
/**
 * Acts as a browser request through a Cloudflare-like gateway: cf-connecting-ip is set by the
 * gateway (the real IP); x-forwarded-for's FIRST entry and x-real-ip are whatever the client
 * sent (a different forged value on every request); the gateway appends the real IP to XFF.
 */
async function as(uid = null, ip = '203.0.113.10', ua = CHROME, extra = {}) {
  spoofSeq++;
  const forged = `100.64.${Math.floor(spoofSeq / 250) % 250}.${spoofSeq % 250}`;
  await db.exec('reset role');
  await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [uid ?? '']);
  await db.query(`select set_config('request.headers', $1, false)`, [
    JSON.stringify({ 'cf-connecting-ip': ip, 'x-forwarded-for': `${forged}, ${ip}`, 'x-real-ip': forged, 'user-agent': ua, ...extra }),
  ]);
  await db.exec(`set role ${uid ? 'authenticated' : 'anon'}`);
}
const visitor = (ip, ua) => as(null, ip, ua);
const admin = () => as(ADMIN);
const track = (path, ref = null, utm = null, device = null) => db.query(`select public.track_page_view($1, $2, $3, $4)`, [path, ref, utm, device]);
const count = async (where = 'true') => (await su(`select count(*)::int as n from public.page_views where ${where}`))[0].n;
const clear = async () => {
  await su('delete from public.page_views');
  await su('delete from public.analytics_rate_limits');
};
const H = (c) => c.repeat(64);

// ── Setup ──────────────────────────────────────────────────────────
await db.exec(SUPABASE_STUB);
for (const f of readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort()) {
  try {
    await db.exec(readFileSync(join(migrationsDir, f), 'utf8'));
  } catch (err) {
    console.log(`  ✗ ${f}: ${err.message}`);
    process.exit(1);
  }
}
await db.exec(`
  insert into auth.users (id, email) values ('${ADMIN}', 'admin@example.com'), ('${MOD1}', 'mod1@example.com'), ('${USER}', 'user@example.com');
  insert into public.profiles (id, is_admin, is_public, full_name) values ('${ADMIN}', true, true, 'Admin');
  insert into public.moderators (id, full_name, email) values ('${MOD1}', 'Mod One', 'mod1@example.com');
`);
const cat = await one(`select id from public.categories limit 1`);
await su(
  `insert into public.projects (title, slug, short_description, category_id, status)
   values ('Harbor', 'harbor-apartments', 'Published', $1, 'published'), ('Secret', 'secret-draft', 'Draft', $1, 'draft')`,
  [cat.id],
);

// ── Trusted IP source ──────────────────────────────────────────────
console.log('\nAnalytics: trusted IP source');
const MARKER = '198.51.100.77';
const probe = (h) => ({ 'x-ek-ip-probe': MARKER, ...h });
await test('before verification no IP header is trusted: forged X-Forwarded-For cannot create identities', async () => {
  await clear();
  const cfg = (await su('select * from public.analytics_config'))[0];
  assert(cfg.trusted_ip_header === null, 'trusted by default: ' + cfg.trusted_ip_header);
  for (const ip of ['192.0.2.1', '192.0.2.2', '203.0.113.5']) {
    await visitor(ip);
    await track('/about');
  }
  const hashes = await su('select distinct visitor_hash from public.page_views');
  assert(hashes.length === 1, 'an IP was used before verification: ' + hashes.length);
});
await test('verification rejects non-admins, anonymous callers and requests without the test headers', async () => {
  await as(USER, '192.0.2.9', CHROME, probe({}));
  await rejects('select public.analytics_verify_ip_source($1)', [MARKER], /administrators/);
  await as(MOD1, '192.0.2.9', CHROME, probe({}));
  await rejects('select public.analytics_verify_ip_source($1)', [MARKER], /administrators/);
  await as(ADMIN, '192.0.2.9');
  await rejects('select public.analytics_verify_ip_source($1)', [MARKER], /test headers/);
  await as(ADMIN, '192.0.2.9', CHROME, probe({}));
  await rejects('select public.analytics_verify_ip_source($1)', ['not-an-ip'], /Invalid marker/);
  await visitor();
  await rejects('select public.analytics_verify_ip_source($1)', [MARKER], /permission denied/);
});
await test('a gateway that passes client values through is detected: nothing is trusted', async () => {
  await as(ADMIN, '192.0.2.9', CHROME, probe({ 'cf-connecting-ip': MARKER, 'x-real-ip': MARKER, 'x-forwarded-for': MARKER }));
  const r = (await one('select public.analytics_verify_ip_source($1) r', [MARKER])).r;
  assert(r.trusted_header === null, JSON.stringify(r));
  assert(r.checks.every((c) => c.client_controlled), JSON.stringify(r.checks));
  assert((await su('select trusted_ip_header from public.analytics_config'))[0].trusted_ip_header === null, 'stored');
});
await test('the header the gateway overwrites is detected and stored (cf-connecting-ip here)', async () => {
  await as(ADMIN, '192.0.2.9', CHROME, probe({ 'x-real-ip': MARKER, 'x-forwarded-for': `${MARKER}, 192.0.2.9` }));
  const r = (await one('select public.analytics_verify_ip_source($1) r', [MARKER])).r;
  assert(r.trusted_header === 'cf-connecting-ip', JSON.stringify(r));
  const byHeader = Object.fromEntries(r.checks.map((c) => [c.header, c]));
  assert(byHeader['x-real-ip'].client_controlled === true, 'x-real-ip should be client-controlled');
  assert(byHeader['x-forwarded-for:last'].client_controlled === false, 'appended XFF entry');
  const cfg = (await su('select * from public.analytics_config'))[0];
  assert(cfg.trusted_ip_header === 'cf-connecting-ip' && cfg.verified_by === ADMIN && cfg.verified_at, JSON.stringify(cfg));
});
await test('after verification the real IP identifies visitors; forged X-Forwarded-For has no effect', async () => {
  await clear();
  await visitor('192.0.2.20');
  await track('/about');
  await visitor('192.0.2.20');
  await track('/contact');
  await visitor('192.0.2.21');
  await track('/about');
  const hashes = await su('select visitor_hash from public.page_views order by id');
  assert(hashes[0].visitor_hash === hashes[1].visitor_hash, 'forged XFF changed the identity');
  assert(hashes[0].visitor_hash !== hashes[2].visitor_hash, 'different real IPs must differ');
});

// ── Tracking ───────────────────────────────────────────────────────
console.log('\nAnalytics: tracking');
await test('anonymous page view is recorded with anonymous fields only (no IP, no user agent)', async () => {
  await clear();
  await visitor();
  await track('/', 'www.google.com', null, 'desktop');
  const r = (await su('select * from public.page_views'))[0];
  assert(r && r.page === 'home' && r.source === 'google' && r.device === 'desktop', JSON.stringify(r));
  assert(/^[0-9a-f]{64}$/.test(r.visitor_hash), 'hash format');
  assert(r.referrer_domain === null, 'known sources keep no domain');
  const cols = (await su(`select column_name from information_schema.columns where table_schema = 'public' and table_name = 'page_views'`)).map((c) => c.column_name);
  for (const bad of ['ip', 'ip_hash', 'user_agent', 'email', 'user_id', 'url']) assert(!cols.includes(bad), 'column ' + bad);
  const all = JSON.stringify(await su('select * from public.page_views'));
  assert(!all.includes('203.0.113.10') && !all.includes('Chrome/131'), 'IP or user agent stored');
});
await test('every public page is classified; dashboards, drafts, unknown and malicious paths are ignored', async () => {
  await clear();
  await visitor('198.51.100.1');
  for (const p of ['/about', '/projects', '/projects/harbor-apartments', '/services/', '/process', '/contact', '/privacy']) await track(p);
  for (const p of ['/admin', '/admin/analytics', '/moderator/leads', '/moderator/login', '/projects/secret-draft', '/projects/nope', '/x', "/projects/a'b", '/../../etc', null]) await track(p);
  const pages = (await su('select page, project_slug from public.page_views order by id')).map((r) => r.page + (r.project_slug ? ':' + r.project_slug : ''));
  assert(JSON.stringify(pages) === JSON.stringify(['about', 'projects', 'project:harbor-apartments', 'services', 'process', 'contact', 'privacy']), JSON.stringify(pages));
  assert((await count(`source <> 'internal'`)) === 0, 'in-site navigation must be internal');
});
await test('traffic sources from referrer domains, utm_source and direct visits', async () => {
  await clear();
  const cases = [
    ['l.instagram.com', null, 'instagram'], ['m.facebook.com', null, 'facebook'], ['www.linkedin.com', null, 'linkedin'],
    ['t.co', null, 'x'], ['duckduckgo.com', null, 'duckduckgo'], ['', null, 'direct'], ['', 'instagram', 'instagram'],
    ['news.example.org', null, 'other'], ['www.google.co.uk', null, 'google'], ['evil.com/path?<script>', null, 'other'],
  ];
  let i = 0;
  for (const [ref, utm, expected] of cases) {
    await visitor(`192.0.2.${++i}`);
    await track('/', ref, utm);
    const r = (await su('select source, referrer_domain from public.page_views order by id desc limit 1'))[0];
    assert(r.source === expected, `${ref}/${utm} → ${r.source}`);
    if (ref === 'news.example.org') assert(r.referrer_domain === 'news.example.org', 'other keeps the domain only');
    if (ref.startsWith('evil')) assert(/^[a-z0-9.-]+$/.test(r.referrer_domain), 'unsanitised domain: ' + r.referrer_domain);
  }
});
await test('device: client hint is validated, otherwise derived from the user agent', async () => {
  await clear();
  await visitor('192.0.2.50', IPHONE);
  await track('/', '');
  await visitor('192.0.2.51');
  await track('/', '', null, 'tablet');
  await visitor('192.0.2.52');
  await track('/', '', null, 'spaceship');
  const d = (await su('select device from public.page_views order by id')).map((r) => r.device);
  assert(JSON.stringify(d) === '["mobile","tablet","desktop"]', JSON.stringify(d));
});
await test('bots, crawlers, link previews, headless browsers and empty user agents are not counted', async () => {
  await clear();
  const bots = ['Googlebot/2.1 (+http://www.google.com/bot.html)', 'facebookexternalhit/1.1', 'Mozilla/5.0 HeadlessChrome/131.0', 'curl/8.4', 'WhatsApp/2.23', 'Chrome-Lighthouse', 'python-requests/2.31', ''];
  for (const ua of bots) {
    await visitor('192.0.2.60', ua);
    await track('/', '');
  }
  assert((await count()) === 0, 'bot counted');
});
await test('duplicate protection: same page, same visitor within 30 s counts once', async () => {
  await clear();
  await visitor('192.0.2.70');
  await track('/about');
  await track('/about');
  await track('/about/');
  await track('/contact');
  assert((await count()) === 2, 'expected 2, got ' + (await count()));
  await visitor('192.0.2.71');
  await track('/about');
  assert((await count()) === 3, 'a second visitor is counted');
});
await test('per-visitor limit: 120 counted views per hour', async () => {
  await clear();
  await visitor('192.0.2.80');
  await track('/process');
  const h = (await su('select visitor_hash from public.page_views'))[0].visitor_hash;
  await su('update public.analytics_rate_limits set hits = 120 where key = $1', ['v:' + h]);
  await visitor('192.0.2.80');
  await track('/services');
  assert((await count("page = 'services'")) === 0, 'over the cap but counted');
  await visitor('192.0.2.81');
  await track('/services');
  assert((await count("page = 'services'")) === 1, 'other visitors still counted');
});
await test('per-network limit: forged identities from one network cannot exhaust the global budget', async () => {
  await clear();
  for (let i = 0; i < 301; i++) {
    await visitor(`198.18.7.${i % 250}`, `${CHROME} variant/${i}`);
    await track('/');
  }
  assert((await count()) === 300, 'network cap: ' + (await count()));
  const g = (await su("select coalesce(sum(hits), 0)::int as n from public.analytics_rate_limits where key = 'g'"))[0].n;
  assert(g === 300, 'blocked traffic consumed the global budget: ' + g);
  await visitor('198.18.9.1');
  await track('/');
  assert((await count()) === 301, 'another network was blocked');
  const keys = (await su('select key from public.analytics_rate_limits')).map((r) => r.key).join(' ');
  assert(!/198\.18|192\.0/.test(keys), 'raw IP stored in rate-limit keys');
});
await test('global limit: 1,500 counted views per minute', async () => {
  await clear();
  await su("insert into public.analytics_rate_limits (key, window_start, hits) values ('g', date_bin(interval '1 minute', now(), timestamptz '2000-01-01 00:00:00+00'), 1500)");
  await visitor('192.0.2.150');
  await track('/');
  assert((await count()) === 0, 'over the global cap but counted');
});
await test('signed-in admins and moderators browsing the site are not counted; other users are', async () => {
  await clear();
  await as(ADMIN, '192.0.2.90');
  await track('/', '');
  await as(MOD1, '192.0.2.91');
  await track('/', '');
  await as(USER, '192.0.2.92');
  await track('/', '');
  assert((await count()) === 1, 'staff counted');
});
await test('visitor hash uses a daily salt; older salts are deleted (no cross-day linking)', async () => {
  await clear();
  await su(`delete from public.analytics_salts`);
  await su(`insert into public.analytics_salts (day, salt) values (current_date - 3, 'old-salt')`);
  await visitor('192.0.2.100');
  await track('/', '');
  const salts = await su('select day from public.analytics_salts');
  assert(salts.length === 1, 'old salt kept: ' + JSON.stringify(salts));
  // Old salts are also removed without visitor traffic (scheduled job / dashboard).
  await su("insert into public.analytics_salts (day, salt) values (current_date - 1, 'yesterday')");
  await su('select public.analytics_cleanup()');
  assert((await su('select day from public.analytics_salts')).length === 1, 'cleanup did not remove the old salt');
  const h1 = (await su('select visitor_hash from public.page_views'))[0].visitor_hash;
  await su(`update public.analytics_salts set salt = 'next-day-salt'`);
  await visitor('192.0.2.100');
  await track('/about');
  const h2 = (await su(`select visitor_hash from public.page_views where page = 'about'`))[0].visitor_hash;
  assert(h1 !== h2, 'hash must change with the salt');
});

// ── Access control ─────────────────────────────────────────────────
console.log('\nAnalytics: access control');
await test('visitors cannot read, write or delete analytics, salts or the summary', async () => {
  await visitor();
  await rejects('select * from public.page_views', [], /permission denied/);
  await rejects(`insert into public.page_views (page, source, device, visitor_hash) values ('home','direct','desktop', $1)`, [H('a')], /permission denied/);
  await rejects('delete from public.page_views', [], /permission denied/);
  await rejects('select * from public.analytics_salts', [], /permission denied/);
  await rejects(`select public.analytics_summary(current_date - 7, current_date)`, [], /permission denied/);
  await rejects(`select public.analytics_source('google')`, [], /permission denied/);
});
await test('moderators and ordinary users cannot read or change analytics', async () => {
  for (const uid of [MOD1, USER]) {
    await as(uid);
    assert((await rows('select * from public.page_views')).length === 0, 'rows visible to ' + uid);
    await rejects('select * from public.analytics_salts', [], /permission denied/);
    await rejects(`insert into public.page_views (page, source, device, visitor_hash) values ('home','direct','desktop', $1)`, [H('a')], /permission denied/);
    await rejects(`update public.page_views set page = 'about'`, [], /permission denied/);
    await rejects(`delete from public.page_views`, [], /permission denied/);
    await rejects(`select public.analytics_summary(current_date - 7, current_date)`, [], /administrators/);
  }
});
await test('function privileges (has_function_privilege): only the intended entry points are executable', async () => {
  const fns = {
    'public.track_page_view(text, text, text, text)': { anon: true, authenticated: true },
    'public.analytics_summary(date, date, text, text)': { anon: false, authenticated: true },
    'public.analytics_verify_ip_source(text)': { anon: false, authenticated: true },
    'public.analytics_cleanup()': { anon: false, authenticated: false },
    'public.analytics_daily_salt()': { anon: false, authenticated: false },
    'public.analytics_hit(text, interval, integer)': { anon: false, authenticated: false },
    'public.analytics_source(text)': { anon: false, authenticated: false },
    'public.analytics_valid_ip(text)': { anon: false, authenticated: false },
    'public.analytics_ip_from_headers(jsonb, text)': { anon: false, authenticated: false },
  };
  for (const [fn, expected] of Object.entries(fns)) {
    for (const role of ['anon', 'authenticated']) {
      const ok = (await su("select has_function_privilege($1, $2, 'execute') as ok", [role, fn]))[0].ok;
      assert(ok === expected[role], `${role} on ${fn}: ${ok}`);
    }
  }
  const definers = await su(`select p.proname, p.proconfig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prosecdef and (p.proname like 'analytics%' or p.proname = 'track_page_view')`);
  assert(definers.length === 6, 'definers: ' + definers.map((d) => d.proname));
  for (const d of definers) assert((d.proconfig ?? []).some((c) => /^search_path=(""|)$/.test(c)), d.proname + ' search_path ' + d.proconfig);
});
await test('visitors and staff cannot read or change the config or rate-limit counters', async () => {
  for (const who of [null, USER, MOD1, ADMIN]) {
    await as(who);
    for (const t of ['analytics_config', 'analytics_rate_limits']) {
      await rejects(`select * from public.${t}`, [], /permission denied/);
      await rejects(`delete from public.${t}`, [], /permission denied/);
    }
    await rejects("update public.analytics_config set trusted_ip_header = 'x-real-ip'", [], /permission denied/);
    await rejects('select public.analytics_cleanup()', [], /permission denied/);
  }
});
await test('admin can read raw rows but not modify them or read salts', async () => {
  await admin();
  assert((await rows('select * from public.page_views')).length > 0, 'admin sees rows');
  await rejects(`update public.page_views set page = 'about'`, [], /permission denied/);
  await rejects('delete from public.page_views', [], /permission denied/);
  await rejects(`insert into public.page_views (page, source, device, visitor_hash) values ('home','direct','desktop', $1)`, [H('a')], /permission denied/);
  await rejects('select * from public.analytics_salts', [], /permission denied/);
});

// ── Reporting ──────────────────────────────────────────────────────
console.log('\nAnalytics: admin summary');
await test('summary: totals, range, series, pages, projects, sources, referrers, devices', async () => {
  await clear();
  await su(`insert into public.page_views (page, project_slug, source, referrer_domain, device, visitor_hash, created_at) values
    ('home', null, 'google', null, 'mobile', $1, now()),
    ('about', null, 'internal', null, 'mobile', $1, now()),
    ('project', 'harbor-apartments', 'internal', null, 'mobile', $1, now()),
    ('home', null, 'direct', null, 'desktop', $2, now()),
    ('contact', null, 'other', 'news.example.org', 'tablet', $3, now() - interval '3 days'),
    ('home', null, 'instagram', null, 'mobile', $4, now() - interval '380 days')`, [H('a'), H('b'), H('c'), H('d')]);
  await admin();
  const s = (await one(`select public.analytics_summary(current_date - 6, current_date, 'day', 'UTC') s`)).s;
  assert(s.totals.all_time_views === 6 && s.totals.all_time_visitors === 4, JSON.stringify(s.totals));
  assert(s.totals.today_views === 4, JSON.stringify(s.totals));
  assert(s.range.views === 5 && s.range.visitors === 3 && s.range.entries === 3, JSON.stringify(s.range));
  assert(s.series.length === 7 && s.series.reduce((n, b) => n + b.views, 0) === 5, JSON.stringify(s.series));
  assert(s.pages[0].page === 'home' && s.pages[0].views === 2, JSON.stringify(s.pages));
  assert(s.projects[0].slug === 'harbor-apartments' && s.projects[0].views === 1, JSON.stringify(s.projects));
  assert(!s.sources.some((x) => x.source === 'internal') && s.sources.length === 3, JSON.stringify(s.sources));
  assert(s.referrers.length === 1 && s.referrers[0].domain === 'news.example.org', JSON.stringify(s.referrers));
  assert(s.devices.find((d) => d.device === 'mobile').views === 3, JSON.stringify(s.devices));

  const m = (await one(`select public.analytics_summary(current_date - 500, current_date, 'month', 'Not/AZone') s`)).s;
  assert(m.timezone === 'UTC' && m.range.views === 6 && m.series.length >= 16, 'month grain / time zone fallback');
  const w = (await one(`select public.analytics_summary(current_date - 27, current_date, 'week') s`)).s;
  assert(w.series.length >= 4 && w.series.length <= 5, 'weeks: ' + w.series.length);
  const tz = (await one(`select public.analytics_summary(current_date - 6, current_date, 'day', 'Europe/Sarajevo') s`)).s;
  assert(tz.timezone === 'Europe/Sarajevo', 'valid time zone kept');
  await rejects(`select public.analytics_summary(current_date, current_date - 1)`, [], /valid date range/);
  await rejects(`select public.analytics_summary(current_date - 4000, current_date)`, [], /ten years/);
});
await test('retention: page views older than 13 months are deleted; the report says so', async () => {
  await clear();
  await su(`insert into public.page_views (page, source, device, visitor_hash, created_at) values
    ('home', 'direct', 'desktop', $1, now() - interval '13 months 2 days'),
    ('home', 'direct', 'desktop', $1, now() - interval '12 months')`, [H('r')]);
  await admin();
  const s = (await one('select public.analytics_summary(current_date - 6, current_date) s')).s;
  assert(s.retention_months === 13 && s.cleanup_scheduled === false, JSON.stringify(s));
  assert(s.ip_source.header === 'cf-connecting-ip' && s.ip_source.verified_at, JSON.stringify(s.ip_source));
  assert((await count()) === 1, 'old row kept');
});
await test('no data: zeros and empty lists, nothing invented', async () => {
  await clear();
  await admin();
  const s = (await one(`select public.analytics_summary(current_date - 6, current_date) s`)).s;
  assert(s.totals.all_time_views === 0 && s.totals.first_view_at === null, JSON.stringify(s.totals));
  assert(s.series.length === 7 && s.series.every((b) => b.views === 0), 'series');
  assert(s.pages.length === 0 && s.sources.length === 0 && s.devices.length === 0, 'lists');
});

// ── Regression ─────────────────────────────────────────────────────
console.log('\nRegression');
await test('existing contact form and inquiry privacy are unchanged', async () => {
  await visitor('203.0.113.200');
  const r = await one(`select public.submit_contact_message('Ana', 'ana@client.test', 'Other', 'A genuine inquiry about a website.', null, null, 'email', null, 9000, null) r`);
  assert(r.r.ok === true, JSON.stringify(r));
  await rejects('select * from public.contact_messages', [], /permission denied/);
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) {
  console.log('Failed:\n - ' + failures.join('\n - '));
  process.exit(1);
}
