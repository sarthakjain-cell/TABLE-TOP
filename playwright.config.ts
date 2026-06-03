import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright E2E Testing configuration for Table Top.
 * Tailored for multi-GUI WebSocket execution flows.
 */
export default defineConfig({
  testDir: './e2e',
  
  /* Maximum time one test can run for */
  timeout: 45 * 1000,
  
  expect: {
    timeout: 8000
  },
  
  /* Run tests in files in parallel */
  fullyParallel: false, // Disabled to maintain sequential state integrity in testing
  
  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: !!process.env.CI,
  
  /* Retry on CI only */
  retries: process.env.CI ? 2 : 0,
  
  /* Limit workers to 1 to prevent table state overrides during DB transactions */
  workers: 1,
  
  /* Reporter to use. See https://playwright.dev/docs/test-reporters */
  reporter: 'html',
  
  /* Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions. */
  use: {
    /* Base URL to use in actions like `await page.goto('/')`. */
    baseURL: 'http://localhost:3000',

    /* Collect trace when retrying a failed test. See https://playwright.dev/docs/trace-viewer */
    trace: 'on-first-retry',
    
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },

  /* Configure projects for major browsers */
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
