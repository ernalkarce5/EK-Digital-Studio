# Ernal Karce — EK Digital Studio

Personal portfolio and web development studio website with a built-in CMS.
The public site presents projects, services and the collaboration process and collects project inquiries. A protected admin dashboard manages every piece of content.

- **Public site:** Home, About, Projects (filter + search), Project details (`/projects/:slug`), Services, Process, Contact, 404
- **Admin (`/admin`):** Dashboard, Projects, Categories, Services, Messages, Testimonials, Media Library, Profile, Site Settings
- **Backend:** Supabase (Postgres + Row Level Security, Auth, Storage). No custom server.

## Tech stack

| Layer | Tools |
| --- | --- |
| Frontend | React 19, Vite 8, TypeScript 7, Tailwind CSS 4, React Router 8, Framer Motion, Lucide icons |
| Forms | React Hook Form + Zod |
| Backend | Supabase: PostgreSQL, RLS, Auth, Storage |
| Hosting | Netlify (static SPA) + GitHub |
| Testing | Playwright (end-to-end), PGlite (database/RLS tests) |

## Project structure

```
src/
  components/
    admin/      Admin layout, panels, image/gallery fields, tag input
    dashboard/  Shared dashboard shell (sidebar, role guard, notification bell) for admin and moderator
    leads/      Lead workspace: status badge, lists, brief form, client info, communication, notes, dialogs
    moderator/  Moderator layout (navigation)
    common/     Button, Badge, Modal/ConfirmDialog, Seo, Reveal, SmartImage, feedback states…
    forms/      Field primitives, ContactForm
    home/       Hero visual
    layout/     Navbar, Footer, PublicLayout
    projects/   ProjectCard
  contexts/     Auth, Site (settings + public profile), Theme, Toast
  hooks/        useAsync (loading / error / data / reload)
  lib/          Supabase clients, storage helpers, errors, constants, utils
  pages/        One folder per public page, Admin/ for the dashboard, Moderator/ and Notifications/
  services/     Data access per table (all Supabase queries live here)
  styles/       Tailwind entry + design tokens (dark/light)
  types/        Row types mirroring the database
supabase/migrations/  Schema, security (RLS + RPCs), storage, seed
netlify/functions/    invite-moderator (server-side; the only code that uses the service-role key)
scripts/              Sitemap generator (runs after build)
tests/db/             RLS + RPC tests against real Postgres (PGlite)
tests/e2e/            Playwright suite + in-memory Supabase API mock (mock-leads.ts emulates the moderator schema)
tests/functions/      Tests for the Netlify function (authorisation, no key leakage)
```

## Getting started

Requirements: Node.js 20+ (22 recommended) and a Supabase project.

```bash
npm install
cp .env.example .env      # then fill in the values
npm run dev               # http://localhost:5173
```

| Command | Purpose |
| --- | --- |
| `npm run dev` | Development server |
| `npm run build` | Type-check, production build to `dist/`, generate `sitemap.xml` |
| `npm run preview` | Serve the production build locally |
| `npm run typecheck` | TypeScript only |
| `npm run test:db` | Apply all migrations to an in-process Postgres and test RLS, RPCs and constraints |
| `npm run test:e2e` | Playwright end-to-end suite (first run: `npx playwright install chromium`). Builds to `dist-e2e/` and writes `test-results/`; both are git-ignored and safe to delete |
| `npm run test:functions` | Tests for the `invite-moderator` Netlify function (Supabase calls are stubbed) |

## Environment variables

| Variable | Required | Description |
| --- | --- | --- |
| `VITE_SUPABASE_URL` | yes | Project URL (Supabase → Project Settings → API) |
| `VITE_SUPABASE_ANON_KEY` | yes | The **anon / publishable** key. Safe in the browser because RLS protects every table. |
| `VITE_SITE_URL` | yes for production | Canonical origin without trailing slash, e.g. `https://ernalkarce.com`. Used for canonical/OG URLs, the sitemap and password-reset links. |
| `VITE_SUPABASE_MEDIA_BUCKET` | no | Storage bucket name, defaults to `media` |

