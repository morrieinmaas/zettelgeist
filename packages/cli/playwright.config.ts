import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: /.*\.pw\.test\.ts/,
  timeout: 60_000,
  use: {
    baseURL: 'http://localhost:7681',
    headless: true,
  },
  reporter: process.env.CI ? 'github' : 'list',
});
