import type { BrowserContext, Page } from '@playwright/test';
import { test, expect, login, noHorizontalOverflow, overflowReport } from './fixtures';
import { ADMIN, MOD1, type MockSupabase } from './mock-supabase';

const ADMIN_SESSION = { role: 'admin', uid: ADMIN.id } as const;

async function modLogin(page: Page) {
  await page.goto('/moderator/login');
  await page.getByLabel('Email').fill(MOD1.email);
  await page.getByLabel('Password').fill(MOD1.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('heading', { name: /Welcome back/ })).toBeVisible();
}

let seq = 500;
function seedLead(mock: MockSupabase, name = 'Lana Client') {
  seq += 1;
  const id = `00000000-0000-4000-8000-${String(seq).padStart(12, '0')}`;
  const t = new Date().toISOString();
  mock.db.contact_messages.push({
    id, full_name: name, email: 'lana@client.test', company: null, project_type: 'Booking System', budget: null,
    message: `Original message from ${name}.`, preferred_contact: 'email', phone: null, status: 'new', read_at: null, created_at: t, updated_at: t,
  });
  expect(mock.leads.rpc('assign_lead', { p_message_id: id, p_moderator_id: MOD1.id, p_note: null }, ADMIN_SESSION)?.status).toBe(200);
  return id;
}

