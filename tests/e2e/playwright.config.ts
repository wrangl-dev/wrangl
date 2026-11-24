import { defineConfig, devices } from '@playwright/test';
import { BASE_URL } from './server';

// End-to-end tests: the real UI and the real Rust backend (wrangl-web), with a scripted ACP
// agent instead of an LLM. Needs `bun run web:build` and a built wrangl-web first;
// `bun run test:e2e` does both.
export default defineConfig({
  testDir: '.',
  testMatch: /.*\.spec\.ts$/,
  globalSetup: './global-setup.ts',
  // One server, one shared data folder: run the specs one after another.
  workers: 1,
  fullyParallel: false,
  retries: 0,
  forbidOnly: Boolean(process.env.CI),
  reporter: process.env.CI ? [['list'], ['github']] : [['list']],
  expect: { timeout: 15_000 },
  outputDir: './.out',
  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
    colorScheme: 'dark',
    ...devices['Desktop Chrome'],
    // E2E_CHANNEL=msedge (or chrome) uses an installed browser instead of Playwright's Chromium.
    channel: process.env.E2E_CHANNEL || undefined,
    viewport: { width: 1360, height: 860 },
  },
});
