import type { Page } from '@playwright/test';
import { test, expect, login, noHorizontalOverflow, overflowReport, VIEWPORT_WIDTHS } from './fixtures';
import { ADMIN, MOD1, MOD2, NEW_USER, NON_ADMIN, type MockSupabase } from './mock-supabase';

const ADMIN_SESSION = { role: 'admin', uid: ADMIN.id } as const;

async function modLogin(page: Page, acc: { email: string; password: string } = MOD1) {
  await page.goto('/moderator/login');
  await page.getByLabel('Email').fill(acc.email);
  await page.getByLabel('Password').fill(acc.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
}

let seq = 0;
/** Adds a contact-form inquiry exactly as the public form stores it. */
function seedMessage(mock: MockSupabase, name: string, extra: Record<string, unknown> = {}) {
  seq += 1;
  const id = `00000000-0000-4000-8000-${String(seq).padStart(12, '0')}`;
  const t = new Date(Date.now() - (100 - seq) * 60_000).toISOString();
  mock.db.contact_messages.push({
    id, full_name: name, email: `${name.split(' ')[0].toLowerCase()}@client.test`, company: `${name} Ltd`, project_type: 'Business Website',
    budget: null, message: `Original message from ${name}.`, preferred_contact: 'email', phone: null, status: 'new', read_at: null,
    created_at: t, updated_at: t, ...extra,
  });
  return id;
}

/** Assigns through the same RPC the UI uses (admin session). */
function seedAssignment(mock: MockSupabase, messageId: string, moderatorId = MOD1.id) {
  const r = mock.leads.rpc('assign_lead', { p_message_id: messageId, p_moderator_id: moderatorId, p_note: 'Please follow up.' }, ADMIN_SESSION);
  expect(r?.status).toBe(200);
  return mock.leads.current(messageId)!;
}

test.describe('Moderator authentication & roles', () => {
  test('moderator signs in at /moderator, cannot open the admin dashboard', async ({ page, mock }) => {
    void mock;
    await page.goto('/moderator/leads');
    await expect(page).toHaveURL(/\/moderator\/login$/);
    await expect(page.getByRole('heading', { name: 'Moderator sign in' })).toBeVisible();

    await modLogin(page);
    // The requested page is restored after sign-in.
    await expect(page).toHaveURL(/\/moderator\/leads$/);
    await page.goto('/moderator');
    await expect(page.getByRole('heading', { name: 'Welcome back, Mila' })).toBeVisible();

    await page.goto('/admin');
    await expect(page).toHaveURL(/\/moderator$/);
    await page.goto('/admin/messages');
    await expect(page).toHaveURL(/\/moderator$/);
  });

  test('moderator credentials are refused on the admin login, and vice versa', async ({ page, mock }) => {
    void mock;
    await login(page, MOD1.email, MOD1.password);
    await expect(page.getByRole('alert')).toContainText('This is a moderator account');
    await page.goto('/admin');
    await expect(page).toHaveURL(/\/admin\/login$/);

    await modLogin(page, ADMIN);
    await expect(page.getByRole('alert')).toContainText('This is an administrator account');

    await modLogin(page, NON_ADMIN);
    await expect(page.getByRole('alert')).toContainText('does not have moderator access');
  });

  test('admin visiting /moderator is sent to the admin dashboard', async ({ page, mock }) => {
    void mock;
    await login(page);
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
    await page.goto('/moderator');
    await expect(page).toHaveURL(/\/admin$/);
  });

  test('a deactivated moderator loses access immediately', async ({ page, mock }) => {
    await modLogin(page);
    await expect(page.getByRole('heading', { name: 'Welcome back, Mila' })).toBeVisible();
    mock.db.moderators.find((m) => m.id === MOD1.id)!.is_active = false;
    await page.goto('/moderator/leads');
    await expect(page).toHaveURL(/\/moderator\/login$/);
  });

  test('moderator cannot self-promote or read other data through the API', async ({ page, mock }) => {
    const other = seedMessage(mock, 'Hidden Client');
    seedAssignment(mock, other, MOD2.id);
    await modLogin(page);
    await expect(page.getByRole('heading', { name: 'Welcome back, Mila' })).toBeVisible();
    // Direct REST calls with the moderator's own session token.
    const res = await page.evaluate(async () => {
      const key = Object.keys(localStorage).find((k) => k.includes('auth-token'))!;
      const token = JSON.parse(localStorage.getItem(key)!).access_token as string;
      const h = { apikey: 'e2e-anon-key', Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
      const base = 'http://mock-supabase.test/rest/v1';
      const promote = await fetch(`${base}/moderators?id=eq.33333333-3333-4333-8333-333333333333`, { method: 'PATCH', headers: h, body: JSON.stringify({ is_active: true, email: 'x@y.z' }) });
      const msgs = await (await fetch(`${base}/contact_messages?select=id`, { headers: h })).json();
      const assignAttempt = await fetch(`${base}/rpc/assign_lead`, { method: 'POST', headers: h, body: JSON.stringify({ p_message_id: 'x', p_moderator_id: 'y' }) });
      const logWrite = await fetch(`${base}/lead_activity_logs`, { method: 'POST', headers: h, body: JSON.stringify({ action: 'brief_approved' }) });
      return { promote: promote.status, msgs: msgs.length, assign: assignAttempt.status, log: logWrite.status };
    });
    expect(res.promote).toBe(403);
    expect(res.msgs).toBe(0);
    expect(res.assign).toBeGreaterThanOrEqual(400);
    expect(res.log).toBe(403);
    expect(mock.db.profiles.find((p) => p.id === MOD1.id)?.is_admin ?? false).toBe(false);
  });
});

test.describe('Admin moderator management', () => {
  test('link an existing account; invitations report when not configured; deactivate', async ({ page, mock }) => {
    await page.route('**/.netlify/functions/invite-moderator', (r) => r.fulfill({ status: 404, body: 'Not found' }));
    await login(page);
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
    await page.getByRole('link', { name: 'Moderators', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Moderators', level: 1 })).toBeVisible();
    const list = page.getByRole('list', { name: 'Moderators' });
    await expect(list.getByRole('listitem')).toHaveCount(2);

    // Invite without the server function configured: clear guidance, nothing created.
    await page.getByRole('button', { name: 'Add moderator' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.locator('#mod-name').fill(NEW_USER.name);
    await dialog.locator('#mod-email').fill(NEW_USER.email);
    await dialog.getByRole('button', { name: 'Send invitation' }).click();
    await expect(dialog.getByRole('alert')).toContainText('Email invitations are not configured yet');
    expect(mock.db.moderators).toHaveLength(2);

    // Link the existing auth account instead.
    await dialog.getByText('Link existing account', { exact: true }).click();
    await dialog.getByRole('button', { name: 'Add moderator' }).click();
    await expect(page.getByText(`${NEW_USER.name} is now a moderator.`)).toBeVisible();
    await expect(list.getByRole('listitem')).toHaveCount(3);
    expect(mock.db.moderators.some((m) => m.id === NEW_USER.id && m.is_active)).toBe(true);

    // Unknown email is rejected by the server.
    await expect(dialog).toHaveCount(0);
    await page.getByRole('button', { name: 'Add moderator' }).click();
    await dialog.getByText('Link existing account', { exact: true }).click();
    await dialog.locator('#mod-name').fill('Nobody');
    await dialog.locator('#mod-email').fill('nobody@example.com');
    await dialog.getByRole('button', { name: 'Add moderator' }).click();
    await expect(dialog.getByRole('alert')).toBeVisible();
    await dialog.getByRole('button', { name: 'Cancel' }).click();

    // Deactivate with confirmation.
    const card = list.getByRole('listitem').filter({ hasText: MOD2.email });
    await card.getByRole('button', { name: 'Deactivate' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Deactivate' }).click();
    await expect(page.getByText(`${MOD2.name} was deactivated.`)).toBeVisible();
    await expect(card.getByText('Inactive')).toBeVisible();
    expect(mock.db.moderators.find((m) => m.id === MOD2.id)!.is_active).toBe(false);

    // The new moderator can sign in.
    await page.getByRole('button', { name: 'Logout' }).click();
    await modLogin(page, NEW_USER);
    await expect(page.getByRole('heading', { name: 'Welcome back, Sara' })).toBeVisible();
  });
});

test.describe('Lead workflow', () => {
  test('assign from the inbox: message leaves the inbox, original is preserved, moderator is notified', async ({ page, mock }) => {
    const id = seedMessage(mock, 'Lana Client');
    const original = JSON.stringify(mock.db.contact_messages[0]);
    await login(page);
    await page.goto('/admin/messages');
    await page.getByRole('button', { name: /Lana Client/ }).click();
    await page.getByRole('button', { name: 'Assign to Moderator' }).click();
    const dialog = page.getByRole('dialog', { name: 'Assign to Moderator' });
    await dialog.locator('#pick-moderator').selectOption(MOD1.id);
    await dialog.getByLabel(/Private note/).fill('Warm lead, prefers email.');
    await dialog.getByRole('button', { name: 'Assign', exact: true }).click();
    await expect(page.getByText('Assigned. The moderator has been notified.')).toBeVisible();

    // Not in the unassigned inbox any more; listed under "Assigned"; never duplicated.
    await page.getByRole('tab', { name: /^Inbox/ }).click();
    await expect(page.getByRole('button', { name: /Lana Client/ })).toHaveCount(0);
    await page.getByRole('tab', { name: /Assigned/ }).click();
    await expect(page.getByRole('button', { name: /Lana Client/ })).toBeVisible();
    expect(mock.db.contact_messages).toHaveLength(1);
    const { status: _s, read_at: _r, updated_at: _u, ...rest } = mock.db.contact_messages[0];
    const { status: _s2, read_at: _r2, updated_at: _u2, ...orig } = JSON.parse(original);
    expect(rest).toEqual(orig);
    expect(mock.db.lead_assignments).toHaveLength(1);
    expect(mock.db.lead_assignments[0]).toMatchObject({ message_id: id, moderator_id: MOD1.id, status: 'new_assignment', admin_note: 'Warm lead, prefers email.' });

    // Assigned messages cannot be deleted (history is kept).
    await page.getByRole('button', { name: /Lana Client/ }).click();
    await expect(page.getByText(/Assigned to/).first()).toBeVisible();
    await expect(page.getByRole('link', { name: 'Open lead' })).toHaveAttribute('href', `/admin/leads/${id}`);
    await expect(page.getByRole('button', { name: 'Delete' })).toHaveCount(0);

    // Moderator sees it with a notification.
    await page.getByRole('button', { name: 'Logout' }).click();
    await modLogin(page);
    await expect(page.getByRole('link', { name: 'Notifications: 1 new' }).first()).toBeVisible();
    await page.getByRole('link', { name: 'Assigned Leads' }).first().click();
    await page.getByRole('link', { name: 'Open lead: Lana Client' }).click();
    await expect(page.getByRole('heading', { name: 'Lana Client', level: 1 })).toBeVisible();
    await expect(page.getByText('Original message from Lana Client.')).toBeVisible();
    await expect(page.getByText('Warm lead, prefers email.')).toBeVisible();
  });

  test('moderators only see their own leads', async ({ page, mock }) => {
    seedAssignment(mock, seedMessage(mock, 'Mila Lead'), MOD1.id);
    const other = seedMessage(mock, 'Noah Lead');
    seedAssignment(mock, other, MOD2.id);
    seedMessage(mock, 'Unassigned Lead');

    await modLogin(page);
    await page.goto('/moderator/leads');
    await expect(page.getByRole('link', { name: 'Open lead: Mila Lead' })).toBeVisible();
    await expect(page.getByRole('link', { name: /Open lead: (Noah|Unassigned) Lead/ })).toHaveCount(0);
    // Direct URL to someone else's lead.
    await page.goto(`/moderator/leads/${other}`);
    await expect(page.getByText('Lead not available')).toBeVisible();
    await expect(page.getByText('Original message from Noah Lead.')).toHaveCount(0);
  });

  test('brief: draft, submit, request changes, update, approve, archive', async ({ page, mock }) => {
    const id = seedMessage(mock, 'Brief Client');
    seedAssignment(mock, id);

    await modLogin(page);
    await page.goto(`/moderator/leads/${id}`);
    await expect(page.getByRole('button', { name: 'Submit to Admin' })).toBeDisabled();

    // Client info + draft brief (no required fields).
    await page.getByRole('tab', { name: 'Client' }).click();
    await page.locator('#client-industry').fill('Hospitality');
    await page.getByRole('button', { name: /Save/ }).first().click();
    await expect.poll(() => mock.db.lead_clients[0]?.industry).toBe('Hospitality');

    await page.getByRole('tab', { name: 'Project brief' }).click();
    await page.getByRole('button', { name: 'Save draft' }).click();
    await expect(page.getByText('Project brief saved.')).toBeVisible();
    await page.locator('#brief-project_type').selectOption('booking_website');
    await page.locator('#brief-budget').fill('2000 EUR');
    await page.getByRole('button', { name: 'Save brief' }).click();
    await expect.poll(() => mock.db.project_briefs[0]?.budget).toBe('2000 EUR');
    expect(mock.db.project_briefs).toHaveLength(1);

    await page.getByRole('button', { name: 'Submit to Admin' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Submit to Admin' }).click();
    await expect(page.getByText('Brief submitted. The admin has been notified.')).toBeVisible();
    expect(mock.leads.current(id)!.status).toBe('brief_completed');
    // Locked while the admin reviews.
    await expect(page.locator('#brief-budget')).toHaveCount(0);

    // Admin: notification + review queue, request changes.
    await page.getByRole('button', { name: 'Logout' }).click();
    await login(page);
    await expect(page.getByRole('link', { name: 'Notifications: 1 new' }).first()).toBeVisible();
    await page.goto('/admin/notifications');
    await page.getByRole('button', { name: /Project brief submitted: Brief Client/ }).click();
    await expect(page).toHaveURL(new RegExp(`/admin/leads/${id}`));
    await expect(page.getByText('awaiting your review')).toBeVisible();
    await page.getByRole('button', { name: 'Start review' }).click();
    await expect.poll(() => mock.leads.current(id)!.status).toBe('admin_review');
    await page.getByRole('button', { name: 'Request changes' }).click();
    await page.getByRole('dialog').getByLabel(/What is missing/).fill('Please add the number of apartments.');
    await page.getByRole('button', { name: 'Send request' }).click();
    await expect.poll(() => mock.leads.current(id)!.status).toBe('changes_requested');

    // Moderator updates and resubmits.
    await page.getByRole('button', { name: 'Logout' }).click();
    await modLogin(page);
    await page.goto(`/moderator/leads/${id}`);
    await expect(page.getByText('The admin requested more information')).toBeVisible();
    await expect(page.getByText('Please add the number of apartments.').first()).toBeVisible();
    await page.getByRole('tab', { name: 'Project brief' }).click();
    await page.locator('#brief-additional_information').fill('Four apartments.');
    await page.getByRole('button', { name: 'Save brief' }).click();
    await expect.poll(() => mock.db.project_briefs[0]?.additional_information).toBe('Four apartments.');
    await page.getByRole('button', { name: 'Submit to Admin' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Submit to Admin' }).click();
    await expect.poll(() => mock.leads.current(id)!.status).toBe('brief_completed');

    // Admin approves from the Completed Briefs queue.
    await page.getByRole('button', { name: 'Logout' }).click();
    await login(page);
    await page.goto('/admin/briefs');
    await page.getByRole('link', { name: /Brief Client/ }).first().click();
    await page.getByRole('button', { name: 'Approve brief' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Approve' }).click();
    await expect.poll(() => mock.leads.current(id)!.status).toBe('approved');

    // Moderator archives it; it shows in the archive and is read-only.
    await page.getByRole('button', { name: 'Logout' }).click();
    await modLogin(page);
    await page.goto(`/moderator/leads/${id}`);
    await page.locator('#next-status').selectOption('archived');
    await page.getByRole('button', { name: 'Update', exact: true }).click();
    await expect.poll(() => mock.leads.current(id)!.status).toBe('archived');
    await page.goto('/moderator/archive');
    await expect(page.getByRole('link', { name: 'Open lead: Brief Client' })).toBeVisible();
    await page.getByRole('searchbox').or(page.getByPlaceholder(/Search/)).first().fill('nomatch-xyz');
    await expect(page.getByRole('link', { name: 'Open lead: Brief Client' })).toHaveCount(0);

    const actions = mock.db.lead_activity_logs.map((l) => l.action);
    for (const a of ['assignment_created', 'brief_created', 'brief_submitted', 'review_started', 'changes_requested', 'brief_approved', 'assignment_archived']) {
      expect(actions, a).toContain(a);
    }
  });

  test('communication records: chronological, auto-advance to contacted, email helpers', async ({ page, mock }) => {
    const id = seedMessage(mock, 'Comm Client');
    seedAssignment(mock, id);
    await modLogin(page);
    await page.goto(`/moderator/leads/${id}`);
    await expect(page.getByRole('link', { name: 'Open email draft' })).toHaveAttribute('href', /^mailto:comm@client\.test/);

    await page.getByRole('tab', { name: /Communication/ }).click();
    const add = async (direction: string, channel: string, when: string, summary: string) => {
      await page.locator('#comm-direction').selectOption(direction);
      await page.locator('#comm-channel').selectOption(channel);
      await page.locator('#comm-when').fill(when);
      await page.locator('#comm-summary').fill(summary);
      await page.getByRole('button', { name: 'Add record' }).click();
      await expect(page.getByText('Communication recorded.').first()).toBeVisible();
    };
    await add('incoming', 'instagram', '2026-11-20T10:00', 'Client replied on Instagram.');
    await add('outgoing', 'email', '2026-11-19T09:00', 'Sent intro email.');

    const items = page.getByRole('list', { name: 'Communication history' }).getByRole('listitem');
    await expect(items).toHaveCount(2);
    await expect(items.nth(0)).toContainText('Sent intro email.');
    await expect(items.nth(1)).toContainText('Client replied on Instagram.');
    expect(mock.leads.current(id)!.status).toBe('contacted');
    expect(mock.db.communication_logs.every((c) => c.author_id === MOD1.id && c.author_role === 'moderator')).toBe(true);

    // Admin sees the same history.
    await page.getByRole('button', { name: 'Logout' }).click();
    await login(page);
    await page.goto(`/admin/leads/${id}?tab=communication`);
    await expect(page.getByRole('list', { name: 'Communication history' }).getByRole('listitem')).toHaveCount(2);
  });

  test('transfer and retrieve; notifications read/unread', async ({ page, mock }) => {
    const id = seedMessage(mock, 'Moving Client');
    seedAssignment(mock, id);
    await login(page);
    await page.goto(`/admin/leads/${id}`);
    await page.getByRole('button', { name: 'Transfer' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.locator('#pick-moderator').selectOption(MOD2.id);
    await dialog.getByRole('button', { name: 'Transfer' }).click();
    await expect.poll(() => mock.leads.current(id)?.moderator_id).toBe(MOD2.id);
    expect(mock.db.lead_assignments).toHaveLength(2);
    expect(mock.db.lead_assignments.filter((a) => !a.released_at)).toHaveLength(1);

    // MOD1 lost access and was told; MOD2 has it.
    await page.getByRole('button', { name: 'Logout' }).click();
    await modLogin(page);
    await page.goto(`/moderator/leads/${id}`);
    await expect(page.getByText('Lead not available')).toBeVisible();
    await page.goto('/moderator/notifications');
    const list = page.getByRole('list', { name: 'Notifications' });
    await expect(list.getByRole('button', { name: /Lead transferred: Moving Client/ })).toContainText('(unread)');
    await page.getByRole('button', { name: /Mark all/ }).click();
    await expect(page.getByText('All notifications marked as read.')).toBeVisible();
    await expect(list.getByText('(unread)')).toHaveCount(0);
    expect(mock.db.internal_notifications.filter((n) => n.recipient_id === MOD1.id).every((n) => n.read_at)).toBe(true);
    // MOD2's notifications are untouched.
    expect(mock.db.internal_notifications.some((n) => n.recipient_id === MOD2.id && !n.read_at)).toBe(true);

    await page.getByRole('button', { name: 'Logout' }).click();
    await login(page);
    await page.goto(`/admin/leads/${id}`);
    await page.getByRole('button', { name: 'Retrieve' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Retrieve lead' }).click();
    await expect.poll(() => mock.leads.current(id)).toBeFalsy();
    await page.goto('/admin/messages');
    await expect(page.getByRole('button', { name: /Moving Client/ })).toBeVisible();

    // Back in the inbox, but its lead history keeps the original inquiry from being deleted.
    await page.getByRole('button', { name: /Moving Client/ }).click();
    await page.getByRole('button', { name: 'Delete' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Delete' }).click();
    await expect(page.getByText(/its history is kept/)).toBeVisible();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    expect(mock.db.contact_messages.some((m) => m.id === id)).toBe(true);
  });

  test('activity log page lists lead actions and filters by moderator', async ({ page, mock }) => {
    seedAssignment(mock, seedMessage(mock, 'Log One'), MOD1.id);
    seedAssignment(mock, seedMessage(mock, 'Log Two'), MOD2.id);
    await login(page);
    await page.goto('/admin/activity');
    await expect(page.getByRole('heading', { name: 'Activity Logs', level: 1 }).or(page.getByRole('heading', { level: 1 }))).toBeVisible();
    await expect(page.getByText(/Log One/).first()).toBeVisible();
    await expect(page.getByText(/Log Two/).first()).toBeVisible();
    await page.goto(`/admin/activity?moderator=${MOD2.id}`);
    await expect(page.getByText(/Log Two/).first()).toBeVisible();
    await expect(page.getByText(/Log One/)).toHaveCount(0);
  });
});

test.describe('Moderator responsive layout', () => {
  for (const width of VIEWPORT_WIDTHS) {
    test(`no moderator or lead-management screen overflows at ${width}px`, async ({ page, mock, consoleErrors }) => {
      const id = seedMessage(mock, 'Amra Hodžić-Longname', {
        message: 'Hello, we run four apartments in Mostar and would like an online booking system with a calendar and payments.',
      });
      seedAssignment(mock, id);
      await page.setViewportSize({ width, height: 900 });

      await modLogin(page);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      const modRoutes = ['/moderator', '/moderator/leads', '/moderator/communication', '/moderator/briefs', '/moderator/archive', '/moderator/profile', '/moderator/notifications'];
      for (const tab of ['', '?tab=client', '?tab=brief', '?tab=communication', '?tab=notes', '?tab=history']) modRoutes.push(`/moderator/leads/${id}${tab}`);
      for (const route of modRoutes) {
        await page.goto(route);
        await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
        await page.waitForTimeout(250);
        expect(await noHorizontalOverflow(page), `${route} at ${width}px: ${await overflowReport(page)}`).toBe(true);
      }

      // Sign out by dropping the stored session (Logout sits in the collapsed mobile menu).
      await page.evaluate(() => localStorage.clear());
      await login(page);
      await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
      for (const route of ['/admin/moderators', '/admin/assignments', '/admin/briefs', '/admin/activity', '/admin/notifications', `/admin/leads/${id}`, `/admin/leads/${id}?tab=history`]) {
        await page.goto(route);
        await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
        await page.waitForTimeout(250);
        expect(await noHorizontalOverflow(page), `${route} at ${width}px: ${await overflowReport(page)}`).toBe(true);
      }
      expect(consoleErrors, consoleErrors.join('\n')).toEqual([]);
    });
  }
});
