# Test Report — EK Digital Studio

Last run: 2026-11-22 · Windows 11, Node 24, Chromium (Playwright 1.65)

## How it is tested

There is still **no live Supabase project** (no credentials yet) and no Docker, so testing uses three layers. Nothing below verifies real Supabase Auth emails, Storage uploads or hosted PostgREST behaviour.

1. **Database (`npm run test:db`):** all five migrations run in **PGlite** (real PostgreSQL compiled to WASM), on a stub of Supabase's `auth`/`storage` schemas and roles. The suite checks RLS policies, RPCs, triggers, constraints and the settings data migration, acting as an anonymous visitor, a signed-in non-admin and an admin.
2. **End to end (`npm run test:e2e`):** the **production build** runs in Chromium against an in-memory mock of the Supabase HTTP API (`tests/e2e/mock-supabase.ts`), which simulates published-only visibility for visitors.
3. **Extra checks (manual scripts, not part of the repo):**
   - The **development** build was opened with every public page, admin screen and dialog, to catch React warnings. These are printed only in dev builds.
   - The production build was served with the **exact Content-Security-Policy** from `netlify.toml`. The only substitution was the Supabase host, replaced with the local mock, and every page and admin flow was exercised while recording violations.

## Results

| Check | Result |
| --- | --- |
| TypeScript strict type-check | **0 errors** |
| Production build + sitemap | **Passes** (sitemap includes `/privacy`; project URLs verified with a stub API) |
| Database / RLS / RPC (`test:db`) | **42 / 42 passed** |
| End-to-end (`test:e2e`) | **49 / 49 passed**. Stability runs: 147/147 (×3) and 98/98 (×2, clean server) |
| Console errors and warnings, production (all e2e pages) | **None** |
| React warnings, development build (all pages, admin screens, 5 dialogs) | **None** |
| CSP violations (policy from `netlify.toml`) | **None** |
| Horizontal overflow at 360 / 390 / 768 / 1024 / 1440 / 1920 px | **None** (9 public pages and 10 admin screens at each width, plus a media sub-folder) |
| Secret scan of `dist/` | **None found** |
| Third-party requests on page load | **None** (fonts self-hosted) |

## Coverage

**Public:**
- every page, navigation, page titles, canonical and OG tags
- project filters (empty categories hidden), search, the details page and its previous/next/All-projects navigation
- Services overview, groups and jump links
- the contact form: validation, server-side errors, rate-limit message, and the conditional phone field (shown, required, validated, normalised and saved)
- Privacy Policy page and links; theme toggle; images; mobile menu
- category chip scroll hint; contact form placed before the contact details on mobile

**Admin:**
- auth: redirects, wrong password, non-admin refused, session, logout, reset request
- dashboard stats
- projects: create, draft→publish, duplicate slug, edit, feature (with text label), unpublish, delete, aligned row actions; project type picker with the Demo default
- section navigation in the project editor and Site Settings
- categories: in-use protection; cards on mobile, table on desktop
- services; messages (phone with call and WhatsApp links, status changes, delete); testimonials (authenticity confirmation)
- Site Settings: availability, WhatsApp validation and formatting, public updates
- Profile (single source of truth); media (upload, type validation, in-use protection)

**Database:**
- anonymous, non-admin and admin access rules
- contact RPC: validation, sanitising, honeypot, too-fast submissions, rate limits, phone rules and normalisation
- the data copy from profiles to site settings, and removal of the duplicate profile columns

## Known limitations

- Real Supabase (Auth emails, Storage, hosted PostgREST and RLS) is **not yet verified**. Do a manual pass after setup.
- The CSP was tested with a local stand-in for the Supabase host. If a Supabase custom domain is used, it must be added to `img-src` and `connect-src`.
- The Privacy Policy is an accurate technical description, not legal advice. Review it for your jurisdiction and confirm the Supabase region.
- Email notifications for new inquiries are not configured.
- Social link previews for individual project pages use the site-wide tags (client-rendered SPA).
- E2E runs with 2 workers; `vite preview` can stall under heavier local parallelism.