/** Moderator generates a link in the Questionnaire tab; returns the link shown once. */
async function generateLink(page: Page, messageId: string) {
  await page.goto(`/moderator/leads/${messageId}?tab=questionnaire`);
  await page.getByRole('button', { name: 'Generate questionnaire link' }).click();
  await expect(page.getByText('Questionnaire link created.')).toBeVisible();
  const link = await page.locator('#q-link').inputValue();
  expect(link).toMatch(/^http:\/\/localhost:4174\/questionnaire#t=[A-Za-z0-9_-]{43}$/);
  return link;
}

/** A separate browser (no moderator session), like the client's own device. */
async function clientPage(context: BrowserContext, mock: MockSupabase) {
  const browser = context.browser()!;
  const ctx = await browser.newContext();
  await mock.install(ctx);
  return ctx.newPage();
}

test.describe('Client project questionnaire', () => {
  test('full workflow: generate, send, client fills and submits, moderator reviews and applies to the brief', async ({ page, mock, context }) => {
    const id = seedLead(mock);
    await modLogin(page);
    const link = await generateLink(page, id);
    await expect(page.getByText(/shown only now/)).toBeVisible();
    await expect(page.getByText(/Works until/)).toBeVisible();

    // Prepared message + record as sent (Instagram).
    await page.getByText('Instagram', { exact: true }).click();
    await expect(page.locator('#q-message')).toHaveValue(new RegExp(link.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    await page.getByRole('button', { name: 'Mark as sent via Instagram' }).click();
    await expect(page.getByText('Recorded as sent.', { exact: true })).toBeVisible();
    await expect(page.getByText('Sent to client', { exact: true })).toBeVisible();
    expect(mock.db.communication_logs.some((c) => c.message_id === id && c.channel === 'instagram' && c.direction === 'outgoing')).toBe(true);

    // ── Client ──
    const client = await clientPage(context, mock);
    await client.goto(link.replace('http://localhost:4174', ''));
    await expect(client.getByRole('heading', { name: 'Hi Lana, tell us about your project' })).toBeVisible();
    await expect(client).toHaveURL(/\/questionnaire$/); // token removed from the address bar
    expect(await client.locator('meta[name="robots"]').getAttribute('content')).toBe('noindex, nofollow');

    await client.locator('#q-website_type').selectOption('booking_website');
    await client.locator('#q-project_name').fill('Harbor Apartments');
    await client.locator('#q-project_description').fill('Short.');
    await expect(client.getByRole('status').filter({ hasText: 'Saved' })).toBeVisible({ timeout: 8000 }); // autosave
    expect(mock.db.client_questionnaires.find((q) => q.message_id === id)?.status).toBe('in_progress');

    await client.getByRole('button', { name: 'Continue' }).click();
    await client.getByText('Online booking / reservations').click();
    await client.getByText('Online payments').click();
    await client.getByRole('button', { name: 'Continue' }).click();
    await client.locator('#q-visual_style').selectOption('elegant');
    await client.locator('#q-reference_links').fill('not a link');
    await client.getByRole('button', { name: 'Continue' }).click();
    await expect(client.getByText('Links must start with http:// or https://.')).toBeVisible();
    await client.locator('#q-reference_links').fill('https://example.com/inspiration');
    await client.getByRole('button', { name: 'Continue' }).click();
    await client.locator('#q-budget_range').selectOption('2500_5000');
    await client.getByRole('button', { name: 'Continue' }).click();
    await client.locator('#q-urgency').selectOption('soon');
    await client.getByRole('button', { name: 'Continue' }).click();
    await client.getByRole('button', { name: 'Review answers' }).click();
    await expect(client.getByRole('heading', { name: 'Review your answers' })).toBeVisible();
    await expect(client.getByText('Step 7 of 7')).toBeVisible();

    // Required fields are enforced: jumps back to the first problem.
    await client.getByRole('button', { name: 'Send questionnaire' }).click();
    await expect(client.getByText('Some answers need attention before sending.')).toBeVisible();
    await expect(client.getByText(/at least 20 characters/)).toBeVisible();
    await client.locator('#q-project_description').fill('Four apartments in Mostar need online booking with a calendar.');
    for (let i = 0; i < 3; i++) await client.getByRole('button', { name: 'Continue' }).click();
    await expect(client.getByText('Please choose a currency for your budget.')).toBeVisible();
    await client.locator('#q-budget_currency').selectOption('EUR');
    await client.getByRole('button', { name: 'Continue' }).click();
    await client.getByRole('button', { name: 'Continue' }).click();
    await client.getByRole('button', { name: 'Review answers' }).click();
    await client.waitForTimeout(1600); // elapsed time is realistic anyway; keep the run deterministic
    await client.getByRole('button', { name: 'Send questionnaire' }).click();
    await expect(client.getByRole('heading', { name: 'Thank you, Lana!' })).toBeVisible();

    // Submitted answers are immutable; the link now only confirms.
    await client.goto(link.replace('http://localhost:4174', ''));
    await expect(client.getByRole('heading', { name: 'Already submitted' })).toBeVisible();
    expect(mock.analytics.calls).toEqual([]); // the questionnaire is never tracked
    await client.context().close();

    // ── Moderator review ──
    await page.reload();
    await expect(page.getByRole('link', { name: 'Notifications: 2 new' }).first()).toBeVisible(); // assignment + submission
    expect(mock.db.internal_notifications.filter((n) => n.type === 'questionnaire_submitted' && n.recipient_id === MOD1.id && n.message_id === id)).toHaveLength(1);
    await expect(page.getByText('Submitted', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('Four apartments in Mostar need online booking with a calendar.')).toBeVisible();
    await expect(page.getByText('EUR 2,500 – 5,000')).toBeVisible();

    await page.getByRole('button', { name: 'Apply to Project Brief' }).click();
    await expect(page).toHaveURL(/tab=brief/);
    await expect(page.getByText(/Questionnaire answers filled in \d+ fields — not saved yet/)).toBeVisible();
    await expect(page.locator('#brief-project_type')).toHaveValue('booking_website');
    await expect(page.locator('#brief-budget')).toHaveValue('EUR 2,500 – 5,000');
    await expect(page.locator('#brief-priority')).toHaveValue('high');
    await page.getByRole('button', { name: /Save/ }).first().click();
    await expect(page.getByText('Project brief saved.')).toBeVisible();
    await expect.poll(() => mock.db.project_briefs.find((b) => b.message_id === id)?.budget).toBe('EUR 2,500 – 5,000');
    // Applying does NOT mark the questionnaire reviewed.
    expect(mock.db.client_questionnaires.find((q) => q.message_id === id)?.status).toBe('submitted');

    await page.goto(`/moderator/leads/${id}?tab=questionnaire`);
    await page.getByRole('button', { name: 'Mark as Reviewed' }).click();
    await expect(page.getByText('Questionnaire marked as reviewed.')).toBeVisible();
    await expect(page.getByText('Reviewed', { exact: true }).first()).toBeVisible();

    const actions = mock.db.lead_activity_logs.filter((l) => l.message_id === id).map((l) => l.action);
    for (const a of ['questionnaire_link_created', 'questionnaire_sent', 'questionnaire_started', 'questionnaire_submitted', 'questionnaire_applied_to_brief', 'questionnaire_reviewed']) {
      expect(actions, a).toContain(a);
    }
  });

  test('replacement link invalidates the previous one and keeps the saved draft', async ({ page, mock, context }) => {
    const id = seedLead(mock);
    await modLogin(page);
    const first = await generateLink(page, id);
    const client = await clientPage(context, mock);
    await client.goto(first.replace('http://localhost:4174', ''));
    await client.locator('#q-project_name').fill('Draft kept');
    await expect(client.getByRole('status').filter({ hasText: 'Saved' })).toBeVisible({ timeout: 8000 });

    await page.getByRole('button', { name: 'Generate replacement link' }).click();
    await expect(page.getByRole('dialog')).toContainText('stops working immediately');
    await page.getByRole('dialog').getByRole('button', { name: 'Replace link' }).click();
    await expect(page.getByText('New link created. The previous link no longer works.')).toBeVisible();
    const second = await page.locator('#q-link').inputValue();
    expect(second).not.toBe(first);

    await client.goto(first.replace('http://localhost:4174', ''));
    await expect(client.getByRole('heading', { name: "This questionnaire isn't available" })).toBeVisible();
    await client.goto(second.replace('http://localhost:4174', ''));
    await expect(client.locator('#q-project_name')).toHaveValue('Draft kept');

    // Disable the link.
    await page.getByRole('button', { name: 'Disable link' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Disable link' }).click();
    await expect(page.getByText('Link disabled.')).toBeVisible();
    await client.goto(second.replace('http://localhost:4174', ''));
    await expect(client.getByRole('heading', { name: "This questionnaire isn't available" })).toBeVisible();
    await client.context().close();
  });

  test("applying answers asks before overwriting the moderator's brief text", async ({ page, mock }) => {
    const id = seedLead(mock);
    // Submitted questionnaire and an existing brief with moderator text.
    const gen = mock.leads.rpc('questionnaire_generate_link', { p_message_id: id }, { role: 'moderator', uid: MOD1.id })!;
    const token = (gen.body as { token: string }).token;
    mock.leads.rpc('questionnaire_submit', {
      p_token: token, p_elapsed_ms: 60000,
      p_answers: { website_type: 'landing_page', project_description: 'A landing page for the new product launch.', preferred_colors: 'Navy and gold' },
    }, { role: 'anon', uid: null });
    mock.db.project_briefs.push({ id, message_id: id, description: 'My own notes from the call.', preferred_colors: '', created_at: new Date().toISOString(), updated_at: new Date().toISOString() });

    await modLogin(page);
    await page.goto(`/moderator/leads/${id}?tab=questionnaire`);
    await page.getByRole('button', { name: 'Apply to Project Brief' }).click();
    const dialog = page.getByRole('dialog', { name: 'Some brief fields already have your text' });
    await expect(dialog).toContainText('Project description');
    await dialog.getByRole('button', { name: 'Fill empty fields only' }).click();
    await expect(page.locator('#brief-description')).toHaveValue('My own notes from the call.');
    await expect(page.locator('#brief-preferred_colors')).toHaveValue('Navy and gold');
    await expect(page.locator('#brief-project_type')).toHaveValue('landing_page');
  });

  test('admins have no Questionnaire tab; the workspace falls back to the overview', async ({ page, mock }) => {
    const id = seedLead(mock);
    await login(page);
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
    await page.goto(`/admin/leads/${id}?tab=questionnaire`);
    await expect(page.getByRole('tab', { name: 'Overview' })).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByRole('tab', { name: 'Questionnaire' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Generate questionnaire link' })).toHaveCount(0);
  });

  test('missing, malformed and unknown links show neutral messages', async ({ page, mock }) => {
    void mock;
    await page.goto('/questionnaire');
    await expect(page.getByRole('heading', { name: 'Open the link from your message' })).toBeVisible();
    await page.goto('/questionnaire#t=not-a-token');
    await expect(page.getByRole('heading', { name: 'Open the link from your message' })).toBeVisible();
    await page.goto(`/questionnaire#t=${'A'.repeat(43)}`);
    await expect(page.getByRole('heading', { name: "This questionnaire isn't available" })).toBeVisible();
    await expect(page.getByRole('navigation')).toHaveCount(0); // no public navigation / footer
    expect(mock.analytics.calls).toEqual([]);
  });

  for (const width of [360, 768, 1440]) {
    test(`questionnaire screens do not overflow at ${width}px`, async ({ page, mock }) => {
      const id = seedLead(mock, 'Amra Hodžić-Longname');
      const gen = mock.leads.rpc('questionnaire_generate_link', { p_message_id: id }, { role: 'moderator', uid: MOD1.id })!;
      const token = (gen.body as { token: string }).token;
      await page.setViewportSize({ width, height: 900 });
      await page.goto(`/questionnaire#t=${token}`);
      await expect(page.locator('#q-website_type')).toBeVisible();
      expect(await noHorizontalOverflow(page), await overflowReport(page)).toBe(true);
      await page.getByRole('button', { name: 'Continue' }).click();
      expect(await noHorizontalOverflow(page), await overflowReport(page)).toBe(true);

      await page.evaluate(() => localStorage.clear());
      await modLogin(page);
      await page.goto(`/moderator/leads/${id}?tab=questionnaire`);
      await expect(page.getByRole('heading', { name: 'Client project questionnaire' })).toBeVisible();
      expect(await noHorizontalOverflow(page), await overflowReport(page)).toBe(true);
    });
  }
});
