import { test, expect, noHorizontalOverflow, overflowReport, VIEWPORT_WIDTHS } from './fixtures';

test.describe('Public website', () => {
  test('home page renders all sections from data without console errors', async ({ page, mock, consoleErrors }) => {
    void mock;
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('We Build Digital Experiences That Move Businesses');
    await expect(page.getByText('Available for new projects').first()).toBeVisible();
    await expect(page.getByText('Intro text from the profile.')).toBeVisible();
    // One featured project in the fixtures, topped up with the next published one; never drafts.
    await expect(page.getByRole('heading', { name: 'Harbor Apartments' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Studio Barber' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Secret Draft' })).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Website Design', exact: true })).toBeVisible();
    for (const step of ['Discovery', 'Planning', 'Design', 'Development', 'Testing', 'Deployment']) {
      await expect(page.getByRole('heading', { name: step, exact: true })).toBeVisible();
    }
    await expect(page.getByRole('heading', { name: 'Have a project in mind?' })).toBeVisible();
    // Testimonials section is hidden while none are published.
    await expect(page.getByText('What clients')).toHaveCount(0);
    await expect(page).toHaveTitle('Ernal Karce — EK Digital Studio');
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', /localhost:4174$/);
    expect(consoleErrors).toEqual([]);
  });

  test('navigation reaches every page with unique titles', async ({ page, mock, consoleErrors }) => {
    void mock;
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    const nav = page.getByRole('navigation', { name: 'Main' });
    const expected: Array<[string, RegExp, RegExp]> = [
      ['About', /\/about$/, /^About — Ernal Karce$/],
      ['Projects', /\/projects$/, /^Projects — Ernal Karce$/],
      ['Services', /\/services$/, /^Services — Ernal Karce$/],
      ['Process', /\/process$/, /^Development Process — Ernal Karce$/],
      ['Contact', /\/contact$/, /^Contact — Ernal Karce$/],
      ['Home', /\/$/, /^Ernal Karce — EK Digital Studio$/],
    ];
    for (const [label, url, title] of expected) {
      await nav.getByRole('link', { name: label, exact: true }).click();
      await expect(page).toHaveURL(url);
      await expect(page).toHaveTitle(title);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    }
    await page.getByRole('link', { name: 'Start a Project' }).first().click();
    await expect(page).toHaveURL(/\/contact$/);
    expect(consoleErrors).toEqual([]);
  });

  test('about page renders profile sections and hides empty ones', async ({ page, mock }) => {
    void mock;
    await page.goto('/about');
    await expect(page.getByRole('heading', { name: 'Professional background' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'My approach to projects' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Working philosophy' })).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Technologies I work with' })).toBeVisible();
  });

  test('projects: lists published only, filters by category, searches', async ({ page, mock }) => {
    void mock;
    await page.goto('/projects');
    const cards = page.locator('article');
    await expect(cards).toHaveCount(3);
    await expect(page.getByText('Secret Draft')).toHaveCount(0);
    await expect(page.getByText('Demo Project').first()).toBeVisible();

    // Categories without published projects are hidden ("Other" only has a draft).
    const toolbar = page.getByRole('toolbar', { name: 'Filter by category' });
    await expect(toolbar.getByRole('button')).toHaveCount(4); // All + 3 non-empty
    for (const empty of [/^Real Estate/, /^Interactive Applications/, /^Other/]) {
      await expect(toolbar.getByRole('button', { name: empty })).toHaveCount(0);
    }

    await page.getByRole('button', { name: /^E-commerce/ }).click();
    await expect(page).toHaveURL(/category=e-commerce/);
    await expect(cards).toHaveCount(1);
    await expect(cards.first()).toContainText('Shopfront Kit');

    await page.getByRole('button', { name: /^All/ }).click();
    await page.getByLabel('Search projects').fill('supabase');
    await expect(cards).toHaveCount(1);
    await expect(cards.first()).toContainText('Harbor Apartments');

    await page.getByLabel('Search projects').fill('nothing-matches-this');
    await expect(page.getByText('No matching projects')).toBeVisible();
    await page.getByRole('button', { name: 'Clear filters' }).click();
    await expect(cards).toHaveCount(3);
  });

  test('project details: content, demo notice, live demo, prev/next, back', async ({ page, mock, consoleErrors }) => {
    void mock;
    await page.goto('/projects');
    await page.getByRole('link', { name: 'View details: Harbor Apartments' }).click();
    await expect(page).toHaveURL(/\/projects\/harbor-apartments$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Harbor Apartments' })).toBeVisible();
    await expect(page).toHaveTitle('Harbor Apartments — Ernal Karce');
    await expect(page.getByText(/This is a demo project/)).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Objectives' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Implemented functionality' })).toBeVisible();
    const demo = page.getByRole('link', { name: 'Open Live Demo' });
    await expect(demo).toHaveAttribute('href', 'https://example.com/harbor');
    await expect(demo).toHaveAttribute('target', '_blank');
    await expect(page.getByRole('button', { name: /Open screenshot/ })).toHaveCount(2);

    await page.getByRole('button', { name: 'Open screenshot 1 of 2' }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);

    // First project: the "previous" slot is a real "All projects" link, not an empty box.
    const more = page.getByRole('navigation', { name: 'More projects' });
    await expect(more.getByRole('link')).toHaveCount(2);
    await expect(more.getByRole('link', { name: /All projects/ })).toHaveAttribute('href', '/projects');

    await page.getByRole('link', { name: /Next Studio Barber/ }).click();
    await expect(page).toHaveURL(/\/projects\/studio-barber$/);
    await expect(page.getByRole('link', { name: /Previous Harbor Apartments/ })).toBeVisible();
    await page.getByRole('link', { name: 'Back to Projects' }).click();
    await expect(page).toHaveURL(/\/projects$/);
    expect(consoleErrors).toEqual([]);
  });

  test('draft and unknown project slugs render the 404 page', async ({ page, mock }) => {
    void mock;
    await page.goto('/projects/secret-draft');
    await expect(page.getByRole('heading', { name: 'This page could not be found' })).toBeVisible();
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex, nofollow');
    await page.goto('/this/route/does-not-exist');
    await expect(page.getByRole('heading', { name: 'This page could not be found' })).toBeVisible();
    await page.getByRole('link', { name: 'Back to Home' }).click();
    await expect(page).toHaveURL(/\/$/);
  });

  test('services page: overview, grouped details, jump links', async ({ page, mock }) => {
    void mock;
    await page.goto('/services');
    const overview = page.getByRole('navigation', { name: 'Services overview' });
    await expect(overview.getByRole('link')).toHaveCount(7);
    await expect(page.locator('[data-service]')).toHaveCount(7);
    for (const group of ['Design', 'Build', 'Care & support']) {
      await expect(page.getByRole('heading', { level: 2, name: group, exact: true })).toBeVisible();
    }
    await overview.getByRole('link', { name: /Website Maintenance/ }).click();
    await expect(page).toHaveURL(/#website-maintenance$/);
    await expect(page.locator('#website-maintenance')).toBeInViewport();
    await page.locator('#booking-reservation-systems').getByRole('link', { name: 'Discuss this service' }).click();
    await expect(page).toHaveURL(/\/contact\?type=Booking(%20|\+)System/);
    await expect(page.getByLabel('Project type')).toHaveValue('Booking System');
  });

  test('contact form validates, submits to the RPC and confirms', async ({ page, mock, consoleErrors }) => {
    await page.goto('/contact');
    await expect(page.getByRole('link', { name: /Instagram instagram\.com/ })).toHaveAttribute('href', 'https://instagram.com/example');
    await expect(page.getByRole('link', { name: /WhatsApp/ }).first()).toHaveAttribute('href', 'https://wa.me/38761000000');
    // WhatsApp number is displayed formatted.
    await expect(page.getByRole('link', { name: 'WhatsApp +387 61 000 000' })).toBeVisible();
    // Privacy notice next to the form.
    await expect(page.locator('form').getByRole('link', { name: 'Privacy Policy' })).toHaveAttribute('href', '/privacy');
    // No phone field unless phone/WhatsApp is chosen.
    await expect(page.getByLabel('Phone number')).toHaveCount(0);

    await page.getByRole('button', { name: 'Send message' }).click();
    await expect(page.getByText('Please enter your full name.')).toBeVisible();
    await expect(page.getByText('Please enter a valid email address.')).toBeVisible();
    await expect(page.getByText('Please choose a project type.')).toBeVisible();
    await expect(page.getByText('Please describe your project in at least 20 characters.')).toBeVisible();
    expect(mock.rpcCalls.filter((c) => c.fn === 'submit_contact_message')).toHaveLength(0);

    await page.getByLabel('Full name').fill('Ana Client');
    await page.getByLabel('Email address').fill('ana@example.com');
    await page.getByLabel('Company name').fill('Ana Co');
    await page.getByLabel('Project type').selectOption('Website Redesign');
    await page.getByLabel('Estimated budget').selectOption({ index: 2 });
    await page.getByLabel('Project description').fill('We need a redesign of our outdated company website.');
    await page.waitForTimeout(2100); // humans take longer than the anti-bot threshold
    await page.getByRole('button', { name: 'Send message' }).click();
    await expect(page.getByRole('heading', { name: 'Thank you, your message has been sent.' })).toBeVisible();

    const call = mock.rpcCalls.find((c) => c.fn === 'submit_contact_message')!;
    expect(call.body).toMatchObject({
      p_full_name: 'Ana Client',
      p_email: 'ana@example.com',
      p_company: 'Ana Co',
      p_project_type: 'Website Redesign',
      p_preferred_contact: 'email',
      p_website: null,
      p_phone: null,
    });
    expect(mock.db.contact_messages).toHaveLength(1);
    expect(consoleErrors).toEqual([]);
  });

  test('contact form: phone field is conditional, required and validated', async ({ page, mock, consoleErrors }) => {
    await page.goto('/contact');
    await page.getByLabel('Full name').fill('Ana Client');
    await page.getByLabel('Email address').fill('ana@example.com');
    await page.getByLabel('Project type').selectOption('Booking System');
    await page.getByLabel('Project description').fill('We need online booking for our apartments.');

    // WhatsApp → field appears and is required.
    await page.getByLabel('Preferred contact method').selectOption('whatsapp');
    const phone = page.getByLabel('Phone number');
    await expect(phone).toBeVisible();
    await page.getByRole('button', { name: 'Send message' }).click();
    await expect(page.getByText('Please enter a phone number so I can contact you that way.')).toBeVisible();

    // Invalid number is rejected client-side.
    await phone.fill('call me');
    await page.getByRole('button', { name: 'Send message' }).click();
    await expect(page.getByText(/Please enter a valid phone number/)).toBeVisible();
    expect(mock.rpcCalls.filter((c) => c.fn === 'submit_contact_message')).toHaveLength(0);

    // Back to email → field disappears and no longer blocks submission.
    await page.getByLabel('Preferred contact method').selectOption('email');
    await expect(phone).toHaveCount(0);

    // Phone → valid formatted number is normalised and saved with the inquiry.
    await page.getByLabel('Preferred contact method').selectOption('phone');
    await page.getByLabel('Phone number').fill('+387 (61) 234-567');
    await page.waitForTimeout(2100);
    await page.getByRole('button', { name: 'Send message' }).click();
    await expect(page.getByRole('heading', { name: 'Thank you, your message has been sent.' })).toBeVisible();
    const call = mock.rpcCalls.find((c) => c.fn === 'submit_contact_message')!;
    expect(call.body).toMatchObject({ p_preferred_contact: 'phone', p_phone: '+38761234567' });
    expect(mock.db.contact_messages[0].phone).toBe('+38761234567');
    expect(consoleErrors).toEqual([]);
  });

  test('privacy policy page is linked from the footer and describes actual data use', async ({ page, mock, consoleErrors }) => {
    void mock;
    await page.goto('/');
    await page.locator('footer').getByRole('link', { name: 'Privacy Policy' }).click();
    await expect(page).toHaveURL(/\/privacy$/);
    await expect(page).toHaveTitle('Privacy Policy — Ernal Karce');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Privacy');
    for (const h of ['Who is responsible', 'Contact form', 'Cookies and local storage', 'Service providers', 'Your rights']) {
      await expect(page.getByRole('heading', { level: 2, name: h })).toBeVisible();
    }
    await expect(page.getByText(/one-way hash of your IP address/)).toBeVisible();
    await expect(page.getByRole('link', { name: 'hello@example.com' }).first()).toHaveAttribute('href', 'mailto:hello@example.com');
    expect(consoleErrors).toEqual([]);
  });

  test('no Google Fonts or other third-party font requests; default share image set', async ({ page, mock }) => {
    void mock;
    const external: string[] = [];
    page.on('request', (r) => {
      const u = new URL(r.url());
      if (!['localhost', 'mock-supabase.test'].includes(u.hostname)) external.push(r.url());
    });
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    expect(external).toEqual([]);
    const fonts = await page.evaluate(async () => {
      await document.fonts.ready;
      return [...document.fonts].filter((f) => f.status === 'loaded').map((f) => f.family);
    });
    expect(fonts).toEqual(expect.arrayContaining(['Geist', 'Instrument Serif']));
    await expect(page.locator('meta[property="og:image"]')).toHaveAttribute('content', /\/og-image\.png$/);
    await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveAttribute('href', '/apple-touch-icon.png');
    for (const asset of ['/og-image.png', '/apple-touch-icon.png', '/fonts/geist-latin.woff2', '/theme-init.js']) {
      const res = await page.request.get(asset);
      expect(res.status(), asset).toBe(200);
    }
  });

  test('contact form shows server-side validation errors on the field', async ({ page, mock }) => {
    void mock;
    await page.goto('/contact');
    await page.getByLabel('Full name').fill('Ana Client');
    await page.getByLabel('Email address').fill('ana@server-rejects.test');
    await page.getByLabel('Project type').selectOption('Other');
    await page.getByLabel('Project description').fill('This description is long enough to pass.');
    await page.waitForTimeout(2100);
    await page.getByRole('button', { name: 'Send message' }).click();
    await expect(page.getByText('Server says: email not accepted.')).toBeVisible();
    await expect(page.getByRole('heading', { name: /Thank you/ })).toHaveCount(0);

    // Rate limiting surfaces as a form-level error, not a fake success.
    await page.getByLabel('Email address').fill('ratelimited@example.com');
    await page.getByRole('button', { name: 'Send message' }).click();
    await expect(page.getByRole('alert').filter({ hasText: 'Too many messages sent recently' })).toBeVisible();
    await expect(page.getByRole('heading', { name: /Thank you/ })).toHaveCount(0);
  });

  test('theme toggle switches between dark and light', async ({ page, mock }) => {
    void mock;
    await page.goto('/');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await page.getByRole('button', { name: 'Switch to light theme' }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  });

  test('images load (no broken images) on home and project pages', async ({ page, mock }) => {
    void mock;
    for (const path of ['/', '/projects', '/projects/harbor-apartments', '/about']) {
      await page.goto(path);
      await page.waitForLoadState('networkidle');
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await page.waitForTimeout(300);
      const broken = await page.evaluate(() =>
        Array.from(document.images)
          .filter((img) => img.complete && img.naturalWidth === 0 && img.getAttribute('loading') !== 'lazy')
          .map((img) => img.src),
      );
      expect(broken, path).toEqual([]);
    }
  });
});

