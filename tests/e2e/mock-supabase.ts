/**
 * In-memory stand-in for the Supabase HTTP API (PostgREST, Auth, Storage)
 * used by the Playwright suite. It implements just enough of each protocol
 * for supabase-js, and simulates the visibility rules of the RLS policies
 * (anon sees published rows only, writes require the admin token).
 *
 * The real policies are verified against Postgres in tests/db/rls.test.mjs;
 * this mock exists so the UI can be exercised end to end without a project.
 */
import type { BrowserContext, Route } from '@playwright/test';

export const MOCK_URL = 'http://mock-supabase.test';
export const ANON_KEY = 'e2e-anon-key';
export const ADMIN = { id: '11111111-1111-4111-8111-111111111111', email: 'admin@example.com', password: 'correct-horse-battery' };
export const NON_ADMIN = { id: '22222222-2222-4222-8222-222222222222', email: 'user@example.com', password: 'user-password-123' };

type Row = Record<string, unknown> & { id: string | number };
type Role = 'anon' | 'user' | 'admin';

const PNG_1x1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkqPhfDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

const b64url = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
function fakeJwt(sub: string, email: string) {
  const exp = Math.floor(Date.now() / 1000) + 3600;
  return `${b64url({ alg: 'HS256', typ: 'JWT' })}.${b64url({ sub, email, role: 'authenticated', exp, aud: 'authenticated' })}.sig`;
}

const now = () => new Date().toISOString();
let seq = 0;
const uuid = () => `00000000-0000-4000-8000-${String(++seq).padStart(12, '0')}`;

export function seedData() {
  const cat = (slug: string, name: string, order: number): Row => ({
    id: uuid(), slug, name, description: '', display_order: order, is_published: true, created_at: now(), updated_at: now(),
  });
  const categories = [
    cat('business-websites', 'Business Websites', 1),
    cat('e-commerce', 'E-commerce', 2),
    cat('booking-systems', 'Booking Systems', 3),
    cat('real-estate', 'Real Estate', 4),
    cat('interactive-applications', 'Interactive Applications', 5),
    cat('other', 'Other', 6),
  ];
  const project = (p: Partial<Row> & { title: string; slug: string; category_id: Row['id'] }): Row => {
    const id = uuid();
    return {
    id,
    short_description: `${p.title} short description.`,
    full_description: 'First paragraph of the overview.\n\nSecond paragraph of the overview.',
    objectives: ['Objective one', 'Objective two'],
    features: ['Feature one', 'Feature two'],
    project_type: 'personal',
    technologies: ['React', 'TypeScript'],
    cover_image_path: `projects/${id}/cover.webp`,
    cover_image_alt: '',
    gallery_images: [],
    live_demo_url: null,
    is_featured: false,
    display_order: 0,
    status: 'published',
    published_at: now(),
    created_at: now(),
    updated_at: now(),
    ...p,
    };
  };
  const projects = [
    project({
      title: 'Harbor Apartments', slug: 'harbor-apartments', category_id: categories[2].id, project_type: 'demo',
      is_featured: true, display_order: 10, live_demo_url: 'https://example.com/harbor',
      technologies: ['React', 'Supabase', 'Tailwind CSS'], gallery_images: ['projects/harbor/one.webp', 'projects/harbor/two.webp'],
    }),
    project({ title: 'Studio Barber', slug: 'studio-barber', category_id: categories[0].id, display_order: 20 }),
    project({ title: 'Shopfront Kit', slug: 'shopfront-kit', category_id: categories[1].id, display_order: 30, technologies: ['Vue', 'Stripe'] }),
    project({ title: 'Secret Draft', slug: 'secret-draft', category_id: categories[5].id, status: 'draft', published_at: null, display_order: 40 }),
  ];
  const service = (slug: string, title: string, order: number): Row => ({
    id: uuid(), slug, title, summary: `${title} summary.`, description: `${title} description.`,
    benefits: ['Benefit A'], features: ['Included A'], icon: 'code', display_order: order, is_published: true,
    created_at: now(), updated_at: now(),
  });
  const services = [
    service('website-design', 'Website Design', 1),
    service('website-development', 'Website Development', 2),
    service('website-redesign', 'Website Redesign', 3),
    service('responsive-web-design', 'Responsive Web Design', 4),
    service('booking-reservation-systems', 'Booking & Reservation Systems', 5),
    service('custom-web-applications', 'Custom Web Applications', 6),
    service('website-maintenance', 'Website Maintenance', 7),
  ];
  const site_settings: Row[] = [
    {
      id: 1, website_name: 'Ernal Karce', studio_name: 'EK Digital Studio', tagline: 'Web Developer & Digital Solutions Designer',
      description: 'Studio description.', hero_heading: 'We Build Digital Experiences That Move Businesses Forward.',
      hero_subheading: 'Hero supporting text.', logo_path: null, favicon_path: null, og_image_path: null,
      seo_title: 'Ernal Karce — EK Digital Studio', seo_description: 'SEO description.', contact_email: 'hello@example.com',
      contact_phone: null, whatsapp_number: '38761000000', location: 'Sarajevo', footer_text: '',
      social_links: { instagram: 'https://instagram.com/example', linkedin: 'https://linkedin.com/in/example' },
      availability_status: 'available', availability_note: '', updated_at: now(),
    },
  ];
  const profiles: Row[] = [
    {
      id: ADMIN.id, is_admin: true, is_public: true, full_name: 'Ernal Karce', professional_title: 'Web Developer & Digital Solutions Designer',
      short_intro: 'Intro text from the profile.', biography: 'Biography paragraph.', background: 'Background text.', experience: '',
      approach: 'Approach text.', philosophy: '', technologies: ['React', 'TypeScript'], avatar_path: 'profile/avatar.webp',
      
      created_at: now(), updated_at: now(),
    },
    { id: NON_ADMIN.id, is_admin: false, is_public: false, full_name: 'Someone', professional_title: '', short_intro: '', biography: '', background: '', experience: '', approach: '', philosophy: '', technologies: [], avatar_path: null, created_at: now(), updated_at: now() },
  ];
  return {
    categories,
    projects,
    services,
    site_settings,
    profiles,
    contact_messages: [] as Row[],
    testimonials: [] as Row[],
    admin_activity_logs: [] as Row[],
  };
}

