import { useEffect } from 'react';
import { useLocation } from 'react-router';
import { useSite } from '@/contexts/SiteContext';
import { mediaUrl } from '@/lib/storage';

const SITE_URL = (import.meta.env.VITE_SITE_URL || '').replace(/\/$/, '');

function setMeta(attr: 'name' | 'property', key: string, content: string | null) {
  let el = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`);
  if (!content) {
    el?.remove();
    return;
  }
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute('content', content);
}

function setCanonical(href: string) {
  let el = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  if (!el) {
    el = document.createElement('link');
    el.rel = 'canonical';
    document.head.appendChild(el);
  }
  el.href = href;
}

/**
 * Per-page title, description, canonical URL and Open Graph / Twitter tags.
 * Pass `title` without the site name; it is appended automatically.
 */
export function Seo({
  title,
  description,
  image,
  type = 'website',
  noindex = false,
}: {
  title?: string;
  description?: string;
  /** Storage path or absolute URL. */
  image?: string | null;
  type?: 'website' | 'article';
  noindex?: boolean;
}) {
  const { settings } = useSite();
  const { pathname } = useLocation();

  useEffect(() => {
    const siteTitle = settings.seo_title || `${settings.website_name} — ${settings.studio_name}`;
    const fullTitle = title ? `${title} — ${settings.website_name}` : siteTitle;
    const desc = description || settings.seo_description || settings.description;
    const origin = SITE_URL || window.location.origin;
    const url = `${origin}${pathname === '/' ? '' : pathname}` || origin;
    // Page image → Site Settings share image → built-in default (public/og-image.png).
    const img = mediaUrl(image ?? settings.og_image_path) ?? `${origin}/og-image.png`;

    document.title = fullTitle;
    setMeta('name', 'description', desc);
    setMeta('name', 'robots', noindex ? 'noindex, nofollow' : 'index, follow');
    setCanonical(url);
    setMeta('property', 'og:site_name', settings.studio_name);
    setMeta('property', 'og:title', fullTitle);
    setMeta('property', 'og:description', desc);
    setMeta('property', 'og:type', type);
    setMeta('property', 'og:url', url);
    setMeta('property', 'og:image', img);
    setMeta('name', 'twitter:card', 'summary_large_image');
    setMeta('name', 'twitter:title', fullTitle);
    setMeta('name', 'twitter:description', desc);
    setMeta('name', 'twitter:image', img);
  }, [title, description, image, type, noindex, pathname, settings]);

  return null;
}
