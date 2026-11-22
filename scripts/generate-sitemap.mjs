// Generates dist/sitemap.xml and finalises dist/robots.txt after `vite build`.
// Static routes are always included; published project pages are fetched from
// Supabase with the public anon key (RLS limits this to published rows).
// Re-deploy (e.g. via a Netlify build hook) after publishing new projects.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { loadEnv } from 'vite';

const env = { ...loadEnv('production', process.cwd(), 'VITE_'), ...process.env };
const site = (env.VITE_SITE_URL || '').replace(/\/$/, '');
const supabaseUrl = (env.VITE_SUPABASE_URL || '').replace(/\/$/, '');
const anonKey = env.VITE_SUPABASE_ANON_KEY || '';
const dist = join(process.cwd(), 'dist');

const STATIC_ROUTES = [
  { path: '/', priority: '1.0', changefreq: 'weekly' },
  { path: '/projects', priority: '0.9', changefreq: 'weekly' },
  { path: '/services', priority: '0.8', changefreq: 'monthly' },
  { path: '/about', priority: '0.7', changefreq: 'monthly' },
  { path: '/process', priority: '0.6', changefreq: 'monthly' },
  { path: '/contact', priority: '0.7', changefreq: 'yearly' },
  { path: '/privacy', priority: '0.2', changefreq: 'yearly' },
];

const escapeXml = (s) =>
  s.replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' })[c]);

async function fetchProjects() {
  if (!supabaseUrl || !anonKey || supabaseUrl.includes('your-project-ref')) {
    console.warn('[sitemap] Supabase env vars missing: project pages not included.');
    return [];
  }
  try {
    const res = await fetch(
      `${supabaseUrl}/rest/v1/projects?select=slug,updated_at&status=eq.published&order=display_order.asc`,
      { headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}` }, signal: AbortSignal.timeout(10000) },
    );
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (err) {
    console.warn(`[sitemap] Could not fetch projects (${err.message}): project pages not included.`);
    return [];
  }
}

if (!existsSync(dist)) {
  console.error('[sitemap] dist/ not found. Run vite build first.');
  process.exit(1);
}

const robotsPath = join(dist, 'robots.txt');
let robots = readFileSync(robotsPath, 'utf8');

if (!site) {
  console.warn('[sitemap] VITE_SITE_URL is not set: sitemap.xml skipped (absolute URLs are required).');
  robots = robots.replace(/^Sitemap:.*$/m, '').trimEnd() + '\n';
  writeFileSync(robotsPath, robots);
  process.exit(0);
}

const projects = await fetchProjects();
const urls = [
  ...STATIC_ROUTES.map((r) => ({ loc: `${site}${r.path === '/' ? '/' : r.path}`, ...r })),
  ...projects.map((p) => ({
    loc: `${site}/projects/${encodeURIComponent(p.slug)}`,
    lastmod: p.updated_at?.slice(0, 10),
    changefreq: 'monthly',
    priority: '0.8',
  })),
];

const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls
  .map(
    (u) =>
      `  <url>\n    <loc>${escapeXml(u.loc)}</loc>\n${u.lastmod ? `    <lastmod>${u.lastmod}</lastmod>\n` : ''}    <changefreq>${u.changefreq}</changefreq>\n    <priority>${u.priority}</priority>\n  </url>`,
  )
  .join('\n')}
</urlset>
`;

writeFileSync(join(dist, 'sitemap.xml'), xml);
writeFileSync(robotsPath, robots.replace(/^Sitemap:.*$/m, `Sitemap: ${site}/sitemap.xml`));
console.log(`[sitemap] Wrote ${urls.length} URLs (${projects.length} projects) to dist/sitemap.xml`);
