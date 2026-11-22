// Site settings and profiles.
import { db, publicDb } from '@/lib/supabase';
import { unwrap } from '@/lib/errors';
import type { Profile, PublicProfile, SiteSettings } from '@/types/database';

const PUBLIC_PROFILE_COLUMNS =
  'id, full_name, professional_title, short_intro, biography, background, experience, approach, philosophy, technologies, avatar_path, updated_at';

export async function getSiteSettings(): Promise<SiteSettings | null> {
  const res = await publicDb().from('site_settings').select('*').eq('id', 1).maybeSingle();
  return unwrap(res) as SiteSettings | null;
}

export type SiteSettingsInput = Omit<SiteSettings, 'id' | 'updated_at'>;

export async function saveSiteSettings(input: SiteSettingsInput): Promise<SiteSettings> {
  const res = await db().from('site_settings').upsert({ id: 1, ...input }).select('*').single();
  return unwrap(res) as SiteSettings;
}

/** The single profile flagged is_public (anonymous-safe columns only). */
export async function getPublicProfile(): Promise<PublicProfile | null> {
  const res = await publicDb().from('profiles').select(PUBLIC_PROFILE_COLUMNS).eq('is_public', true).maybeSingle();
  return unwrap(res) as PublicProfile | null;
}

export async function getOwnProfile(userId: string): Promise<Profile | null> {
  const res = await db().from('profiles').select('*').eq('id', userId).maybeSingle();
  return unwrap(res) as Profile | null;
}

export type ProfileInput = Omit<Profile, 'id' | 'is_admin' | 'created_at' | 'updated_at'>;

export async function updateOwnProfile(userId: string, input: Partial<ProfileInput>): Promise<Profile> {
  const res = await db().from('profiles').update(input).eq('id', userId).select('*').single();
  return unwrap(res) as Profile;
}
