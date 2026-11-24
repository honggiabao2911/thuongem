import { defineConfig, devices } from '@playwright/test'
export default defineConfig({
  testDir: './tests',
  testMatch: '**/*.spec.ts',
  timeout: 60_000,
  workers: 1,
  use: {
    ...devices['iPhone 13'],
    browserName: 'chromium',
    baseURL: 'http://localhost:8788',
    timezoneId: 'Asia/Ho_Chi_Minh',
    launchOptions: { executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--no-sandbox'] },
  },
  webServer: {
    command: 'node tests/browser-server.ts',
    url: 'http://localhost:8788/',
    timeout: 60_000,
  },
})
