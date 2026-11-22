# Test Report — EK Digital Studio

Last run: 2026-11-23 · Windows 11, Node 24, Chromium (Playwright 1.65) · includes the Moderator Dashboard & Client Management update

## How it is tested

There is still **no live Supabase project connected to the test suite** and no Docker, so testing uses four layers. Nothing below verifies real Supabase Auth emails (including moderator invitations), Storage uploads or hosted PostgREST behaviour.

1. **Database (`npm run test:db`):** all six migrations run in **PGlite** (real PostgreSQL compiled to WASM), on a stub of Supabase's `auth`/`storage` schemas and roles.
   - `rls.test.mjs` checks the site's policies, RPCs, triggers and constraints as an anonymous visitor, a signed-in non-admin and an admin.
   - `leads.test.mjs` checks the moderator/lead schema as admin, two moderators, a plain user and anon.
2. **Netlify function (`npm run test:functions`):** `invite-moderator` runs with Supabase's HTTP API stubbed.
3. **End to end (`npm run test:e2e`):** the **production build** runs in Chromium against an in-memory mock of the Supabase HTTP API (`tests/e2e/mock-supabase.ts` + `mock-leads.ts`). The mock emulates visibility rules, the lead RPCs and triggers. It is a model of the SQL, so the authoritative security checks are the PGlite tests.
4. **Earlier extra checks (manual scripts, not repeated for this update):** dev-build React warnings and a run under the exact CSP from `netlify.toml`. The new screens make no third-party requests and use no inline scripts, but a manual CSP pass after deployment is recommended.

## Results

| Check | Result |
| --- | --- |
| TypeScript strict type-check (app, tests, Netlify function) | **0 errors** |
| Production build + sitemap | **Passes**; moderator and lead screens are separate lazy chunks |
| Database: site (`rls.test.mjs`) | **42 / 42 passed** |
| Database: moderators & leads (`leads.test.mjs`) | **45 / 45 passed** |
| Netlify function (`test:functions`) | **9 / 9 passed** |
| End-to-end (`test:e2e`) | **67 / 67 passed** (49 existing + 18 new), run twice: see below |
| Console errors and warnings, production (all new moderator/admin screens, 6 widths) | **None** |
| Horizontal overflow at 360 / 390 / 768 / 1024 / 1440 / 1920 px | **None**: previous 19 screens, plus 13 moderator screens/tabs and 7 new admin screens at each width |
| Secret scan of the build | **No keys or JWTs**; only the variable *name* `SUPABASE_SERVICE_ROLE_KEY` appears in a help message |

## Coverage of the moderator update

**Authentication & roles (e2e + DB):**
- moderator login at `/moderator/login`, with the target page restored after sign-in
- moderators redirected away from `/admin`, admins away from `/moderator`; each login page refuses the other role with a clear message
- plain users refused
- a deactivated moderator loses access on the next request
- direct API attempts by a moderator are blocked: activating themselves, editing their email, reading unassigned inquiries, calling admin RPCs, writing audit logs
- `is_admin` cannot be self-granted

**Admin moderator management:**
- link an existing account
- an invitation without the server function shows setup guidance and creates nothing
- unknown emails are refused; admin accounts are refused (DB)
- deactivate with confirmation
- a newly added moderator can sign in

**Assignment:**
- assign from Messages with a private note
- the message leaves the unassigned inbox and appears under "Assigned"; the original row is unchanged and never duplicated
- Delete is hidden for assigned inquiries; an inquiry with lead history cannot be deleted (FK restrict, clear message)
- double assignment refused (DB)

**Isolation:** moderator A sees only their own leads; a direct URL to B's lead shows "Lead not available"; B's data is invisible (DB, per table).

**Brief workflow:**
- draft with no fields, then edit and save again (regression test for a bug found here, see below)
- Submit to Admin, with the brief locked
- admin notification, then Start review and Request changes
- the moderator sees the request, edits and resubmits
- the admin approves from Completed Briefs; the moderator archives; the lead appears in the Archive with search
- each step is in the activity log
- invalid transitions and edits outside active statuses are refused (DB)

**Communication:**
- incoming and outgoing records on email/Instagram, shown oldest-first regardless of entry order
- the first outgoing contact moves `new_assignment` to `contacted`
- author stamped server-side
- `mailto:` draft link
- the admin sees the same history

**Transfer / retrieve / notifications:**
- transfer creates a new assignment row and releases the old one; the previous moderator loses access and is notified
- unread markers; "mark all read" affects only the current user's notifications
- retrieve returns the inquiry to the inbox

**Activity log:** lists lead actions; the per-moderator filter works.

**Regression:** all 49 pre-existing e2e tests and 42 DB tests still pass unchanged.

## Bugs found and fixed during testing

- **Second save of a project brief would have failed.** After the first save, the form held the whole stored row and re-sent `id`, `message_id`, `updated_by` and timestamps. These are rejected by the column grants. The form now sends only content fields.
- **Edits typed right after a save could be overwritten** by the form re-syncing with the stored record. It now keeps fields the user has changed.
- **Delete confirmation stayed open** when the server refused a delete; it now closes and shows the reason.

## Known limitations

- Real Supabase (Auth emails, moderator invite emails, Storage, hosted PostgREST and RLS) is **not yet verified**. Do a manual pass after running the new migration (see README → Supabase setup → Moderators).
- The invite function was tested with Supabase stubbed; the real `/auth/v1/invite` call and email delivery need checking once `SUPABASE_SERVICE_ROLE_KEY` is set on Netlify.
- The e2e mock emulates the SQL rules; it does not prove them. The PGlite tests do.
- Dev-build React-warning and CSP passes were not repeated for the new screens.
- The CSP was tested with a local stand-in for the Supabase host. If a Supabase custom domain is used, it must be added to `img-src` and `connect-src`.
- The Privacy Policy is an accurate technical description, not legal advice. Moderator access to inquiries is a new internal processing role, so consider mentioning that inquiries may be handled by team members.
- Email notifications for new inquiries are not configured; moderator/admin notifications are in-dashboard only.
- E2E runs with 2 workers; `vite preview` can stall under heavier local parallelism.
