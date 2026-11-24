import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { getPublicProfile, getSiteSettings } from '@/services/site';
import { isSupabaseConfigured } from '@/lib/supabase';
import { mediaUrl } from '@/lib/storage';
import { cacheLogo } from '@/lib/brand';
import { publicErrorMessage } from '@/lib/errors';
import type { PublicProfile, SiteSettings } from '@/types/database';

/** Used until settings load, and if the database is unreachable. Mirrors the seed migration. */
export const DEFAULT_SETTINGS: SiteSettings = {
  id: 1,
  website_name: 'Ernal Karce',
  studio_name: 'EK Digital Studio',
  tagline: 'Web Developer & Digital Solutions Designer',
  description:
    'Ernal Karce designs and builds fast, considered websites and web applications for individuals, startups and growing businesses.',
  hero_heading: 'We Build Digital Experiences That Move Businesses Forward.',
  hero_subheading:
    'Design-led websites and web applications, built carefully from first sketch to launch, for people who want their online presence to work as hard as they do.',
  logo_path: null,
  favicon_path: null,
  og_image_path: null,
  seo_title: 'Ernal Karce — EK Digital Studio',
  seo_description:
    'Web design and development studio of Ernal Karce. Websites, booking systems and custom web applications built with care.',
  contact_email: null,
  contact_phone: null,
  whatsapp_number: null,
  location: null,
  social_links: {},
  footer_text: '',
  availability_status: 'available',
  availability_note: '',
  updated_at: new Date(0).toISOString(),
};

interface SiteContextValue {
  settings: SiteSettings;
  profile: PublicProfile | null;
  /** True once real settings were loaded from the database (not just defaults). */
  settingsLoaded: boolean;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

const SiteContext = createContext<SiteContextValue | null>(null);

export function SiteProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<SiteSettings>(DEFAULT_SETTINGS);
  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [loading, setLoading] = useState(isSupabaseConfigured);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!isSupabaseConfigured) return;
    try {
      const [s, p] = await Promise.all([getSiteSettings(), getPublicProfile()]);
      if (s) {
        setSettings({ ...DEFAULT_SETTINGS, ...s, social_links: s.social_links ?? {} });
        setSettingsLoaded(true);
      }
      setProfile(p);
      setError(null);
    } catch (err) {
      setError(publicErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Remember the logo URL so the next visit (and the startup splash) can show it immediately.
  useEffect(() => {
    if (settingsLoaded) cacheLogo(mediaUrl(settings.logo_path));
  }, [settingsLoaded, settings.logo_path]);

  // Apply a custom favicon from settings.
  useEffect(() => {
    const href = mediaUrl(settings.favicon_path);
    if (!href) return;
    let link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
    if (!link) {
      link = document.createElement('link');
      link.rel = 'icon';
      document.head.appendChild(link);
    }
    link.removeAttribute('type');
    link.href = href;
  }, [settings.favicon_path]);

  return (
    <SiteContext.Provider value={{ settings, profile, settingsLoaded, loading, error, refresh }}>
      {children}
    </SiteContext.Provider>
  );
}

export function useSite(): SiteContextValue {
  const ctx = useContext(SiteContext);
  if (!ctx) throw new Error('useSite must be used inside SiteProvider');
  return ctx;
}
