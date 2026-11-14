import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './tests',
  testMatch: 'desktop.spec.ts',
  workers: 1,
  timeout: 100_000,
  expect: { timeout: 10_000 },
})
