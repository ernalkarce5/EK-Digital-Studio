import { test as base, expect, type Page } from '@playwright/test';
import { ADMIN, MockSupabase } from './mock-supabase';

export const test = base.extend<{ mock: MockSupabase; consoleErrors: string[] }>({
  mock: async ({ page }, use) => {
    const mock = new MockSupabase();
    await mock.install(page.context());
    await use(mock);
  },
  consoleErrors: async ({ page }, use) => {
    const errors: string[] = [];
    page.on('console', (msg) => (msg.type() === 'error' || msg.type() === 'warning') && errors.push(`${msg.type()}: ${msg.text()}`));
    page.on('pageerror', (err) => errors.push(err.message));
    await use(errors);
  },
});

export { expect };

export async function login(page: Page, email = ADMIN.email, password = ADMIN.password) {
  await page.goto('/admin/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
}

export async function noHorizontalOverflow(page: Page) {
  return page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
}

/** Describes elements that stick out past the right edge of the viewport (for failure messages). */
export async function overflowReport(page: Page) {
  return page.evaluate(() => {
    const vw = window.innerWidth;
    const out: string[] = [];
    for (const el of Array.from(document.querySelectorAll('body *'))) {
      const r = el.getBoundingClientRect();
      const p = el.parentElement?.getBoundingClientRect();
      if (r.width > 0 && r.right > vw + 1 && (!p || p.right <= vw + 1)) {
        out.push(`${el.tagName.toLowerCase()}.${String((el as HTMLElement).className).slice(0, 60)} right=${Math.round(r.right)}`);
      }
    }
    return `scrollWidth=${document.documentElement.scrollWidth} vw=${vw} ${out.slice(0, 4).join(' | ')}`;
  });
}

export const VIEWPORT_WIDTHS = [360, 390, 768, 1024, 1440, 1920] as const;