test.describe('Responsive layout', () => {
  const pages = ['/', '/about', '/projects', '/projects/harbor-apartments', '/services', '/process', '/contact', '/privacy', '/nope'];

  for (const width of VIEWPORT_WIDTHS) {
    test(`no horizontal overflow at ${width}px`, async ({ page, mock }) => {
      void mock;
      await page.setViewportSize({ width, height: 900 });
      for (const path of pages) {
        await page.goto(path);
        await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
        await page.waitForTimeout(200);
        expect(await noHorizontalOverflow(page), `${path} at ${width}px: ${await overflowReport(page)}`).toBe(true);
      }
    });
  }

  test('category chips show a scroll hint on narrow screens', async ({ page, mock }) => {
    // Enough categories with projects that the chip row must scroll at 360px.
    mock.db.projects.forEach((p, i) => {
      p.status = 'published';
      p.category_id = mock.db.categories[i % mock.db.categories.length].id;
    });
    mock.db.projects.push(
      { ...mock.db.projects[1], id: 'extra-1', slug: 'extra-1', title: 'Extra One', category_id: mock.db.categories[4].id },
      { ...mock.db.projects[1], id: 'extra-2', slug: 'extra-2', title: 'Extra Two', category_id: mock.db.categories[5].id },
    );
    await page.setViewportSize({ width: 360, height: 800 });
    await page.goto('/projects');
    const fade = page.getByTestId('chips-fade-right');
    await expect(fade).toHaveCSS('opacity', '1');
    await page.getByRole('toolbar', { name: 'Filter by category' }).evaluate((el) => (el.scrollLeft = el.scrollWidth));
    await expect(fade).toHaveCSS('opacity', '0');

    await page.setViewportSize({ width: 1920, height: 900 });
    await expect(fade).toHaveCSS('opacity', '0');
  });

  test('contact form comes before contact details on mobile, after on desktop', async ({ page, mock }) => {
    void mock;
    const formFirst = () =>
      page.evaluate(() => {
        const form = document.querySelector('form')!.getBoundingClientRect().top;
        const details = [...document.querySelectorAll('h2')].find((h) => h.textContent === 'Direct contact')!.getBoundingClientRect().top;
        return form < details;
      });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/contact');
    await expect(page.locator('form')).toBeVisible();
    expect(await formFirst()).toBe(true);
    await page.setViewportSize({ width: 1440, height: 900 });
    // Desktop: side by side, details column on the left.
    const left = await page.evaluate(() => {
      const form = document.querySelector('form')!.getBoundingClientRect().left;
      const details = [...document.querySelectorAll('h2')].find((h) => h.textContent === 'Direct contact')!.getBoundingClientRect().left;
      return details < form;
    });
    expect(left).toBe(true);
  });

  test('mobile menu opens, navigates and closes', async ({ page, mock }) => {
    void mock;
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    await expect(page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'About', exact: true })).toBeHidden();
    await page.getByRole('button', { name: 'Open menu' }).click();
    const menu = page.locator('#mobile-menu');
    await expect(menu).toBeVisible();
    await menu.getByRole('link', { name: /Services/ }).click();
    await expect(page).toHaveURL(/\/services$/);
    await expect(menu).toHaveCount(0);
  });
});