type Tables = ReturnType<typeof seedData>;
type TableName = keyof Tables;

const PUBLIC_FILTER: Partial<Record<TableName, (r: Row) => boolean>> = {
  projects: (r) => r.status === 'published',
  categories: (r) => r.is_published === true,
  services: (r) => r.is_published === true,
  testimonials: (r) => r.is_published === true,
  profiles: (r) => r.is_public === true,
  site_settings: () => true,
  contact_messages: () => false,
  admin_activity_logs: () => false,
};

interface StorageObject {
  name: string;
  created_at: string;
  size: number;
  mimetype: string;
}

export class MockSupabase {
  db: Tables = seedData();
  storage = new Map<string, StorageObject>([
    [String(this.db.projects[0].cover_image_path), { name: 'cover.webp', created_at: now(), size: 1200, mimetype: 'image/webp' }],
    ['general/unused.png', { name: 'unused.png', created_at: now(), size: 900, mimetype: 'image/png' }],
  ]);
  rpcCalls: Array<{ fn: string; body: Record<string, unknown> }> = [];
  private tokens = new Map<string, Role>([[ANON_KEY, 'anon']]);

  /** Installed on the browser context so every tab (admin + public) shares one backend. */
  async install(context: BrowserContext) {
    await context.route(`${MOCK_URL}/**`, (route) => this.handle(route));
  }

  private role(route: Route): Role {
    const auth = route.request().headers()['authorization']?.replace(/^Bearer\s+/i, '') ?? ANON_KEY;
    return this.tokens.get(auth) ?? 'anon';
  }

  private json(route: Route, status: number, body: unknown, headers: Record<string, string> = {}) {
    return route.fulfill({
      status,
      headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*', ...headers },
      body: body === undefined ? '' : JSON.stringify(body),
    });
  }

  private async handle(route: Route) {
    const req = route.request();
    if (req.method() === 'OPTIONS') {
      return route.fulfill({
        status: 204,
        headers: {
          'access-control-allow-origin': '*',
          'access-control-allow-headers': '*',
          'access-control-allow-methods': 'GET,POST,PATCH,DELETE,PUT,HEAD,OPTIONS',
        },
      });
    }
    const url = new URL(req.url());
    const path = url.pathname;
    if (path.startsWith('/auth/v1/')) return this.handleAuth(route, path.slice(9), url);
    if (path.startsWith('/rest/v1/rpc/')) return this.handleRpc(route, path.slice(13));
    if (path.startsWith('/rest/v1/')) return this.handleRest(route, path.slice(9) as TableName, url);
    if (path.startsWith('/storage/v1/')) return this.handleStorage(route, path.slice(12));
    return this.json(route, 404, { message: 'not found' });
  }

