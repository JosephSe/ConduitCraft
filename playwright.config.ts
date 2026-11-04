import { defineConfig, devices } from '@playwright/test';

const PORT = 4281; // distinct from `pnpm preview` (4180) so a running dev/preview server is never reused

/** The redesigned interface, as a returning visitor (first run would otherwise cover the canvas). */
const ui2State = {
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
};

/** A tablet: touch input and a coarse pointer, so `(pointer: coarse)` rules apply. Only e2e/touch.spec.ts runs on these. */
const tablet = (width: number, height: number) => ({
  ...devices['Desktop Chrome'],
  viewport: { width, height },
  hasTouch: true,
  isMobile: true,
  deviceScaleFactor: 2,
  storageState: ui2State,
});

export default defineConfig({
  testDir: './e2e',
  // The touch flows run on the tablet projects only; the desktop projects skip them.
  testIgnore: ['**/touch.spec.ts'],
  // Visual baselines (e2e/exportVisual.spec.ts) are shared by every platform; the spec compares with a tolerance.
  snapshotPathTemplate: '{testDir}/__screenshots__/{testFileName}/{arg}{ext}',
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
    // Tablets (A12): the core flows by touch, portrait and landscape.
    { name: 'tablet-portrait', testIgnore: [], testMatch: ['**/touch.spec.ts'], use: tablet(768, 1024) },
    { name: 'tablet-landscape', testIgnore: [], testMatch: ['**/touch.spec.ts'], use: tablet(1024, 768) },
  ],
  // Test the production build: it is what ships, and it is where the lazy chunks and GIF worker live.
  webServer: {
    command: `pnpm build && pnpm exec vite preview --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
