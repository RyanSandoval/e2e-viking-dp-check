import { defineConfig, devices } from '@playwright/test';

/**
 * Viking Pricing Page Monitor - Playwright Configuration
 *
 * Runs tests against discovered pricing URLs with parallel execution
 * and comprehensive reporting.
 */
export default defineConfig({
  testDir: './src/tests',

  // Run tests in parallel with max 10 workers to avoid rate limiting
  fullyParallel: true,
  workers: process.env.CI ? 10 : 5,

  // Fail the build on CI if you accidentally left test.only in the source code
  forbidOnly: !!process.env.CI,

  // Retry on CI only
  retries: process.env.CI ? 2 : 0,

  // Reporter configuration
  reporter: [
    ['html', { open: 'never' }],
    ['json', { outputFile: 'test-results/results.json' }],
    ['list'],
  ],

  // Global timeout: 2 hours for full test run (1500+ URLs)
  globalTimeout: 120 * 60 * 1000,

  // Shared settings for all projects
  use: {
    // Base URL can be overridden per test
    baseURL: 'https://www.viking.com',

    // Collect trace on first retry
    trace: 'on-first-retry',

    // Screenshot on failure
    screenshot: 'only-on-failure',

    // Video on failure (helps debug issues)
    video: 'retain-on-failure',

    // Navigation timeout: 10 seconds as per requirements
    navigationTimeout: 10000,

    // Action timeout
    actionTimeout: 5000,

    // Viewport
    viewport: { width: 1280, height: 720 },

    // User agent to identify our bot
    userAgent: 'Viking-Pricing-Monitor/1.0 (Automated Testing)',
  },

  // Test timeout per individual test (0 = no timeout, managed by globalTimeout)
  timeout: 0,

  // Expect timeout
  expect: {
    timeout: 5000,
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  // Output folder for test artifacts
  outputDir: 'test-results',
});