  // ── Auth ──────────────────────────────────────────────────────
  private handleAuth(route: Route, endpoint: string, url: URL) {
    const body = (route.request().postDataJSON() ?? {}) as Record<string, string>;
    if (endpoint === 'token' && url.searchParams.get('grant_type') === 'password') {
      const account = [ADMIN, NON_ADMIN].find((a) => a.email === body.email && a.password === body.password);
      if (!account) return this.json(route, 400, { error: 'invalid_grant', error_description: 'Invalid login credentials', code: 'invalid_credentials', msg: 'Invalid login credentials' });
      const token = fakeJwt(account.id, account.email);
      this.tokens.set(token, account === ADMIN ? 'admin' : 'user');
      const user = { id: account.id, aud: 'authenticated', role: 'authenticated', email: account.email, app_metadata: {}, user_metadata: {}, created_at: now() };
      return this.json(route, 200, {
        access_token: token, token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600,
        refresh_token: `refresh-${account.id}`, user,
      });
    }
    if (endpoint === 'logout') return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*' } });
    if (endpoint === 'recover') return this.json(route, 200, {});
    if (endpoint === 'user') {
      const role = this.role(route);
      const acc = role === 'admin' ? ADMIN : role === 'user' ? NON_ADMIN : null;
      if (!acc) return this.json(route, 401, { message: 'invalid JWT' });
      return this.json(route, 200, { id: acc.id, email: acc.email, aud: 'authenticated', role: 'authenticated' });
    }
    return this.json(route, 404, {});
  }

