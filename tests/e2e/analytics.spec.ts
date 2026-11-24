import type { Page } from '@playwright/test';
import { test, expect, login, noHorizontalOverflow, overflowReport } from './fixtures';
import { MOD1, type MockSupabase } from './mock-supabase';

const IPHONE_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';

const paths = (mock: MockSupabase) => mock.analytics.calls.map((c) => c.p_path);

async function modLogin(page: Page) {
  await page.goto('/moderator/login');
  await page.getByLabel('Email').fill(MOD1.email);
  await page.getByLabel('Password').fill(MOD1.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('heading', { name: /Welcome back/ })).toBeVisible();
}

/** Seeds realistic rows (as the database would have stored them). */
function seed(mock: MockSupabase) {
  const now = Date.now();
  const at = (daysAgo: number) => new Date(now - daysAgo * 86_400_000).toISOString();
  const row = (page: string, source: string, device: string, visitor: string, daysAgo = 0, slug: string | null = null, ref: string | null = null) =>
    mock.analytics.rows.push({ created_at: at(daysAgo), page, project_slug: slug, source, referrer_domain: ref, device, visitor_hash: visitor.padEnd(64, '0') });
  row('home', 'google', 'mobile', 'a');
  row('projects', 'internal', 'mobile', 'a');
  row('project', 'internal', 'mobile', 'a', 0, 'harbor-apartments');
  row('home', 'instagram', 'mobile', 'b', 1);
  row('contact', 'internal', 'mobile', 'b', 1);
  row('home', 'direct', 'desktop', 'c', 3);
  row('about', 'other', 'tablet', 'd', 5, null, 'news.example.org');
  row('process', 'facebook', 'desktop', 'f', 10);
  row('services', 'linkedin', 'desktop', 'e', 40);
}

