import { publicClient } from './supabase';

/**
 * Privacy-first page-view tracking for the PUBLIC website only.
 *
 * - Nothing is stored on the visitor's device (no cookies, no local storage, no identifiers).
 *   The database derives an anonymous, daily-rotating visitor hash itself (see the
 *   20261124000001_website_analytics migration) and never stores the IP or user agent.
 * - Respects Do-Not-Track and Global Privacy Control.
 * - Fire-and-forget: never delays rendering and never shows errors to visitors.
 */

export type DeviceClass = 'mobile' | 'tablet' | 'desktop';

export function deviceClass(): DeviceClass {
  const ua = navigator.userAgent;
  // iPadOS reports a desktop Mac user agent; touch support gives it away.
  if (/iPad|Tablet/i.test(ua) || (/Android/i.test(ua) && !/Mobi/i.test(ua)) || (/Macintosh/i.test(ua) && navigator.maxTouchPoints > 1)) {
    return 'tablet';
  }
  if (/Mobi|iPhone|Android/i.test(ua)) return 'mobile';
  return 'desktop';
}

/**
 * "Don't count my visits" (Privacy Policy page). Stored as a single local-storage flag on the
 * visitor's own device; nothing is sent anywhere. Storing it is strictly necessary to honour
 * the visitor's explicit request, so it needs no separate consent.
 */
export const OPT_OUT_KEY = 'ek-analytics-opt-out';

export function isOptedOut(): boolean {
  try {
    return localStorage.getItem(OPT_OUT_KEY) === '1';
  } catch {
    return false;
  }
}

/** Returns false if the choice could not be saved (storage blocked). */
export function setOptedOut(optOut: boolean): boolean {
  try {
    if (optOut) localStorage.setItem(OPT_OUT_KEY, '1');
    else localStorage.removeItem(OPT_OUT_KEY);
    return true;
  } catch {
    return false;
  }
}

export function trackingAllowed(): boolean {
  const nav = navigator as Navigator & { globalPrivacyControl?: boolean; doNotTrack?: string | null };
  const w = window as Window & { doNotTrack?: string | null };
  if (isOptedOut()) return false;
  if (nav.globalPrivacyControl === true) return false;
  if (nav.doNotTrack === '1' || nav.doNotTrack === 'yes' || w.doNotTrack === '1') return false;
  return true;
}

/** Referrer host of the landing page; '' when direct or from this site. */
function entryReferrer(): string {
  try {
    if (!document.referrer) return '';
    const host = new URL(document.referrer).hostname.toLowerCase();
    return host === window.location.hostname.toLowerCase() ? '' : host.slice(0, 100);
  } catch {
    return '';
  }
}

function utmSource(): string | null {
  const v = new URLSearchParams(window.location.search).get('utm_source');
  return v ? v.trim().slice(0, 60) : null;
}

let entrySent = false;
let lastPath: string | null = null;
let lastAt = 0;

/** Records one view of `path`. The first view of a page load carries the entry source. */
export function trackPageView(path: string) {
  if (!publicClient || !trackingAllowed()) return;
  if (document.visibilityState === 'hidden' && !entrySent) return; // prerendered / background tab
  const now = Date.now();
  // Client-side duplicate guard (React StrictMode, repeated effects); the database also de-duplicates.
  if (path === lastPath && now - lastAt < 2000) return;
  lastPath = path;
  lastAt = now;

  const first = !entrySent;
  entrySent = true;
  void publicClient
    .rpc('track_page_view', {
      p_path: path,
      p_referrer: first ? entryReferrer() : null,
      p_utm: first ? utmSource() : null,
      p_device: deviceClass(),
    })
    .then(
      () => undefined,
      () => undefined,
    );
}
