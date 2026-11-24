/**
 * Brand helpers shared by the logo, the loaders and the startup splash in index.html.
 *
 * The logo is the image uploaded in Site Settings. Its public URL is cached in localStorage so the
 * next visit can show it immediately (public/theme-init.js reads the same key for the splash),
 * instead of showing the EK fallback until the settings request returns.
 */

export const LOGO_CACHE_KEY = 'ek-logo-url';

export function readCachedLogo(): string | null {
  try {
    const v = localStorage.getItem(LOGO_CACHE_KEY);
    return v && /^https?:\/\//.test(v) ? v : null;
  } catch {
    return null;
  }
}

export function cacheLogo(url: string | null) {
  try {
    if (url) localStorage.setItem(LOGO_CACHE_KEY, url);
    else localStorage.removeItem(LOGO_CACHE_KEY);
  } catch {
    /* storage unavailable */
  }
}

/** Fades out and removes the static splash from index.html once React has rendered. */
export function hideSplash() {
  const el = document.getElementById('ek-splash');
  if (!el || el.dataset.state === 'out') return;
  el.dataset.state = 'out';
  const remove = () => el.remove();
  el.addEventListener('transitionend', remove, { once: true });
  window.setTimeout(remove, 600); // fallback (reduced motion: no transition event)
}
