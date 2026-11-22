// Unit tests for netlify/functions/invite-moderator.mts with a mocked Supabase.
//   node tests/functions/invite-moderator.test.mjs
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const { default: handler } = await import(pathToFileURL(join(root, 'netlify', 'functions', 'invite-moderator.mts')).href);

const SERVICE = 'service-role-SECRET-value';
const ANON = 'anon-public-key';
const ADMIN_TOKEN = 'admin-access-token';
const USER_TOKEN = 'plain-user-token';

let calls = [];
let inviteResponse = { status: 200, body: { id: 'u1' } };
let linkResponse = { status: 200, body: { id: 'u1', email: 'new@mod.test', full_name: 'New Mod', is_active: true } };

globalThis.fetch = async (url, init = {}) => {
  const u = String(url);
  const headers = Object.fromEntries(Object.entries(init.headers ?? {}).map(([k, v]) => [k.toLowerCase(), v]));
  calls.push({ url: u, headers, body: init.body });
  const reply = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  if (u.endsWith('/rest/v1/rpc/is_admin')) return reply(200, headers.authorization === `Bearer ${ADMIN_TOKEN}`);
  if (u.includes('/auth/v1/invite')) return reply(inviteResponse.status, inviteResponse.body);
  if (u.endsWith('/rest/v1/rpc/admin_add_moderator')) return reply(linkResponse.status, linkResponse.body);
  return reply(404, {});
};

function setEnv(overrides = {}) {
  for (const k of ['SUPABASE_URL', 'VITE_SUPABASE_URL', 'SUPABASE_ANON_KEY', 'VITE_SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY', 'VITE_SITE_URL', 'URL']) {
    delete process.env[k];
  }
  Object.assign(process.env, {
    VITE_SUPABASE_URL: 'https://proj.supabase.test',
    VITE_SUPABASE_ANON_KEY: ANON,
    SUPABASE_SERVICE_ROLE_KEY: SERVICE,
    VITE_SITE_URL: 'https://studio.test',
    ...overrides,
  });
  for (const [k, v] of Object.entries(overrides)) if (v === undefined) delete process.env[k];
}

const request = (body, token = ADMIN_TOKEN, method = 'POST') =>
  new Request('https://studio.test/.netlify/functions/invite-moderator', {
    method,
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: method === 'POST' ? JSON.stringify(body) : undefined,
  });

let passed = 0;
let failed = 0;
async function test(name, fn) {
  calls = [];
  inviteResponse = { status: 200, body: { id: 'u1' } };
  linkResponse = { status: 200, body: { id: 'u1', email: 'new@mod.test', full_name: 'New Mod', is_active: true } };
  setEnv();
  try {
    await fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    failed++;
    console.log(`  ✗ ${name}\n      ${err.message}`);
  }
}
const assert = (c, m) => {
  if (!c) throw new Error(m);
};
async function run(req) {
  const res = await handler(req);
  const text = await res.text();
  assert(!text.includes(SERVICE), 'service-role key leaked in response');
  return { status: res.status, body: JSON.parse(text) };
}

console.log('\ninvite-moderator function');
await test('rejects non-POST', async () => {
  const r = await run(request(null, ADMIN_TOKEN, 'GET'));
  assert(r.status === 405, r.status);
});
await test('503 when the service-role key is not configured (no calls made)', async () => {
  setEnv({ SUPABASE_SERVICE_ROLE_KEY: undefined });
  const r = await run(request({ email: 'a@b.co', fullName: 'A' }));
  assert(r.status === 503 && r.body.error === 'not_configured', JSON.stringify(r));
  assert(calls.length === 0, 'made network calls');
});
await test('401 without a session token', async () => {
  const r = await run(request({ email: 'a@b.co', fullName: 'A' }, null));
  assert(r.status === 401, r.status);
  assert(calls.length === 0, 'made network calls');
});
await test('403 for a signed-in non-admin; service key never used', async () => {
  const r = await run(request({ email: 'a@b.co', fullName: 'A' }, USER_TOKEN));
  assert(r.status === 403, r.status);
  assert(calls.length === 1 && !calls.some((c) => JSON.stringify(c.headers).includes(SERVICE)), 'service key used before authorization');
});
await test('400 on invalid email or name', async () => {
  let r = await run(request({ email: 'nope', fullName: 'A' }));
  assert(r.status === 400 && r.body.field === 'email', JSON.stringify(r));
  r = await run(request({ email: 'a@b.co', fullName: '  ' }));
  assert(r.status === 400 && r.body.field === 'fullName', JSON.stringify(r));
  assert(!calls.some((c) => c.url.includes('/auth/v1/invite')), 'invited despite invalid input');
});
await test('admin invite: service key only for the invite; moderator linked with the admin token', async () => {
  const r = await run(request({ email: ' New@Mod.test ', fullName: 'New Mod' }));
  assert(r.status === 200 && r.body.ok && r.body.invited === true && r.body.moderator.email === 'new@mod.test', JSON.stringify(r));
  const invite = calls.find((c) => c.url.includes('/auth/v1/invite'));
  assert(invite.headers.authorization === `Bearer ${SERVICE}`, 'invite not authorised with service key');
  assert(invite.url.includes(encodeURIComponent('https://studio.test/moderator/set-password')), invite.url);
  assert(JSON.parse(invite.body).email === 'new@mod.test', invite.body);
  const link = calls.find((c) => c.url.endsWith('/rpc/admin_add_moderator'));
  assert(link.headers.authorization === `Bearer ${ADMIN_TOKEN}`, 'link must use the admin token, not the service key');
  assert(JSON.parse(link.body).p_full_name === 'New Mod', link.body);
});
await test('existing account: no email sent, still linked', async () => {
  inviteResponse = { status: 422, body: { msg: 'A user with this email address has already been registered' } };
  const r = await run(request({ email: 'existing@mod.test', fullName: 'Existing' }));
  assert(r.status === 200 && r.body.invited === false, JSON.stringify(r));
});
await test('invite failure is reported without linking', async () => {
  inviteResponse = { status: 500, body: { msg: 'Error sending invite email' } };
  const r = await run(request({ email: 'x@mod.test', fullName: 'X' }));
  assert(r.status === 502 && /sending invite/.test(r.body.message), JSON.stringify(r));
  assert(!calls.some((c) => c.url.endsWith('/rpc/admin_add_moderator')), 'linked after failed invite');
});
await test('database refusal (e.g. admin email) is passed through', async () => {
  linkResponse = { status: 400, body: { message: 'Administrators cannot be moderators.' } };
  const r = await run(request({ email: 'admin@studio.test', fullName: 'Admin' }));
  assert(r.status === 400 && r.body.message === 'Administrators cannot be moderators.', JSON.stringify(r));
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
