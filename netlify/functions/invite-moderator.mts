/**
 * POST /.netlify/functions/invite-moderator
 * Body: { "email": string, "fullName": string }
 * Header: Authorization: Bearer <access token of a signed-in ADMIN>
 *
 * Sends a Supabase Auth invitation and registers the account as a moderator.
 *
 * Security
 *  - The caller must be an admin, verified by Supabase (`is_admin` RPC with the
 *    caller's own token) BEFORE the service-role key is used for anything.
 *  - SUPABASE_SERVICE_ROLE_KEY is read only on the server (Netlify env var,
 *    never VITE_-prefixed, never returned) and used for one call: the invite.
 *  - The moderator row is created through `admin_add_moderator` with the
 *    ADMIN's token, so the database re-checks admin rights and the audit log
 *    records the real actor.
 *
 * Required Netlify environment variables (scope: Functions):
 *   SUPABASE_SERVICE_ROLE_KEY   – Supabase → Project Settings → API (secret)
 *   VITE_SUPABASE_URL           – already set for the site build
 *   VITE_SUPABASE_ANON_KEY      – already set for the site build
 *   VITE_SITE_URL (or Netlify's built-in URL) – for the invite redirect
 */

interface InviteBody {
  email?: unknown;
  fullName?: unknown;
}

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/;

function json(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
}

async function readJson(res: Request | Response): Promise<unknown> {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

function errorMessage(body: unknown, fallback: string): string {
  if (body && typeof body === 'object') {
    const b = body as Record<string, unknown>;
    for (const key of ['message', 'msg', 'error_description', 'error']) {
      if (typeof b[key] === 'string' && b[key]) return b[key] as string;
    }
  }
  return fallback;
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') return json(405, { error: 'method_not_allowed', message: 'Use POST.' });

  const env = process.env;
  const url = (env.SUPABASE_URL || env.VITE_SUPABASE_URL || '').trim().replace(/\/$/, '');
  const anonKey = (env.SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY || '').trim();
  const serviceKey = (env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  const siteUrl = (env.VITE_SITE_URL || env.URL || '').trim().replace(/\/$/, '');
  if (!url || !anonKey || !serviceKey) {
    return json(503, {
      error: 'not_configured',
      message: 'Email invitations are not configured on the server. Add the moderator by linking an existing account instead.',
    });
  }

  const token = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '').trim();
  if (!token) return json(401, { error: 'unauthorized', message: 'Sign in as an administrator.' });

  // 1. Verify the caller is an admin, using THEIR session.
  const adminCheck = await fetch(`${url}/rest/v1/rpc/is_admin`, {
    method: 'POST',
    headers: { apikey: anonKey, authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: '{}',
  });
  if (!adminCheck.ok || (await readJson(adminCheck)) !== true) {
    return json(403, { error: 'forbidden', message: 'Only administrators can invite moderators.' });
  }

  // 2. Validate input.
  const body = ((await readJson(req)) ?? {}) as InviteBody;
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const fullName = typeof body.fullName === 'string' ? body.fullName.trim() : '';
  if (!EMAIL.test(email) || email.length > 254) {
    return json(400, { error: 'validation', field: 'email', message: 'Enter a valid email address.' });
  }
  if (!fullName || fullName.length > 120) {
    return json(400, { error: 'validation', field: 'fullName', message: 'Enter the moderator’s name (max 120 characters).' });
  }

  // 3. Send the invitation (the only call that uses the service-role key).
  const redirect = siteUrl ? `?redirect_to=${encodeURIComponent(`${siteUrl}/moderator/set-password`)}` : '';
  const invite = await fetch(`${url}/auth/v1/invite${redirect}`, {
    method: 'POST',
    headers: { apikey: serviceKey, authorization: `Bearer ${serviceKey}`, 'content-type': 'application/json' },
    body: JSON.stringify({ email, data: { full_name: fullName, role: 'moderator' } }),
  });
  let invited = true;
  if (!invite.ok) {
    const inviteBody = await readJson(invite);
    const msg = errorMessage(inviteBody, '');
    // Existing account: no email is sent, but it can still be linked as a moderator.
    if (invite.status === 422 && /already|registered|exists/i.test(msg)) {
      invited = false;
    } else {
      return json(502, { error: 'invite_failed', message: msg || 'The invitation could not be sent. Check the Supabase email settings.' });
    }
  }

  // 4. Register as moderator with the ADMIN's token (database re-checks admin rights).
  const link = await fetch(`${url}/rest/v1/rpc/admin_add_moderator`, {
    method: 'POST',
    headers: {
      apikey: anonKey,
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
      accept: 'application/vnd.pgrst.object+json',
    },
    body: JSON.stringify({ p_email: email, p_full_name: fullName }),
  });
  const linked = await readJson(link);
  if (!link.ok) {
    return json(link.status === 403 ? 403 : 400, {
      error: 'link_failed',
      message: errorMessage(linked, 'The account could not be registered as a moderator.'),
    });
  }

  return json(200, { ok: true, invited, moderator: linked });
}
