import { expect, test } from '@playwright/test';

const healthUrl = 'http://127.0.0.1:8791/api/health';

test('静态页面通过浏览器连接本地 Worker', async ({ page }) => {
  const healthResponse = page.waitForResponse(healthUrl);
  await page.goto('/');

  const response = await healthResponse;
  expect(response.status()).toBe(200);
  expect(await response.json()).toEqual({ status: 'ok' });
  await expect(page.getByRole('heading', { name: '订购小屋' })).toBeVisible();
  await expect(page.getByRole('status')).toHaveText('API 连接正常');
});

test('连接失败后可以从页面重试', async ({ page }) => {
  await page.route(healthUrl, (route) => route.abort(), { times: 1 });
  await page.goto('/');
  await expect(page.getByRole('status')).toHaveText('无法连接 API，请重试。');

  await page.getByRole('button', { name: '重新检查' }).click();
  await expect(page.getByRole('status')).toHaveText('API 连接正常');
});