Server-side only (Netlify → Environment variables, scope **Functions**, never in `.env` files or the repository):

| Variable | Required | Description |
| --- | --- | --- |
| `SUPABASE_SERVICE_ROLE_KEY` | only for email invitations | Used exclusively by `netlify/functions/invite-moderator` to send Supabase invite emails, after the caller is verified as admin. Without it, moderators are added with "Link existing account". |

The function reads the project URL and anon key from `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` (or `SUPABASE_URL` / `SUPABASE_ANON_KEY`), and the site origin from `VITE_SITE_URL`.

> **Never** put the `service_role` key in any `VITE_` variable or in the repository. `VITE_` variables are compiled into the public JavaScript. The browser app never uses the service-role key.

## Supabase setup

### 1. Create the project and run the migrations

Create a project at [supabase.com](https://supabase.com). Then apply the six files in `supabase/migrations/` **in order**, using either method:

- **SQL Editor:** paste and run each file: `…01_schema.sql`, `…02_security.sql`, `…03_storage.sql`, `…04_seed.sql`, `…22000001_contact_phone_and_settings_consolidation.sql`, `…23000001_moderators_and_lead_management.sql`.
  - An existing production database only needs the **last** file. It adds new tables, functions and one extra read policy on `contact_messages`; it does not change or drop existing data or policies.
- **Supabase CLI:** `supabase link --project-ref <ref>` then `supabase db push`.

This creates:

| Table | Purpose |
| --- | --- |
| `profiles` | Administrator accounts (`is_admin`) and the public personal profile (`is_public`): name, title, biography, About-page sections, portrait |
| `projects` | Portfolio projects with unique slug, draft/published status, type (demo/personal/client) |
| `categories` | Project categories (`on delete restrict`: categories in use cannot be removed) |
| `services` | Service offerings |
| `contact_messages` | Inquiries, including an optional phone number (written only through the `submit_contact_message` RPC) |
| `testimonials` | Client testimonials (seeded **empty**) |
| `site_settings` | Single row of global settings. The **only** place for availability, contact email/phone/WhatsApp, location and social links |
| `admin_activity_logs` | Activity feed, written by database triggers |
| `moderators` | Moderator accounts (linked to `auth.users`), active/inactive |
| `lead_assignments` | Assignment history per inquiry; exactly one current row (`released_at is null`) per message |
| `lead_clients` | Client details collected by the moderator (one row per inquiry) |
| `project_briefs` | Structured project brief (one row per inquiry), submit/approve stamps |
| `communication_logs` | Manually recorded emails, Instagram messages, calls and replies |
| `lead_notes` | Notes shared between admin and moderator, admin-only notes, help requests |
| `internal_notifications` | In-dashboard notifications with read/unread state |
| `lead_activity_logs` | Audit log of every lead action (written only by database functions and triggers) |

The seed adds the six categories, the seven service descriptions and default site settings. It adds **no** projects or testimonials; those must be real and are added from the dashboard.

### 2. Configure authentication

In **Authentication → Providers → Email**:

- **Disable "Allow new users to sign up".** There is no public registration. RLS also grants nothing to non-admin accounts, as a second safeguard.

In **Authentication → URL Configuration**:

- **Site URL:** your production URL (e.g. `https://ernalkarce.com`)
- **Redirect URLs:** add `https://ernalkarce.com/admin/reset-password` and `https://ernalkarce.com/moderator/set-password` and, for local development, the same paths on `http://localhost:5173`

Supabase's built-in email sender is rate-limited and meant for testing. For reliable password-reset emails, configure custom SMTP under **Authentication → Emails → SMTP Settings**.

### 3. Create the administrator account

Credentials are never stored in code. Create the account in Supabase, then grant it admin rights with SQL:

1. **Authentication → Users → Add user → Create new user.** Enter your email and a strong password, and tick *Auto Confirm User*.
2. In the **SQL Editor**, run (replace the email):

```sql
insert into public.profiles (id, is_admin, is_public, full_name, professional_title)
select id, true, true, 'Ernal Karce', 'Web Developer & Digital Solutions Designer'
from auth.users
where email = 'you@example.com'
on conflict (id) do update set is_admin = true;
```

3. Sign in at `/admin/login`, then complete **Profile** (personal content) and **Site Settings** (availability, contact details, social links, branding, SEO).

To revoke access later:

```sql
update public.profiles set is_admin = false
where id = (select id from auth.users where email = 'you@example.com');
```

### 4. Moderators

Moderators follow up on inquiries the admin assigns to them. They sign in at `/moderator/login` and only ever see their own leads. Add them in **Admin → Moderators → Add moderator**, in one of two ways:

- **Send email invitation** (needs `SUPABASE_SERVICE_ROLE_KEY` on Netlify and working Supabase email, ideally custom SMTP). Supabase emails a link to `/moderator/set-password`, where the moderator chooses a password. The **Invite user** email template (Authentication → Emails) can be reworded; keep `{{ .ConfirmationURL }}`.
- **Link existing account** (no extra setup). Create the user in **Authentication → Users → Add user** (tick *Auto Confirm User*), then add them in the dashboard with the same email. Share the password with them securely; they can change it under Profile & Settings.

The dashboard is the recommended way: it refuses admin accounts and logs the action. As a fallback, the SQL Editor (which runs as the database owner) can link an existing user directly. Replace the name and email:

```sql
insert into public.moderators (id, full_name, email)
select id, 'Mila Example', email from auth.users where email = 'mila@example.com';
```

Moderators can never grant themselves admin rights or reactivate themselves: `profiles.is_admin` and `moderators.is_active` are writable only by admins.

**Workflow:** Messages → *Assign to Moderator* → the moderator records communication, client details and a project brief → *Submit to Admin* → the admin approves or requests changes (the lead goes back to the moderator) → the moderator archives it. The admin can transfer or retrieve a lead or override its status at any time, under **Assignments** or on the lead page. Every step is written to the activity log and notifies the other side in the dashboard (bell icon; no emails are sent).

### 5. Storage

The storage migration creates a public `media` bucket (5 MB limit; JPEG/PNG/WebP/AVIF/GIF/ICO). Anyone can read images by URL. Only admins can list, upload or delete. An image referenced by a project, testimonial, profile or site settings **cannot be deleted**; this is enforced by a storage policy, not only in the UI. Large JPEG/PNG uploads are resized (max 2400 px) and converted to WebP in the browser before upload.

## Security model

- **Admin = `profiles.is_admin`, verified in Postgres** via `public.is_admin()`. Every write policy and storage policy checks it. Being logged in is not enough.
- **Anonymous visitors** can read only published projects, categories, services and testimonials, the site settings, and a whitelisted set of public profile columns. They cannot read inquiries or activity logs, or write to any table.
- **Contact form** submits through `submit_contact_message()`, a `security definer` function that:
  - re-validates every field server-side, including the phone number (required when phone or WhatsApp is the preferred contact method)
  - strips HTML and control characters
  - discards honeypot and too-fast (bot) submissions
  - rate-limits to 5 messages/hour per IP (stored only as a hash), 3/hour per email and 100/hour globally
- **Activity logs** are written by triggers, so the dashboard feed cannot be forged from the client.
- Public pages use a separate session-less Supabase client. An admin session in another tab can therefore never stall the public site.
- Public visitors never see technical errors or configuration names. If the backend is unreachable or not configured, pages show a neutral "temporarily unavailable" message.
- **HTTP headers** (`netlify.toml`): Content-Security-Policy, HSTS, `X-Frame-Options`, `nosniff`, Referrer-Policy, Permissions-Policy and COOP. The CSP allows scripts and fonts only from the site itself and network/image requests only to `*.supabase.co`. **If you use a Supabase custom domain, add it to `img-src` and `connect-src`.** `style-src` includes `'unsafe-inline'` because animations set inline `style` attributes.

- **Moderator = an active row in `public.moderators`**, verified by `public.is_moderator()`. A moderator can read **only** the inquiries currently assigned to them (one added `select` policy on `contact_messages`) and the lead data for those inquiries. They can edit client details and the brief only while the lead is in an active status, and add communication records and notes. All of these are stamped with their identity by triggers.
- **Ownership and status changes** (assign, transfer, retrieve, return, status, submit, review) go only through `security definer` functions that check the caller's role and validate the status transition. Moderators have no direct write access to assignments, activity logs or other people's notifications. Column grants block writes to stamp fields such as `submitted_at`, `approved_at`, `email` and `is_active`.
- **Inquiries with lead history cannot be deleted** (`on delete restrict`), so the original message is always preserved. Archive them instead.
- **The service-role key** lives only in the Netlify function, which verifies the caller is an admin (with the caller's own token) before using it.

`npm run test:db` verifies these rules against real Postgres (42 site checks + 45 moderator/lead checks).

## Deployment (Netlify + GitHub)

1. Push the repository to GitHub.
2. In Netlify: **Add new site → Import from Git** and choose the repository. `netlify.toml` already sets the build command (`npm run build`), the publish directory (`dist`), Node 22, SPA redirects for React Router, security headers, `noindex` for `/admin` and `/moderator`, and the `netlify/functions` directory.
3. **Site configuration → Environment variables:** add `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` and `VITE_SITE_URL`. For moderator email invitations, also add `SUPABASE_SERVICE_ROLE_KEY` with the scope limited to **Functions** (mark it as secret).
4. Deploy. Then add the Netlify URL (or custom domain) to Supabase's Site URL and Redirect URLs (see step 2 above).

**Sitemap:** `sitemap.xml` is generated at build time and includes published projects. After publishing new projects, trigger a redeploy. A Netlify **Build hook** URL (Site configuration → Build & deploy) makes this a single click or request.

## Content guidelines built into the dashboard

- Projects have a required **type**: Demo, Personal or Client. Demo projects carry a visible badge and a notice on their page, so they are never presented as commissioned client work.
- Publishing a testimonial requires confirming that it is genuine and that you have permission to publish it.
- About-page sections that are left empty are hidden instead of being filled with placeholder claims.

## Privacy, fonts and share images

- **Privacy Policy** (`/privacy`, `src/pages/Privacy/PrivacyPage.tsx`) describes what the site actually does: contact-form fields, phone only when requested, hashed IP and user agent for spam protection, no analytics or tracking cookies, and Supabase/Netlify as processors. The controller name, email and location come from Site Settings. **Have it reviewed for your jurisdiction**, confirm the Supabase region you chose, and update `PRIVACY_LAST_UPDATED` whenever the text changes.
- **Fonts** are self-hosted in `public/fonts` (SIL Open Font License; see `public/fonts/LICENSE.txt`). No request goes to Google.
- **Default share image:** `public/og-image.png` (1200×630), used when no image is set in Site Settings. **Apple touch icon:** `public/apple-touch-icon.png`.

## Known limitations

- **Social previews for project pages:** this is a client-rendered SPA. Google renders JavaScript and sees per-page titles and descriptions. Link-preview bots (WhatsApp, LinkedIn, X) do not, so they show the site-wide tags from `index.html`. Per-page previews would need prerendering or an edge function.
- **Email notifications for new inquiries are not set up.** Inquiries are stored and shown in the dashboard, which displays an unread count. To get email alerts, add a Supabase Database Webhook on `contact_messages` inserts that calls an email provider (e.g. Resend) from an Edge Function.
- **Sitemap** updates on rebuild, not instantly on publish (see Deployment).
- **IP rate limiting** depends on the `x-forwarded-for` header Supabase passes to PostgREST. The per-email and global limits apply regardless.
- **Moderator communication is recorded, not sent.** "Open email draft" opens the moderator's own mail app; nothing is sent from the dashboard, and replies are not imported automatically.
- **Notifications are in-dashboard only** and refresh on navigation and every 60 seconds (no realtime subscription, no emails).
- **Moderators can read the whole assigned inquiry row**, including the hashed IP and user agent stored for spam protection. These are not shown in the moderator UI.
- **On transfer, the lead keeps its status and data**; the new moderator continues where the previous one stopped.
