import { test, expect } from '@playwright/test';

test('a failed health check can recover by retrying against the separate Worker', async ({ page }) => {
  const endpoint = '**/api/health';
  await page.route(endpoint, route => route.abort('failed'));
  await page.goto('/');
  await expect(page.getByText('无法连接 API，请重试。')).toBeVisible();

  await page.unroute(endpoint);
  const incoming = page.waitForResponse(response => new URL(response.url()).pathname === '/api/health');
  await page.locator('#check-health').click();
  const response = await incoming;
  expect(new URL(response.url()).origin).not.toBe(new URL(page.url()).origin);
  expect(response.status()).toBe(200);
  expect(await response.json()).toMatchObject({ status: 'ok' });
  await expect(page.getByText('API 连接正常')).toBeVisible();
});
