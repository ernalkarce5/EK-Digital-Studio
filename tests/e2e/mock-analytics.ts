/**
 * In-memory stand-in for the analytics RPCs (track_page_view, analytics_summary).
 * The real rules (bot filtering, salts, RLS) are tested against Postgres in
 * tests/db/analytics.test.mjs; this mock records what the browser sends and
 * aggregates seeded rows the way the SQL function does.
 */
export interface PageViewRow {
  created_at: string;
  page: string;
  project_slug: string | null;
  source: string;
  referrer_domain: string | null;
  device: string;
  visitor_hash: string;
}
export interface TrackCall {
  p_path: string;
  p_referrer: string | null;
  p_utm: string | null;
  p_device: string | null;
}

const PAGES: Record<string, string> = { '': 'home', '/about': 'about', '/projects': 'projects', '/services': 'services', '/process': 'process', '/contact': 'contact', '/privacy': 'privacy' };

function source(v: string | null): string {
  if (!v) return 'direct';
  if (/(^|\.)google\./.test(v) || v === 'google') return 'google';
  if (/instagram/.test(v)) return 'instagram';
  if (/facebook|fb\./.test(v)) return 'facebook';
  if (/linkedin|lnkd/.test(v)) return 'linkedin';
  return 'other';
}

export class AnalyticsMock {
  rows: PageViewRow[] = [];
  calls: TrackCall[] = [];
  ipSource: { header: string | null; verified_at: string | null } = { header: null, verified_at: null };
  /** Headers received by the verification call (to assert the probe was sent). */
  verifyHeaders: Record<string, string> | null = null;

  /**
   * Simulates a Cloudflare-like gateway: cf-connecting-ip is overwritten with the real IP;
   * x-real-ip and x-forwarded-for keep whatever the client sent.
   */
  verify(marker: string, headers: Record<string, string>) {
    this.verifyHeaders = headers;
    if (headers['x-ek-ip-probe'] !== marker) return null;
    const seen: Record<string, string | undefined> = {
      'cf-connecting-ip': '192.0.2.10',
      'x-real-ip': headers['x-real-ip'],
      'x-forwarded-for:last': headers['x-forwarded-for']?.split(',').pop()?.trim(),
    };
    const checks = Object.entries(seen).map(([header, ip]) => ({ header, present: !!ip, client_controlled: ip === marker }));
    const trusted = checks.find((c) => c.present && !c.client_controlled)?.header ?? null;
    this.ipSource = { header: trusted, verified_at: new Date().toISOString() };
    return { trusted_header: trusted, checks };
  }

  track(body: TrackCall, publishedSlugs: string[], visitor = 'e2e-visitor') {
    this.calls.push(body);
    const path = (body.p_path ?? '').toLowerCase().replace(/\/+$/, '');
    let page = PAGES[path];
    let slug: string | null = null;
    if (!page) {
      const m = /^\/projects\/([a-z0-9-]+)$/.exec(path);
      if (!m || !publishedSlugs.includes(m[1])) return;
      page = 'project';
      slug = m[1];
    }
    const src = body.p_utm ? source(body.p_utm) : body.p_referrer === null ? 'internal' : source(body.p_referrer);
    this.rows.push({
      created_at: new Date().toISOString(), page, project_slug: slug, source: src,
      referrer_domain: src === 'other' ? body.p_referrer : null, device: body.p_device ?? 'desktop', visitor_hash: visitor.padEnd(64, '0'),
    });
  }

  summary(p: { p_from: string; p_to: string; p_grain: string }) {
    const day = (iso: string) => iso.slice(0, 10);
    const inRange = this.rows.filter((r) => day(r.created_at) >= p.p_from && day(r.created_at) <= p.p_to);
    const distinct = (rs: PageViewRow[]) => new Set(rs.map((r) => r.visitor_hash)).size;
    const group = <K extends string>(rs: PageViewRow[], key: (r: PageViewRow) => K | null) => {
      const m = new Map<K, PageViewRow[]>();
      for (const r of rs) {
        const k = key(r);
        if (k != null) m.set(k, [...(m.get(k) ?? []), r]);
      }
      return [...m.entries()].sort((a, b) => b[1].length - a[1].length || String(a[0]).localeCompare(String(b[0])));
    };
    const bucketOf = (d: string) => {
      const date = new Date(`${d}T00:00:00Z`);
      if (p.p_grain === 'month') return `${d.slice(0, 7)}-01`;
      if (p.p_grain === 'week') {
        date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7));
        return date.toISOString().slice(0, 10);
      }
      return d;
    };
    const buckets: string[] = [];
    for (let d = new Date(`${p.p_from}T00:00:00Z`); d.toISOString().slice(0, 10) <= p.p_to; d.setUTCDate(d.getUTCDate() + 1)) {
      const b = bucketOf(d.toISOString().slice(0, 10));
      if (!buckets.includes(b)) buckets.push(b);
    }
    const today = new Date().toISOString().slice(0, 10);
    return {
      timezone: 'UTC',
      retention_months: 13,
      cleanup_scheduled: false,
      ip_source: this.ipSource,
      totals: {
        all_time_views: this.rows.length,
        all_time_visitors: distinct(this.rows),
        today_views: this.rows.filter((r) => day(r.created_at) === today).length,
        month_views: this.rows.filter((r) => r.created_at.slice(0, 7) === today.slice(0, 7)).length,
        first_view_at: this.rows.length ? this.rows.map((r) => r.created_at).sort()[0] : null,
      },
      range: { views: inRange.length, visitors: distinct(inRange), entries: inRange.filter((r) => r.source !== 'internal').length },
      series: buckets.map((b) => {
        const rs = inRange.filter((r) => bucketOf(day(r.created_at)) === b);
        return { bucket: b, views: rs.length, visitors: distinct(rs) };
      }),
      pages: group(inRange, (r) => r.page).map(([page, rs]) => ({ page, views: rs.length, visitors: distinct(rs) })),
      projects: group(inRange, (r) => r.project_slug).slice(0, 10).map(([slug, rs]) => ({ slug, views: rs.length })),
      sources: group(inRange, (r) => (r.source === 'internal' ? null : r.source)).map(([source, rs]) => ({ source, views: rs.length })),
      referrers: group(inRange, (r) => r.referrer_domain).slice(0, 10).map(([domain, rs]) => ({ domain, views: rs.length })),
      devices: group(inRange, (r) => r.device).map(([device, rs]) => ({ device, views: rs.length, visitors: distinct(rs) })),
    };
  }
}
