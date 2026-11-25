import { test, expect } from '@playwright/test';

test('anonymous browser cannot list private data or submit a purchase', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#manage-status')).toContainText('尚未验证身份');
  await expect(page.locator('#management')).toBeHidden();
  const responses = await page.evaluate(async () => {
    const call = async (path, init) => {
      const r = await fetch('http://127.0.0.1:8791/api/manage/' + path, {credentials: 'include', ...init});
      return [r.status, await r.json()];
    };
    return Promise.all([call('products'), call('holdings'), call('products/12345678-abcd-1234-abcd-123456789abc/purchases', {
      method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({kind: 'preorder', shop: 'Private', depositCents: 101})
    })]);
  });
  expect(responses).toEqual(Array.from({length: 3}, () => [401, {error: 'unauthorized'}]));
});
