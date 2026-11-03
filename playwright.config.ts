import { defineConfig, devices } from '@playwright/test';

const PORT = 4281; // distinct from `pnpm preview` (4180) so a running dev/preview server is never reused

export default defineConfig({
  testDir: './e2e',
  timeout: 45_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    acceptDownloads: true,
  },
  // Both projects start as a returning visitor, so first run (R-08) doesn't change the other specs. e2e/firstRun.spec.ts
  // opts back in with an empty profile.
  projects: [
    // The classic interface, kept under test now that the redesign is the default.
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        storageState: {
          cookies: [],
          origins: [
            {
              origin: `http://localhost:${PORT}`,
              localStorage: [
                { name: 'conduitcraft-ui', value: '1' },
                { name: 'conduitcraft-first-run-seen', value: '1' },
              ],
            },
          ],
        },
      },
    },
    // The same suite against the redesigned interface (`?ui=2` remembered in localStorage). Specs that
    // exercise controls the redesign deliberately moved are listed in UI2_SKIP below.
    {
      name: 'chromium-ui2',
      use: {
        ...devices['Desktop Chrome'],
        storageState: {
          cookies: [],
          origins: [
            {
              origin: `http://localhost:${PORT}`,
              localStorage: [
                { name: 'conduitcraft-ui', value: '2' },
                { name: 'conduitcraft-first-run-seen', value: '1' },
              ],
            },
          ],
        },
      },
    },
  ],
  // Test the production build: it is what ships, and it is where the lazy chunks and GIF worker live.
  webServer: {
    command: `pnpm build && pnpm exec vite preview --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
