import type { Page } from '@playwright/test';
import { test, expect, login } from './fixtures';
import { ADMIN, MOD1 } from './mock-supabase';

async function setPassword(page: Page, button = 'Set password') {
  await page.locator('#password').fill('brand-new-password-1');
  await page.locator('#confirm').fill('brand-new-password-1');
  await page.getByRole('button', { name: button }).click();
}

test.describe('Invitation and password-reset links', () => {
  test('default invite link (session in URL fragment): set password, then the moderator dashboard', async ({ page, mock }) => {
    await page.goto(`/moderator/set-password${mock.linkSession(MOD1)}`);
    await expect(page.getByRole('heading', { name: 'Set your password' })).toBeVisible();
    await expect(page.getByText(`Choose a password for ${MOD1.email}.`)).toBeVisible();
    await expect(page).toHaveURL(/\/moderator\/set-password#?$/); // tokens removed from the address bar
    await setPassword(page);
    await expect(page).toHaveURL(/\/moderator$/);
    await expect(page.getByRole('heading', { name: 'Welcome back, Mila' })).toBeVisible();
    expect(mock.passwordChanges).toEqual([MOD1.id]);
  });

  test('token_hash invite link is verified by the page, once', async ({ page, mock }) => {
    const link = `/moderator/set-password${mock.linkTokenHash(MOD1)}`;
    await page.goto(link);
    await expect(page.getByText(`Choose a password for ${MOD1.email}.`)).toBeVisible();
    await expect(page).toHaveURL(/\/moderator\/set-password$/); // single-use token removed from the URL
    // Reload keeps working for the same verified user (fragment/token already gone).
    await page.reload();
    await expect(page.getByText(`Choose a password for ${MOD1.email}.`)).toBeVisible();
    await setPassword(page);
    await expect(page).toHaveURL(/\/moderator$/);
    expect(mock.passwordChanges).toEqual([MOD1.id]);

    // Reusing the same link elsewhere fails cleanly.
    const other = await page.context().browser()!.newContext();
    await mock.install(other);
    const p2 = await other.newPage();
    await p2.goto(link);
    await expect(p2.getByText(/expired or has already been used/)).toBeVisible();
    await expect(p2.locator('#password')).toHaveCount(0);
    await other.close();
  });

  test('a used or expired link never falls back to the admin session stored in the browser', async ({ page, mock }) => {
    await login(page);
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
    await page.goto('/moderator/set-password#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired');
    await expect(page.getByText(/expired or has already been used/)).toBeVisible();
    await expect(page.locator('#password')).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Request new link' })).toHaveAttribute('href', '/moderator/forgot-password');
    expect(mock.passwordChanges).toEqual([]);
    // The admin is still signed in, unaffected.
    await page.goto('/admin');
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
  });

  test('a forged link token claiming the signed-in admin is rejected by the Auth server check', async ({ page, mock }) => {
    await login(page);
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
    const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
    const forged = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: ADMIN.id, role: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600 })}.forged`;
    await page.goto(`/admin/reset-password#access_token=${forged}&expires_in=3600&refresh_token=x&token_type=bearer&type=recovery`);
    await expect(page.getByText(/expired or has already been used/)).toBeVisible();
    await expect(page.locator('#password')).toHaveCount(0);
    expect(mock.passwordChanges).toEqual([]);
  });

  test('opening the page without a link does not offer a password form, even when signed in', async ({ page, mock }) => {
    void mock;
    await login(page);
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
    for (const path of ['/moderator/set-password', '/admin/reset-password']) {
      await page.goto(path);
      await expect(page.getByText('Open this page from the link in your email.')).toBeVisible();
      await expect(page.locator('#password')).toHaveCount(0);
    }
  });

  test('a link session revoked on the server is rejected before the form is shown', async ({ page, mock }) => {
    const fragment = mock.linkSession(MOD1);
    mock.revokeSessions(MOD1.id);
    await page.goto(`/moderator/set-password${fragment}`);
    await expect(page.getByText(/expired or has already been used/)).toBeVisible();
    await expect(page.locator('#password')).toHaveCount(0);
  });

  test('session ending after the form is shown gives a clear message instead of "Auth session missing"', async ({ page, mock }) => {
    await page.goto(`/moderator/set-password${mock.linkSession(MOD1)}`);
    await expect(page.locator('#password')).toBeVisible();
    mock.revokeSessions(MOD1.id);
    await setPassword(page);
    await expect(page.getByRole('alert')).toContainText('This link session has ended. Request a new link and try again.');
    expect(mock.passwordChanges).toEqual([]);
  });

  test('admin recovery link works on /admin/reset-password; an invite link does not', async ({ page, mock }) => {
    await page.goto(`/admin/reset-password${mock.linkSession(ADMIN, 'recovery')}`);
    await expect(page.getByRole('heading', { name: 'Choose a new password' })).toBeVisible();
    await setPassword(page, 'Update password');
    await expect(page).toHaveURL(/\/admin$/);
    expect(mock.passwordChanges).toEqual([ADMIN.id]);

    const ctx = await page.context().browser()!.newContext();
    await mock.install(ctx);
    const p2 = await ctx.newPage();
    await p2.goto(`/admin/reset-password${mock.linkSession(MOD1, 'invite')}`);
    await expect(p2.getByText('This link is not meant for this page.')).toBeVisible();
    await expect(p2.locator('#password')).toHaveCount(0);
    await ctx.close();
  });

  test('moderator password-reset (recovery) link also works on /moderator/set-password', async ({ page, mock }) => {
    await page.goto(`/moderator/set-password${mock.linkSession(MOD1, 'recovery')}`);
    await expect(page.getByText(`Choose a new password for ${MOD1.email}.`)).toBeVisible();
    await setPassword(page, 'Update password');
    await expect(page).toHaveURL(/\/moderator$/);
  });
});
