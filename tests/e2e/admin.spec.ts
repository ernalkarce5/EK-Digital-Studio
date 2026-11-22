import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeFileSync, mkdirSync } from 'node:fs';
import { test, expect, login, noHorizontalOverflow, overflowReport, VIEWPORT_WIDTHS } from './fixtures';
import { NON_ADMIN } from './mock-supabase';

const dir = path.dirname(fileURLToPath(import.meta.url));

test.describe('Admin authentication', () => {
  test('protected routes redirect to login when signed out', async ({ page, mock }) => {
    void mock;
    for (const p of ['/admin', '/admin/projects', '/admin/messages', '/admin/settings']) {
      await page.goto(p);
      await expect(page).toHaveURL(/\/admin\/login$/);
      await expect(page.getByRole('heading', { name: 'Admin sign in' })).toBeVisible();
    }
  });

  test('wrong password shows an error', async ({ page, mock }) => {
    void mock;
    await login(page, 'admin@example.com', 'wrong-password');
    await expect(page.getByRole('alert')).toContainText('Incorrect email or password.');
    await expect(page).toHaveURL(/\/admin\/login$/);
  });

  test('a signed-in user without admin rights is refused', async ({ page, mock }) => {
    void mock;
    await login(page, NON_ADMIN.email, NON_ADMIN.password);
    await expect(page.getByRole('alert')).toContainText('does not have administrator access');
    await page.goto('/admin');
    await expect(page).toHaveURL(/\/admin\/login$/);
  });

  test('login, session persists across reload, logout blocks access', async ({ page, mock }) => {
    void mock;
    await login(page);
    await expect(page).toHaveURL(/\/admin$/);
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
    await page.getByRole('button', { name: 'Logout' }).click();
    await expect(page).toHaveURL(/\/admin\/login$/);
    await page.goto('/admin/projects');
    await expect(page).toHaveURL(/\/admin\/login$/);
  });

  test('forgot password sends a reset request', async ({ page, mock }) => {
    void mock;
    await page.goto('/admin/login');
    await page.getByRole('link', { name: 'Forgot your password?' }).click();
    // Wait for the lazily loaded route; the login form stays mounted during the transition.
    await expect(page.getByRole('heading', { name: 'Reset password' })).toBeVisible();
    await page.getByLabel('Email').fill('admin@example.com');
    await page.getByRole('button', { name: 'Send reset link' }).click();
    await expect(page.getByText(/a reset link is on its way/)).toBeVisible();
  });

  test('a redirect target is restored after login', async ({ page, mock }) => {
    void mock;
    await page.goto('/admin/categories');
    await expect(page).toHaveURL(/\/admin\/login$/);
    await page.getByLabel('Email').fill('admin@example.com');
    await page.getByLabel('Password').fill('correct-horse-battery');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page).toHaveURL(/\/admin\/categories$/);
  });
});

