import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  expect: { timeout: 8_000 },
  fullyParallel: false,
  reporter: 'list',
  use: {
    headless: true,
    baseURL: 'http://localhost:4173',
  },
  webServer: {
    // Serve the already-built editor/dist using vite preview
    command: 'npx vite preview --port 4173 --config editor/vite.config.ts',
    port: 4173,
    reuseExistingServer: false,
    timeout: 15_000,
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        executablePath: '/usr/bin/chromium-browser',
      },
    },
  ],
});
