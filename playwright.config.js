// Playwright drives the generated site: the login flow against a stubbed
// backend, and this site's visual baselines. `webServer` serves nuxt/dist,
// which is exactly what gets deployed.
//
// The visual projects live on this branch rather than on main, because a
// screenshot is a property of a design and main carries none: it holds only
// what the serverless template can take upstream.
import { defineConfig, devices } from '@playwright/test'

const PORT = 4173

// Chromium renders text differently on arm64 and x86_64, so one baseline set
// cannot satisfy both CI systems: the GitLab runner here is arm64 and GitHub's
// ubuntu-latest is x64. Baselines are kept per architecture rather than one
// side permanently failing on the other's PNGs.
const ARCH = process.arch

export default defineConfig({
  testDir: './tests',
  snapshotPathTemplate: `{testDir}/visual/__screenshots__/{arg}-{projectName}-${ARCH}{ext}`,
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI
    ? [['list'], ['junit', { outputFile: 'test-results/junit.xml' }], ['html', { open: 'never' }]]
    : [['list']],
  expect: {
    // An absolute pixel budget rather than a ratio. A proportional threshold
    // scales with the viewport, so the same real change passes on a wide screen
    // and fails on a phone. A flat budget is the same sensitivity everywhere,
    // and per-architecture baselines keep the render deterministic enough to
    // hold it low.
    toHaveScreenshot: { maxDiffPixels: 120 },
  },
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
    {
      name: 'phone',
      testMatch: /visual\/.*\.spec\.js/,
      use: { ...devices['Desktop Chrome'], viewport: { width: 375, height: 844 } },
    },
    {
      name: 'tablet',
      testMatch: /visual\/.*\.spec\.js/,
      use: { ...devices['Desktop Chrome'], viewport: { width: 768, height: 1180 } },
    },
    {
      name: 'desktop',
      testMatch: /visual\/.*\.spec\.js/,
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 900 } },
    },
    {
      name: 'wide',
      testMatch: /visual\/.*\.spec\.js/,
      use: { ...devices['Desktop Chrome'], viewport: { width: 1680, height: 900 } },
    },
  ],
  webServer: {
    command: `npx serve --no-clipboard --no-port-switching -l ${PORT} nuxt/dist`,
    url: `http://127.0.0.1:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
})