test.describe('Admin dashboard & content management', () => {
  test.beforeEach(async ({ page, mock }) => {
    void mock;
    await login(page);
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
  });

  test('dashboard statistics come from the data', async ({ page }) => {
    const card = (label: string) => page.getByRole('link', { name: new RegExp(`^${label}`) });
    await expect(card('Total projects')).toContainText('4');
    await expect(card('Published')).toContainText('3');
    await expect(card('Drafts')).toContainText('1');
    await expect(card('Total messages')).toContainText('0');
    await expect(page.getByText('No messages yet')).toBeVisible();
  });

  test('create a draft, verify it is hidden publicly, publish it, verify it is public', async ({ page, mock }) => {
    await page.getByRole('link', { name: 'New project' }).click();
    await expect(page.getByRole('heading', { name: 'New project' })).toBeVisible();

    // Required-field validation.
    await page.getByRole('button', { name: 'Save draft' }).click();
    await expect(page.getByText('Title is required.')).toBeVisible();

    await page.getByLabel('Title').fill('Fresh Landing Page');
    await expect(page.getByLabel('Slug')).toHaveValue('fresh-landing-page');
    await page.getByLabel('Short description').fill('A landing page for a local business.');
    await page.getByLabel('Project objectives').fill('Load fast\nConvert visitors');
    // Project type: Demo is the safe default, clearly communicated, and easy to change.
    await expect(page.getByRole('radio', { name: /^Demo Project/ })).toBeChecked();
    await expect(page.getByText(/New projects start as/)).toBeVisible();
    await page.getByText('Personal Project', { exact: true }).click();
    await expect(page.getByRole('radio', { name: /^Personal Project/ })).toBeChecked();
    await page.getByLabel('Category').selectOption({ label: 'Business Websites' });
    await page.getByLabel('Technologies').fill('Astro');
    await page.keyboard.press('Enter');
    await page.getByRole('button', { name: 'Save draft' }).click();
    await expect(page.getByText('Project saved as draft.')).toBeVisible();
    await expect(page).toHaveURL(/\/admin\/projects\/[0-9a-f-]{36}$/);

    // Not public while a draft.
    const pub = await page.context().newPage();
    await pub.goto('/projects/fresh-landing-page');
    await expect(pub.getByRole('heading', { name: 'This page could not be found' })).toBeVisible();

    await page.getByRole('button', { name: 'Publish' }).click();
    await expect(page.getByText('Project published.')).toBeVisible();

    await pub.goto('/projects');
    await expect(pub.getByRole('heading', { name: 'Fresh Landing Page' })).toBeVisible();
    await pub.goto('/projects/fresh-landing-page');
    await expect(pub.getByRole('heading', { level: 1, name: 'Fresh Landing Page' })).toBeVisible();
    await expect(pub.getByText('Load fast')).toBeVisible();
    await expect(pub.getByText('Astro')).toBeVisible();
    await expect(pub.getByText('Personal Project').first()).toBeVisible();
    await pub.close();
    expect(mock.db.projects.find((p) => p.slug === 'fresh-landing-page')?.project_type).toBe('personal');
  });

  test('long editors have working section navigation', async ({ page }) => {
    await page.goto('/admin/projects/new');
    const nav = page.getByRole('navigation', { name: 'Form sections' });
    await nav.getByRole('button', { name: 'Display' }).click();
    await expect(page.locator('#project-display')).toBeInViewport();
    await expect(nav.getByRole('button', { name: 'Display' })).toHaveAttribute('aria-current', 'true');

    await page.goto('/admin/settings');
    await page.getByRole('navigation', { name: 'Form sections' }).getByRole('button', { name: 'Social media' }).click();
    await expect(page.locator('#settings-social')).toBeInViewport();
  });

  test('duplicate slugs are rejected with a clear message', async ({ page }) => {
    await page.goto('/admin/projects/new');
    await page.getByLabel('Title').fill('Another');
    await page.getByLabel('Slug').fill('harbor-apartments');
    await page.getByLabel('Short description').fill('Desc');
    await page.getByRole('button', { name: 'Save draft' }).click();
    await expect(page.getByText('This slug is already used by another project.')).toBeVisible();
  });

  test('edit, feature, unpublish and delete a project', async ({ page, mock }) => {
    await page.getByRole('link', { name: 'Projects', exact: true }).click();
    const row = page.locator('li', { hasText: 'Studio Barber' });
    await row.getByRole('button', { name: 'Mark as featured' }).click();
    await expect(page.getByText('Marked as featured.')).toBeVisible();
    expect(mock.db.projects.find((p) => p.slug === 'studio-barber')?.is_featured).toBe(true);
    // Visible text label, not just the star icon.
    await expect(row.getByText('Featured', { exact: true })).toBeVisible();

    // Row actions line up across published and draft rows.
    const editX = await page.locator('a[aria-label^="Edit "]').evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().left)));
    expect(new Set(editX).size, `edit icon x positions: ${editX}`).toBe(1);

    await row.getByRole('link', { name: 'Edit Studio Barber' }).click();
    await page.getByLabel('Title').fill('Studio Barber Renamed');
    await page.getByRole('button', { name: 'Save changes' }).click();
    await expect(page.getByText('Changes saved.')).toBeVisible();

    await page.getByRole('link', { name: 'All projects' }).click();
    const renamed = page.locator('li', { hasText: 'Studio Barber Renamed' });
    await renamed.getByRole('button', { name: 'Unpublish' }).click();
    await expect(page.getByText('Project moved to drafts.')).toBeVisible();

    await renamed.getByRole('button', { name: /Delete Studio Barber Renamed/ }).click();
    await expect(page.getByRole('dialog')).toContainText('will be permanently deleted');
    await page.getByRole('dialog').getByRole('button', { name: 'Delete' }).click();
    await expect(page.getByText('“Studio Barber Renamed” deleted.')).toBeVisible();
    await expect(page.locator('li', { hasText: 'Studio Barber Renamed' })).toHaveCount(0);
    expect(mock.db.projects.some((p) => p.slug === 'studio-barber')).toBe(false);
  });

  test('categories: create, in-use protection, delete unused', async ({ page, mock }) => {
    await page.getByRole('link', { name: 'Categories' }).click();
    await expect(page.getByRole('button', { name: 'In use: reassign its projects before deleting' }).first()).toBeDisabled();

    await page.getByRole('button', { name: 'New category' }).first().click();
    await page.getByLabel('Name').fill('Landing Pages');
    await expect(page.getByLabel('Slug')).toHaveValue('landing-pages');
    await page.getByRole('dialog').getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText('Category created.')).toBeVisible();
    await expect(page.getByRole('cell', { name: 'Landing Pages', exact: true })).toBeVisible();

    await page.getByRole('button', { name: 'Delete Landing Pages' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Delete' }).click();
    await expect(page.getByText('Category deleted.')).toBeVisible();
    expect(mock.db.categories.some((c) => c.slug === 'landing-pages')).toBe(false);
  });

  test('services: unpublishing removes a service from the public page', async ({ page }) => {
    await page.getByRole('link', { name: 'Services', exact: true }).click();
    const row = page.locator('li', { hasText: 'Website Maintenance' });
    await row.getByRole('button', { name: 'Unpublish' }).click();
    await expect(page.getByText('Service unpublished.')).toBeVisible();

    await row.getByRole('button', { name: 'Edit Website Maintenance' }).click();
    await page.getByLabel('Summary').fill('Updated maintenance summary.');
    await page.getByRole('dialog').getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText('Service updated.')).toBeVisible();

    const pub = await page.context().newPage();
    await pub.goto('/services');
    await expect(pub.locator('[data-service]')).toHaveCount(6);
    await expect(pub.locator('#website-maintenance')).toHaveCount(0);
    await pub.close();
  });

  test('messages: public submission appears, opens as read, status changes, delete', async ({ page, mock }) => {
    const pub = await page.context().newPage();
    await pub.goto('/contact');
    await pub.getByLabel('Full name').fill('Marko Lead');
    await pub.getByLabel('Email address').fill('marko@example.com');
    await pub.getByLabel('Project type').selectOption('Booking System');
    await pub.getByLabel('Project description').fill('We need online booking for our apartments.');
    await pub.getByLabel('Preferred contact method').selectOption('whatsapp');
    await pub.getByLabel('Phone number').fill('+387 61 234 567');
    await pub.waitForTimeout(2100);
    await pub.getByRole('button', { name: 'Send message' }).click();
    await expect(pub.getByRole('heading', { name: /Thank you/ })).toBeVisible();
    await pub.close();

    await page.goto('/admin/messages');
    await expect(page.getByLabel('1 unread')).toBeVisible();
    await page.getByRole('button', { name: /Marko Lead/ }).click();
    await expect(page.getByRole('heading', { name: 'Marko Lead' })).toBeVisible();
    await expect(page.getByText('We need online booking for our apartments.').last()).toBeVisible();
    await expect.poll(() => mock.db.contact_messages[0].status).toBe('read');
    await expect(page.getByLabel('1 unread')).toHaveCount(0);

    const reply = page.getByRole('link', { name: 'Reply by email' });
    await expect(reply).toHaveAttribute('href', /^mailto:marko@example\.com\?subject=/);
    // Phone saved with the inquiry, shown formatted, with call and WhatsApp links.
    await expect(page.getByRole('link', { name: '+387 61 234 567' })).toHaveAttribute('href', 'tel:+38761234567');
    await expect(page.getByRole('link', { name: 'WhatsApp' })).toHaveAttribute('href', 'https://wa.me/38761234567');

    await page.getByLabel('Status').selectOption('replied');
    await expect(page.getByText('Marked as replied.')).toBeVisible();
    await page.getByRole('button', { name: 'Archive' }).click();
    await expect(page.getByText('Marked as archived.')).toBeVisible();
    expect(mock.db.contact_messages[0].status).toBe('archived');

    await page.getByRole('tab', { name: /Archived/ }).click();
    await page.getByRole('button', { name: /Marko Lead/ }).click();
    await page.getByRole('button', { name: 'Delete' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Delete' }).click();
    await expect(page.getByText('Message deleted.')).toBeVisible();
    expect(mock.db.contact_messages).toHaveLength(0);
  });

  test('testimonials: publishing requires authenticity confirmation, then shows on home', async ({ page }) => {
    await page.getByRole('link', { name: 'Testimonials' }).click();
    await page.getByRole('button', { name: 'New testimonial' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Author name').fill('Real Client');
    await dialog.getByRole('textbox', { name: 'Testimonial', exact: true }).fill('Working together was straightforward.');
    await dialog.getByText('Published').click();
    await dialog.getByRole('button', { name: 'Save' }).click();
    await expect(dialog.getByText('Confirm this is a genuine testimonial before publishing.')).toBeVisible();
    await dialog.getByText(/given by a real client/).click();
    await dialog.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText('Testimonial added.')).toBeVisible();

    const pub = await page.context().newPage();
    await pub.goto('/');
    await expect(pub.getByText('Working together was straightforward.')).toBeVisible();
    await pub.close();
  });

  test('site settings changes are reflected on the public website', async ({ page, mock }) => {
    await page.getByRole('link', { name: 'Site Settings' }).click();
    await page.getByLabel('Studio name').fill('EK Studio Test');
    await page.getByLabel('Heading').fill('Thoughtful Websites For Ambitious Teams.');
    await page.getByLabel('WhatsApp number').fill('not a number');
    await page.getByRole('button', { name: 'Save settings' }).click();
    await expect(page.getByText('Use international format')).toBeVisible();
    // Local numbers without a country code are rejected (wa.me needs it).
    await page.getByLabel('WhatsApp number').fill('061 000 000');
    await page.getByRole('button', { name: 'Save settings' }).click();
    await expect(page.getByText('Use international format')).toBeVisible();
    await page.getByLabel('WhatsApp number').fill('+387 61 000 000');
    // Availability now lives in Site Settings.
    await page.getByLabel('Status').selectOption('limited');
    await page.getByLabel('Custom message').fill('Booking projects for March');
    await page.getByRole('button', { name: 'Save settings' }).click();
    await expect(page.getByText('Site settings saved.')).toBeVisible();
    expect(mock.db.site_settings[0]).toMatchObject({ whatsapp_number: '38761000000', availability_status: 'limited' });

    const pub = await page.context().newPage();
    await pub.goto('/');
    await expect(pub.getByRole('heading', { level: 1 })).toContainText('Thoughtful Websites For Ambitious');
    await expect(pub.locator('footer')).toContainText('EK Studio Test');
    await expect(pub.getByText('Booking projects for March')).toBeVisible();
    await pub.goto('/contact');
    await expect(pub.getByRole('link', { name: 'WhatsApp +387 61 000 000' })).toBeVisible();
    await pub.close();
  });

  test('profile changes are reflected; contact and social fields live only in Site Settings', async ({ page }) => {
    await page.getByRole('link', { name: 'Profile' }).click();
    await expect(page.getByText(/managed in Site Settings/)).toBeVisible();
    for (const removed of ['Public email', 'Location', 'Instagram', 'Status', 'Custom message']) {
      await expect(page.getByLabel(removed, { exact: true })).toHaveCount(0);
    }
    await page.getByLabel('Working philosophy').fill('Do fewer things, properly.');
    await page.getByRole('button', { name: 'Save profile' }).click();
    await expect(page.getByText('Profile saved.')).toBeVisible();

    const pub = await page.context().newPage();
    await pub.goto('/about');
    await expect(pub.getByRole('heading', { name: 'Working philosophy' })).toBeVisible();
    await expect(pub.getByText('Do fewer things, properly.')).toBeVisible();
    await expect(pub.getByText('Based in Sarajevo')).toBeVisible();
    await pub.close();
  });

  test('media library: upload, view details, in-use protection, delete', async ({ page, mock }) => {
    const tmp = path.join(dir, '..', '..', 'test-results', 'fixtures');
    mkdirSync(tmp, { recursive: true });
    const file = path.join(tmp, 'sample.png');
    writeFileSync(file, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkqPhfDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64'));
    const textFile = path.join(tmp, 'notes.txt');
    writeFileSync(textFile, 'not an image');

    await page.getByRole('link', { name: 'Media Library' }).click();
    await page.getByRole('button', { name: 'General' }).click();
    await expect(page.getByText('unused.png')).toBeVisible();

    // Invalid file types are rejected client-side.
    await page.getByLabel('Upload images').setInputFiles(textFile);
    await expect(page.getByText(/is not a supported image/)).toBeVisible();

    await page.getByLabel('Upload images').setInputFiles(file);
    await expect(page.getByText('1 image uploaded.')).toBeVisible();
    expect([...mock.storage.keys()].some((k) => k.startsWith('general/sample-'))).toBe(true);

    // An in-use image cannot be deleted.
    await page.getByRole('button', { name: 'Projects', exact: true }).click();
    await page.getByRole('button', { name: 'Harbor Apartments' }).click();
    await page.getByRole('button', { name: /cover\.webp/ }).click();
    await expect(page.getByRole('dialog')).toContainText('Project: Harbor Apartments');
    await expect(page.getByRole('dialog').getByRole('button', { name: 'Delete' })).toBeDisabled();
    await page.keyboard.press('Escape');

    // An unused image can.
    await page.getByRole('button', { name: 'General' }).click();
    await page.getByRole('button', { name: /unused\.png/ }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Delete' }).click();
    await page.getByRole('dialog', { name: 'Delete image?' }).getByRole('button', { name: 'Delete' }).click();
    await expect(page.getByText('Image deleted.')).toBeVisible();
    expect(mock.storage.has('general/unused.png')).toBe(false);
  });

  test('admin layout works on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole('button', { name: 'Open admin menu' }).click();
    await page.getByRole('dialog', { name: 'Admin menu' }).getByRole('link', { name: 'Messages' }).click();
    await expect(page.getByRole('heading', { name: 'Messages' })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  });

  test('categories use cards on small screens and a table on larger ones', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/admin/categories');
    await expect(page.getByRole('table')).toBeHidden();
    await expect(page.getByRole('listitem').filter({ hasText: 'Business Websites' })).toBeVisible();
    await page.setViewportSize({ width: 1024, height: 800 });
    await expect(page.getByRole('table')).toBeVisible();
  });
});

test.describe('Admin responsive layout', () => {
  const ADMIN_ROUTES = [
    '/admin', '/admin/projects', '/admin/projects/new', '/admin/categories', '/admin/services',
    '/admin/messages', '/admin/testimonials', '/admin/media', '/admin/profile', '/admin/settings',
  ];

  for (const width of VIEWPORT_WIDTHS) {
    test(`no admin screen overflows at ${width}px`, async ({ page, mock }) => {
      // Long previews reproduce the original dashboard overflow.
      mock.db.contact_messages.push({
        id: 'long', full_name: 'Amra Hodžić', email: 'amra@example.com', company: 'Studio Amra', project_type: 'Booking System',
        budget: null, message: 'Hello, we run four apartments in Mostar and would like an online booking system with a calendar and payments.',
        preferred_contact: 'email', phone: null, status: 'new', read_at: null, created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
      });
      await page.setViewportSize({ width, height: 900 });
      await login(page);
      await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
      for (const route of ADMIN_ROUTES) {
        await page.goto(route);
        await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
        await page.waitForTimeout(300);
        expect(await noHorizontalOverflow(page), `${route} at ${width}px: ${await overflowReport(page)}`).toBe(true);
      }
      // Media library project sub-folder.
      await page.goto('/admin/media');
      await page.getByRole('button', { name: 'Harbor Apartments' }).click();
      await expect(page.getByRole('button', { name: /cover\.webp/ })).toBeVisible();
      expect(await noHorizontalOverflow(page), `media folder at ${width}px: ${await overflowReport(page)}`).toBe(true);
    });
  }
});