test.describe('Website analytics: tracking', () => {
  test('counts public page views, including in-app navigation, with the entry source only once', async ({ page, mock }) => {
    await page.goto('/');
    await expect.poll(() => paths(mock)).toEqual(['/']);
    expect(mock.analytics.calls[0]).toMatchObject({ p_referrer: '', p_utm: null, p_device: 'desktop' });

    // Client-side navigation (no reload) is tracked; later views carry no entry source.
    const nav = page.getByRole('navigation', { name: /main/i });
    await nav.getByRole('link', { name: 'About' }).click();
    await expect(page).toHaveURL(/\/about$/);
    await nav.getByRole('link', { name: 'Projects' }).click();
    await expect(page).toHaveURL(/\/projects$/);
    await page.getByRole('link', { name: /Harbor Apartments/ }).first().click();
    await expect(page).toHaveURL(/\/projects\/harbor-apartments$/);
    await expect.poll(() => paths(mock)).toEqual(['/', '/about', '/projects', '/projects/harbor-apartments']);
    expect(mock.analytics.calls.slice(1).every((c) => c.p_referrer === null && c.p_utm === null)).toBe(true);
    expect(mock.analytics.rows.map((r) => r.page)).toEqual(['home', 'about', 'projects', 'project']);

    // No personal data is sent: only path, entry source and device class.
    for (const c of mock.analytics.calls) expect(Object.keys(c).sort()).toEqual(['p_device', 'p_path', 'p_referrer', 'p_utm']);
  });

  test('records referrer host and utm_source for the landing page', async ({ page, mock }) => {
    await page.goto('/services?utm_source=instagram', { referer: 'https://l.instagram.com/some/path?u=secret' });
    await expect.poll(() => mock.analytics.calls.length).toBe(1);
    expect(mock.analytics.calls[0]).toMatchObject({ p_path: '/services', p_referrer: 'l.instagram.com', p_utm: 'instagram' });
    expect(JSON.stringify(mock.analytics.calls)).not.toContain('secret'); // never the referrer path or query
  });

  test('dashboards and sign-in pages are never tracked; signed-in staff browsing the site are not counted', async ({ page, mock }) => {
    await login(page);
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
    for (const p of ['/admin/projects', '/admin/messages', '/admin/analytics']) {
      await page.goto(p);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    }
    await page.goto('/');
    await page.goto('/about');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await page.waitForTimeout(800);
    expect(paths(mock)).toEqual([]);

    await page.evaluate(() => localStorage.clear());
    await modLogin(page);
    await page.goto('/moderator/leads');
    await page.goto('/contact');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await page.waitForTimeout(800);
    expect(paths(mock).filter((p) => p !== '/moderator/login')).toEqual([]);
    expect(paths(mock).some((p) => p.startsWith('/admin') || p.startsWith('/moderator'))).toBe(false);
  });

  test('Global Privacy Control and Do-Not-Track are respected', async ({ page, mock }) => {
    await page.addInitScript(() => Object.defineProperty(navigator, 'globalPrivacyControl', { value: true }));
    await page.goto('/');
    await page.goto('/about');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await page.waitForTimeout(800);
    expect(mock.analytics.calls).toEqual([]);

    const p2 = await page.context().newPage();
    await p2.addInitScript(() => Object.defineProperty(navigator, 'doNotTrack', { value: '1' }));
    await p2.goto('/');
    await expect(p2.getByRole('heading', { level: 1 })).toBeVisible();
    await p2.waitForTimeout(800);
    expect(mock.analytics.calls).toEqual([]);
  });

  test("visitor opt-out on the Privacy Policy stops counting, is remembered, and can be undone", async ({ page, mock }) => {
    await page.goto('/privacy');
    await expect.poll(() => paths(mock)).toEqual(['/privacy']);
    const box = page.locator('#statistics');
    await expect(box.getByRole('status')).toContainText('Your visits are counted');
    await box.getByRole('button', { name: "Don't count my visits" }).click();
    await expect(box.getByRole('status')).toContainText('Your visits are not counted on this device.');
    expect(await page.evaluate(() => localStorage.getItem('ek-analytics-opt-out'))).toBe('1');

    // No requests at all while opted out: no visitor code is ever calculated.
    await page.goto('/');
    await page.getByRole('navigation', { name: /main/i }).getByRole('link', { name: 'About' }).click();
    await expect(page).toHaveURL(/\/about$/);
    await page.waitForTimeout(800);
    expect(paths(mock)).toEqual(['/privacy']);

    // Remembered after reload; reversible.
    await page.goto('/privacy');
    await expect(box.getByRole('status')).toContainText('not counted on this device');
    await box.getByRole('button', { name: 'Count my visits again' }).click();
    await expect(box.getByRole('status')).toContainText('Your visits are counted');
    expect(await page.evaluate(() => localStorage.getItem('ek-analytics-opt-out'))).toBeNull();
    await page.getByRole('navigation', { name: /main/i }).getByRole('link', { name: 'Services' }).click();
    await expect.poll(() => paths(mock)).toEqual(['/privacy', '/services']);
  });

  test('privacy policy describes pseudonymous codes, 13-month retention, providers and the right to object', async ({ page, mock }) => {
    void mock;
    await page.goto('/privacy');
    const stats = page.locator('#statistics');
    await expect(stats).toContainText('pseudonymous visitor code');
    await expect(stats).toContainText('kept for 13 months');
    await expect(stats).toContainText('right to object');
    await expect(page.locator('#processors')).toContainText('request logs');
    await expect(page.locator('#retention')).toContainText('deleted automatically after 13 months');
    await expect(page.locator('#storage')).toContainText("Don't count my visits");
    const text = await page.locator('main').innerText();
    expect(text).not.toMatch(/anonymous code|cannot be turned back|consent (is )?not (required|needed)/i);
  });

  test.describe('on a phone', () => {
    test.use({ userAgent: IPHONE_UA, viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    test('device is estimated as mobile; a page is not double-counted on re-render', async ({ page, mock }) => {
      await page.goto('/process');
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      await page.waitForTimeout(800);
      expect(mock.analytics.calls).toHaveLength(1);
      expect(mock.analytics.calls[0]).toMatchObject({ p_path: '/process', p_device: 'mobile' });
    });
  });
});

test.describe('Website analytics: admin dashboard', () => {
  test('shows totals, traffic over time, pages, sources and devices', async ({ page, mock, consoleErrors }) => {
    seed(mock);
    await login(page);
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
    await page.getByRole('link', { name: 'Website Analytics' }).click();
    await expect(page.getByRole('heading', { name: 'Website Analytics', level: 1 })).toBeVisible();

    const tiles = page.getByRole('list', { name: 'Key figures' });
    await expect(tiles.getByRole('listitem').filter({ hasText: 'Total page views' })).toContainText('9');
    await expect(tiles.getByRole('listitem').filter({ hasText: 'Unique visitors' })).toContainText('6');
    await expect(tiles.getByRole('listitem').filter({ hasText: "Today's views" })).toContainText('3');

    // Default range: last 30 days (the 40-day-old view is excluded).
    await expect(page.getByText(/8 views · 5 unique visitors/)).toBeVisible();
    await expect(page.getByRole('img', { name: /Page views over time: 8 in 30 periods/ })).toBeVisible();

    const pagesList = page.getByRole('list', { name: 'Most visited pages' });
    await expect(pagesList.getByRole('listitem').first()).toHaveAccessibleName('Home: 3, 38%');
    await expect(page.getByRole('list', { name: 'Most viewed projects' })).toContainText('harbor apartments');
    const sources = page.getByRole('list', { name: 'Traffic sources' });
    await expect(sources).toContainText('Google');
    await expect(sources).toContainText('Instagram');
    await expect(sources).not.toContainText('internal');
    await expect(page.getByRole('list', { name: 'Referring websites' })).toContainText('news.example.org');
    await expect(page.getByRole('list', { name: 'Devices' }).getByRole('listitem').first()).toHaveAccessibleName('Mobile: 5, 63%');

    // Keyboard crosshair tooltip on the chart.
    await page.getByRole('img', { name: /Page views over time/ }).focus();
    await page.keyboard.press('End');
    await expect(page.getByRole('status').filter({ hasText: 'page views' })).toContainText('3');

    // Table view.
    await page.getByRole('button', { name: 'Show as table' }).click();
    await expect(page.getByRole('table')).toBeVisible();
    await expect(page.getByRole('table').getByRole('row')).toHaveCount(31);

    // Presets and grouping.
    await page.getByRole('radio', { name: '7 days' }).click();
    await expect(page.getByText(/7 views · 4 unique visitors/)).toBeVisible();
    await page.getByRole('radio', { name: '12 months' }).click();
    await expect(page.getByRole('radio', { name: 'Monthly' })).toHaveAttribute('aria-checked', 'true');
    await expect(page.getByText(/9 views · 6 unique visitors/)).toBeVisible();
    await page.getByRole('radio', { name: 'Weekly' }).click();
    await expect(page.getByRole('radio', { name: 'Weekly' })).toHaveAttribute('aria-checked', 'true');

    // Custom range.
    await page.getByRole('radio', { name: 'Custom' }).click();
    const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const twoDaysAgo = new Date(Date.now() - 2 * 86_400_000);
    await page.getByLabel('From').fill(iso(twoDaysAgo));
    await expect(page.getByText(/5 views · 2 unique visitors/)).toBeVisible();

    expect(consoleErrors).toEqual([]);
  });

  test('admin verifies the trusted IP source with test headers; status and results are shown', async ({ page, mock }) => {
    seed(mock);
    await login(page);
    await page.goto('/admin/analytics');
    const panel = page.getByRole('region', { name: 'Data quality & retention' }).or(page.locator('section').filter({ hasText: 'Data quality & retention' }));
    await expect(panel).toContainText('not verified yet');
    await expect(panel).toContainText('deleted after 13 months');
    await panel.getByRole('button', { name: 'Verify IP source' }).click();
    await expect(page.getByText('Verified: CF-Connecting-IP is set by the gateway.')).toBeVisible();
    const results = panel.getByRole('list', { name: 'IP source check results' });
    await expect(results).toContainText('set by gateway');
    await expect(results).toContainText('client-controlled (rejected)');
    await expect(panel).toContainText('Visitor IP source: CF-Connecting-IP');
    // The request carried the same test IP in every candidate header plus the probe header.
    const h = mock.analytics.verifyHeaders!;
    expect(h['x-ek-ip-probe']).toMatch(/^203\.0\.113\.\d+$/);
    for (const k of ['cf-connecting-ip', 'x-real-ip', 'x-forwarded-for']) expect(h[k]).toBe(h['x-ek-ip-probe']);
  });

  test('before any visits: zeros and an honest note, no invented data', async ({ page, mock }) => {
    void mock;
    await login(page);
    await page.goto('/admin/analytics');
    await expect(page.getByRole('list', { name: 'Key figures' }).getByRole('listitem').first()).toContainText('0');
    await expect(page.getByText(/No visits recorded yet; counting starts/)).toBeVisible();
    await expect(page.getByText('No data for this period yet.').first()).toBeVisible();
  });

  test('moderators cannot open analytics or call the report', async ({ page, mock }) => {
    seed(mock);
    await modLogin(page);
    await page.goto('/admin/analytics');
    await expect(page).toHaveURL(/\/moderator$/);
    const status = await page.evaluate(async () => {
      const key = Object.keys(localStorage).find((k) => k.includes('auth-token'))!;
      const token = JSON.parse(localStorage.getItem(key)!).access_token as string;
      const res = await fetch('http://mock-supabase.test/rest/v1/rpc/analytics_summary', {
        method: 'POST',
        headers: { apikey: 'e2e-anon-key', Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ p_from: '2026-01-01', p_to: '2026-12-31', p_grain: 'day' }),
      });
      return res.status;
    });
    expect(status).toBe(403);
  });

  for (const width of [360, 390, 768, 1440]) {
    test(`analytics page does not overflow at ${width}px`, async ({ page, mock }) => {
      seed(mock);
      await page.setViewportSize({ width, height: 900 });
      await login(page);
      await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
      await page.goto('/admin/analytics');
      await expect(page.getByRole('img', { name: /Page views over time/ })).toBeVisible();
      await page.waitForTimeout(300);
      expect(await noHorizontalOverflow(page), await overflowReport(page)).toBe(true);
      await page.getByRole('radio', { name: 'Custom' }).click();
      await page.getByRole('button', { name: 'Show as table' }).click();
      expect(await noHorizontalOverflow(page), await overflowReport(page)).toBe(true);
    });
  }
});
