import { defineConfig, devices } from '@playwright/test';

const webOrigin = 'http://127.0.0.1:4173';
const apiOrigin = 'http://127.0.0.1:8791';

export default defineConfig({
  testDir: './e2e',
  use: { ...devices['Desktop Chrome'], baseURL: webOrigin },
  webServer: [
    {
      command: 'pnpm --filter @order-room/api dev --ip 127.0.0.1 --port 8791 --var WEB_ORIGIN:http://127.0.0.1:4173',
      url: `${apiOrigin}/api/health`,
      reuseExistingServer: false,
      timeout: 60_000,
    },
    {
      command: 'pnpm --filter @order-room/web build --outDir dist-e2e && pnpm --filter @order-room/web preview --outDir dist-e2e --host 127.0.0.1 --port 4173 --strictPort',
      env: { VITE_API_BASE_URL: apiOrigin },
      url: webOrigin,
      reuseExistingServer: false,
      timeout: 60_000,
    },
  ],
});
