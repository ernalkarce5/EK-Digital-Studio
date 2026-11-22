import { defineConfig, devices } from '@playwright/test';

const PORT = 4174;

// The suite builds the app against a mock Supabase origin (intercepted in the
// browser by tests/e2e/mock-supabase.ts), so it needs no external services.
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  // `vite preview` occasionally stalls the HTML response under heavier parallel
  // load (observed: 45 s for index.html at 4 workers), so keep concurrency modest.
  workers: 2,
  reporter: [['list']],
  timeout: 45_000,
  expect: { timeout: 8_000 },
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: `npx vite build --outDir dist-e2e --emptyOutDir && npx vite preview --outDir dist-e2e --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    env: {
      VITE_SUPABASE_URL: 'http://mock-supabase.test',
      VITE_SUPABASE_ANON_KEY: 'e2e-anon-key',
      VITE_SITE_URL: `http://localhost:${PORT}`,
    },
  },
});
