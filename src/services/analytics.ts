import { db, SUPABASE_URL } from '@/lib/supabase';

export type AnalyticsGrain = 'day' | 'week' | 'month';
export type AnalyticsPage = 'home' | 'about' | 'projects' | 'project' | 'services' | 'process' | 'contact' | 'privacy';
export type AnalyticsSource = 'direct' | 'google' | 'bing' | 'duckduckgo' | 'yahoo' | 'instagram' | 'facebook' | 'linkedin' | 'x' | 'other';
export type AnalyticsDevice = 'mobile' | 'tablet' | 'desktop';

export interface IpSourceCheck {
  header: 'cf-connecting-ip' | 'x-real-ip' | 'x-forwarded-for:last';
  present: boolean;
  client_controlled: boolean;
}
export interface IpVerification {
  trusted_header: IpSourceCheck['header'] | null;
  checks: IpSourceCheck[];
}

export interface AnalyticsSummary {
  timezone: string;
  retention_months: number;
  cleanup_scheduled: boolean;
  ip_source: { header: IpSourceCheck['header'] | null; verified_at: string | null };
  totals: {
    all_time_views: number;
    all_time_visitors: number;
    today_views: number;
    month_views: number;
    first_view_at: string | null;
  };
  range: { views: number; visitors: number; entries: number };
  series: Array<{ bucket: string; views: number; visitors: number }>;
  pages: Array<{ page: AnalyticsPage; views: number; visitors: number }>;
  projects: Array<{ slug: string; views: number }>;
  sources: Array<{ source: AnalyticsSource; views: number }>;
  referrers: Array<{ domain: string; views: number }>;
  devices: Array<{ device: AnalyticsDevice; views: number; visitors: number }>;
}

/** Aggregated analytics (admins only; enforced by the database). Dates are inclusive, YYYY-MM-DD. */
export async function getAnalyticsSummary(from: string, to: string, grain: AnalyticsGrain): Promise<AnalyticsSummary> {
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  const { data, error } = await db().rpc('analytics_summary', { p_from: from, p_to: to, p_grain: grain, p_tz: tz });
  if (error) throw error;
  return data as AnalyticsSummary;
}

/**
 * Verifies, on the real infrastructure, which IP header the gateway overwrites. The request
 * carries the same random test IP in every candidate header plus x-ek-ip-probe; the database
 * trusts only a header that does NOT contain the test IP (see analytics_verify_ip_source).
 * Must be a raw fetch: supabase-js cannot add per-request headers to an RPC call.
 */
export async function verifyIpSource(): Promise<IpVerification> {
  const { data } = await db().auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error('Your session has expired. Sign in again.');
  const marker = `203.0.113.${1 + Math.floor(Math.random() * 250)}`;
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/analytics_verify_ip_source`, {
    method: 'POST',
    headers: {
      apikey: import.meta.env.VITE_SUPABASE_ANON_KEY ?? '',
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
      'cf-connecting-ip': marker,
      'x-real-ip': marker,
      'x-forwarded-for': marker,
      'x-ek-ip-probe': marker,
    },
    body: JSON.stringify({ p_marker: marker }),
  });
  const body = (await res.json().catch(() => null)) as (IpVerification & { message?: string }) | null;
  if (!res.ok || !body) throw new Error(body?.message ?? 'The verification request failed.');
  return body;
}

export const IP_HEADER_LABELS: Record<IpSourceCheck['header'], string> = {
  'cf-connecting-ip': 'CF-Connecting-IP',
  'x-real-ip': 'X-Real-IP',
  'x-forwarded-for:last': 'X-Forwarded-For (last entry)',
};

export const PAGE_LABELS: Record<AnalyticsPage, string> = {
  home: 'Home',
  about: 'About',
  projects: 'Projects',
  project: 'Project details',
  services: 'Services',
  process: 'Process',
  contact: 'Contact',
  privacy: 'Privacy Policy',
};

export const SOURCE_LABELS: Record<AnalyticsSource, string> = {
  direct: 'Direct',
  google: 'Google',
  bing: 'Bing',
  duckduckgo: 'DuckDuckGo',
  yahoo: 'Yahoo',
  instagram: 'Instagram',
  facebook: 'Facebook',
  linkedin: 'LinkedIn',
  x: 'X (Twitter)',
  other: 'Other websites',
};

export const DEVICE_LABELS: Record<AnalyticsDevice, string> = {
  mobile: 'Mobile',
  desktop: 'Desktop',
  tablet: 'Tablet',
};