  // ── RPC ───────────────────────────────────────────────────────
  private handleRpc(route: Route, fn: string) {
    const role = this.role(route);
    const body = (route.request().postDataJSON() ?? {}) as Record<string, unknown>;
    this.rpcCalls.push({ fn, body });
    if (fn === 'is_admin') return this.json(route, 200, role === 'admin');
    if (fn === 'submit_contact_message') {
      if (body.p_website || (typeof body.p_elapsed_ms === 'number' && body.p_elapsed_ms < 2000)) return this.json(route, 200, { ok: true });
      const email = String(body.p_email ?? '');
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(email) || email.endsWith('@server-rejects.test')) {
        return this.json(route, 200, { ok: false, error: 'validation', field: 'email', message: 'Server says: email not accepted.' });
      }
      if (email.startsWith('ratelimited@')) {
        return this.json(route, 200, { ok: false, error: 'rate_limited', message: 'Too many messages sent recently. Please try again later.' });
      }
      // Mirrors the phone rules in submit_contact_message().
      const phone = body.p_phone == null ? null : String(body.p_phone).replace(/[\s().-]/g, '');
      if (!phone && ['phone', 'whatsapp'].includes(String(body.p_preferred_contact))) {
        return this.json(route, 200, { ok: false, error: 'validation', field: 'phone', message: 'Please enter a phone number so I can contact you that way.' });
      }
      if (phone && !/^\+?[0-9]{6,15}$/.test(phone)) {
        return this.json(route, 200, { ok: false, error: 'validation', field: 'phone', message: 'Please enter a valid phone number, e.g. +387 61 234 567.' });
      }
      const row: Row = {
        id: uuid(), full_name: body.p_full_name, email: body.p_email, company: body.p_company ?? null,
        project_type: body.p_project_type, budget: body.p_budget ?? null, message: body.p_message,
        preferred_contact: body.p_preferred_contact ?? null, phone: body.p_phone ?? null, status: 'new', read_at: null, created_at: now(), updated_at: now(),
      };
      this.db.contact_messages.unshift(row);
      this.log('received', 'contact_messages', row);
      return this.json(route, 200, { ok: true });
    }
    if (role !== 'admin') return this.json(route, 403, { code: '42501', message: 'not authorized' });
    if (fn === 'media_usage') return this.json(route, 200, this.mediaUsage());
    if (fn === 'media_in_use') {
      const used = this.mediaUsage().find((u) => u.path === body.p_path);
      return this.json(route, 200, used ? used.used_by : null);
    }
    return this.json(route, 404, { message: `unknown rpc ${fn}` });
  }

  mediaUsage() {
    const out: Array<{ path: string; used_by: string }> = [];
    for (const p of this.db.projects) {
      if (p.cover_image_path) out.push({ path: String(p.cover_image_path), used_by: `Project: ${p.title}` });
      for (const g of p.gallery_images as string[]) out.push({ path: g, used_by: `Project gallery: ${p.title}` });
    }
    for (const pr of this.db.profiles) if (pr.avatar_path) out.push({ path: String(pr.avatar_path), used_by: 'Profile image' });
    const s = this.db.site_settings[0];
    for (const k of ['logo_path', 'favicon_path', 'og_image_path']) if (s[k]) out.push({ path: String(s[k]), used_by: k });
    return out;
  }

  private log(action: string, table: string, row: Row) {
    this.db.admin_activity_logs.unshift({
      id: ++seq, actor_id: null, action, entity_type: table, entity_id: String(row.id),
      entity_label: String(row.title ?? row.name ?? row.full_name ?? row.author_name ?? ''), details: {}, created_at: now(),
    });
  }

  // ── PostgREST ─────────────────────────────────────────────────
  private filter(rows: Row[], params: URLSearchParams) {
    const reserved = new Set(['select', 'order', 'limit', 'offset', 'on_conflict', 'columns']);
    let out = rows;
    for (const [key, raw] of params) {
      if (reserved.has(key)) continue;
      const [op, ...rest] = raw.split('.');
      const value = rest.join('.');
      const cmp = (r: Row) => (r[key] === null || r[key] === undefined ? 'null' : String(r[key]));
      if (op === 'eq') out = out.filter((r) => cmp(r) === value);
      else if (op === 'neq') out = out.filter((r) => cmp(r) !== value);
      else if (op === 'is') out = out.filter((r) => cmp(r) === value);
      else if (op === 'in') {
        const set = new Set(value.replace(/^\(|\)$/g, '').split(','));
        out = out.filter((r) => set.has(cmp(r)));
      }
    }
    const order = params.get('order');
    if (order) {
      const keys = order.split(',').map((o) => o.split('.'));
      out = [...out].sort((a, b) => {
        for (const [col, dir] of keys) {
          const av = a[col] as string | number | null;
          const bv = b[col] as string | number | null;
          if (av === bv) continue;
          if (av === null) return 1;
          if (bv === null) return -1;
          const r = av < bv ? -1 : 1;
          return dir === 'desc' ? -r : r;
        }
        return 0;
      });
    }
    const limit = params.get('limit');
    if (limit) out = out.slice(0, Number(limit));
    return out;
  }

  private shape(table: TableName, rows: Row[], select: string | null) {
    return rows.map((r) => {
      let row: Record<string, unknown> = { ...r };
      if (select && !select.startsWith('*')) {
        const cols = select.split(',').map((c) => c.trim()).filter((c) => !c.includes('('));
        row = Object.fromEntries(cols.map((c) => [c, r[c]]));
      }
      if (table === 'projects' && select?.includes('category:categories')) {
        const c = this.db.categories.find((x) => x.id === r.category_id);
        row.category = c ? { id: c.id, name: c.name, slug: c.slug } : null;
      }
      if (table === 'categories' && select?.includes('projects(count)')) {
        row.projects = [{ count: this.db.projects.filter((p) => p.category_id === r.id).length }];
      }
      return row;
    });
  }

  private respondRows(route: Route, table: TableName, rows: Row[], select: string | null) {
    const req = route.request();
    const accept = req.headers()['accept'] ?? '';
    const shaped = this.shape(table, rows, select);
    if (accept.startsWith('application/vnd.pgrst.object+json')) {
      if (shaped.length !== 1) {
        return this.json(route, 406, { code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned', details: `The result contains ${shaped.length} rows` });
      }
      return this.json(route, 200, shaped[0]);
    }
    return this.json(route, 200, shaped, { 'content-range': `0-${Math.max(shaped.length - 1, 0)}/${shaped.length}` });
  }

  private handleRest(route: Route, table: TableName, url: URL) {
    const req = route.request();
    const method = req.method();
    const role = this.role(route);
    const params = url.searchParams;
    const select = params.get('select');
    const rows = this.db[table] as Row[] | undefined;
    if (!rows) return this.json(route, 404, { code: '42P01', message: `relation ${table} does not exist` });

    const visible = role === 'admin' ? rows : rows.filter(PUBLIC_FILTER[table] ?? (() => false));

    if (method === 'GET' || method === 'HEAD') {
      if (role !== 'admin' && (table === 'contact_messages' || table === 'admin_activity_logs')) {
        return this.json(route, 403, { code: '42501', message: `permission denied for table ${table}` });
      }
      const result = this.filter(visible, params);
      if (method === 'HEAD') {
        return route.fulfill({ status: 200, headers: { 'content-range': `*/${result.length}`, 'access-control-allow-origin': '*', 'access-control-expose-headers': 'content-range' } });
      }
      return this.respondRows(route, table, result, select);
    }

    if (role !== 'admin') return this.json(route, 403, { code: '42501', message: 'new row violates row-level security policy' });

    if (method === 'POST') {
      const body = req.postDataJSON();
      const items = (Array.isArray(body) ? body : [body]) as Row[];
      const prefer = req.headers()['prefer'] ?? '';
      const created: Row[] = [];
      for (const item of items) {
        const existing = rows.find((r) => r.id === item.id);
        if (existing && prefer.includes('merge-duplicates')) {
          Object.assign(existing, item, { updated_at: now() });
          created.push(existing);
          continue;
        }
        if ('slug' in item && rows.some((r) => r.slug === item.slug)) {
          return this.json(route, 409, { code: '23505', message: `duplicate key value violates unique constraint "${table}_slug_key"` });
        }
        const row: Row = { created_at: now(), updated_at: now(), ...item, id: item.id ?? uuid() };
        if (table === 'projects' && row.status === 'published' && !row.published_at) row.published_at = now();
        rows.push(row);
        this.log('create', table, row);
        created.push(row);
      }
      return this.respondRows(route, table, created, select);
    }

    const matched = this.filter(rows, params);
    if (method === 'PATCH') {
      const patch = req.postDataJSON() as Partial<Row>;
      if ('slug' in patch && rows.some((r) => r.slug === patch.slug && !matched.includes(r))) {
        return this.json(route, 409, { code: '23505', message: `duplicate key value violates unique constraint "${table}_slug_key"` });
      }
      for (const r of matched) {
        if (table === 'projects' && patch.status === 'published' && r.status !== 'published') r.published_at = now();
        Object.assign(r, patch, { updated_at: now() });
        this.log('update', table, r);
      }
      return this.respondRows(route, table, matched, select);
    }
    if (method === 'DELETE') {
      if (table === 'categories' && matched.some((c) => this.db.projects.some((p) => p.category_id === c.id))) {
        return this.json(route, 409, { code: '23503', message: 'update or delete on table "categories" violates foreign key constraint' });
      }
      (this.db as Record<string, Row[]>)[table] = rows.filter((r) => !matched.includes(r));
      for (const r of matched) this.log('delete', table, r);
      return this.respondRows(route, table, matched, select);
    }
    return this.json(route, 405, {});
  }

  // ── Storage ───────────────────────────────────────────────────
  private handleStorage(route: Route, path: string) {
    const req = route.request();
    const role = this.role(route);
    if (path.startsWith('object/public/media/')) {
      const key = decodeURIComponent(path.slice('object/public/media/'.length));
      if (key.includes('missing')) return route.fulfill({ status: 404, body: '' });
      return route.fulfill({ status: 200, headers: { 'content-type': 'image/png' }, body: PNG_1x1 });
    }
    if (role !== 'admin') return this.json(route, 403, { statusCode: '403', error: 'Unauthorized', message: 'new row violates row-level security policy' });

    if (path === 'object/list/media' && req.method() === 'POST') {
      const { prefix = '' } = (req.postDataJSON() ?? {}) as { prefix?: string };
      const base = prefix ? `${prefix.replace(/\/$/, '')}/` : '';
      const seen = new Map<string, unknown>();
      for (const [key, obj] of this.storage) {
        if (!key.startsWith(base)) continue;
        const rest = key.slice(base.length);
        if (rest.includes('/')) {
          const folder = rest.split('/')[0];
          seen.set(`d:${folder}`, { name: folder, id: null, created_at: null, metadata: null });
        } else {
          seen.set(`f:${rest}`, { name: rest, id: key, created_at: obj.created_at, metadata: { size: obj.size, mimetype: obj.mimetype } });
        }
      }
      return this.json(route, 200, [...seen.values()]);
    }
    if (path.startsWith('object/media/') && req.method() === 'POST') {
      const key = decodeURIComponent(path.slice('object/media/'.length));
      const size = req.postDataBuffer()?.length ?? 0;
      this.storage.set(key, { name: key.split('/').pop()!, created_at: now(), size, mimetype: req.headers()['content-type'] ?? 'image/png' });
      return this.json(route, 200, { Key: `media/${key}`, Id: key });
    }
    if (path === 'object/media' && req.method() === 'DELETE') {
      const { prefixes = [] } = (req.postDataJSON() ?? {}) as { prefixes?: string[] };
      const used = new Set(this.mediaUsage().map((u) => u.path));
      const removed = prefixes.filter((p) => this.storage.has(p) && !used.has(p));
      for (const p of removed) this.storage.delete(p);
      return this.json(route, 200, removed.map((name) => ({ name })));
    }
    return this.json(route, 404, { message: `unknown storage path ${path}` });
  }
}
