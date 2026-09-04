// Playwright drives the generated site's login flow against a stubbed backend.
// `webServer` serves nuxt/dist, which is exactly what gets deployed.
//
// No visual projects here. Screenshots are a property of a particular site's
// design, so they belong to whatever is built on this template rather than to
// the template itself, which ships no design of its own.
import { defineConfig, devices } from '@playwright/test'

const PORT = 4173

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI
    ? [['list'], ['junit', { outputFile: 'test-results/junit.xml' }], ['html', { open: 'never' }]]
    : [['list']],
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'behaviour',
      testMatch: /e2e\/.*\.spec\.js/,
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: `npx serve --no-clipboard --no-port-switching -l ${PORT} nuxt/dist`,
    url: `http://127.0.0.1:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
})
