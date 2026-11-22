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
    common/     Button, Badge, Modal/ConfirmDialog, Seo, Reveal, SmartImage, feedback states…
    forms/      Field primitives, ContactForm
    home/       Hero visual
    layout/     Navbar, Footer, PublicLayout
    projects/   ProjectCard
  contexts/     Auth, Site (settings + public profile), Theme, Toast
  hooks/        useAsync (loading / error / data / reload)
  lib/          Supabase clients, storage helpers, errors, constants, utils
  pages/        One folder per public page, Admin/ for the dashboard
  services/     Data access per table (all Supabase queries live here)
  styles/       Tailwind entry + design tokens (dark/light)
  types/        Row types mirroring the database
supabase/migrations/  Schema, security (RLS + RPCs), storage, seed
scripts/              Sitemap generator (runs after build)
tests/db/             RLS + RPC tests against real Postgres (PGlite)
tests/e2e/            Playwright suite + in-memory Supabase API mock
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

## Environment variables

| Variable | Required | Description |
| --- | --- | --- |
| `VITE_SUPABASE_URL` | yes | Project URL (Supabase → Project Settings → API) |
| `VITE_SUPABASE_ANON_KEY` | yes | The **anon / publishable** key. Safe in the browser because RLS protects every table. |
| `VITE_SITE_URL` | yes for production | Canonical origin without trailing slash, e.g. `https://ernalkarce.com`. Used for canonical/OG URLs, the sitemap and password-reset links. |
| `VITE_SUPABASE_MEDIA_BUCKET` | no | Storage bucket name, defaults to `media` |

> **Never** put the `service_role` key in any `VITE_` variable or in the repository. The app does not need it.

## Supabase setup

### 1. Create the project and run the migrations

Create a project at [supabase.com](https://supabase.com). Then apply the five files in `supabase/migrations/` **in order**, using either method:

- **SQL Editor:** paste and run each file: `…01_schema.sql`, `…02_security.sql`, `…03_storage.sql`, `…04_seed.sql`, `…22000001_contact_phone_and_settings_consolidation.sql`.
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

The seed adds the six categories, the seven service descriptions and default site settings. It adds **no** projects or testimonials; those must be real and are added from the dashboard.

### 2. Configure authentication

In **Authentication → Providers → Email**:

- **Disable "Allow new users to sign up".** There is no public registration. RLS also grants nothing to non-admin accounts, as a second safeguard.

In **Authentication → URL Configuration**:

- **Site URL:** your production URL (e.g. `https://ernalkarce.com`)
- **Redirect URLs:** add `https://ernalkarce.com/admin/reset-password` and, for local development, `http://localhost:5173/admin/reset-password`

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

### 4. Storage

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

`npm run test:db` verifies these rules against real Postgres (42 checks).

## Deployment (Netlify + GitHub)

1. Push the repository to GitHub.
2. In Netlify: **Add new site → Import from Git** and choose the repository. `netlify.toml` already sets the build command (`npm run build`), the publish directory (`dist`), Node 22, SPA redirects for React Router, security headers and `noindex` for `/admin`.
3. **Site configuration → Environment variables:** add `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` and `VITE_SITE_URL`.
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
