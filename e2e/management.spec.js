import { test, expect } from '@playwright/test';

const apiOrigin = 'http://127.0.0.1:8791';
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aRUsAAAAASUVORK5CYII=', 'base64');

const catalog = [
  { category: 'electronics', name: '桌面显示器', fields: {
    品牌: '示例品牌', 型号: 'P24', 配置: '1440p', 规格: '165 Hz',
  } },
  { category: 'game', name: '星河纪行', fields: {
    平台: 'Switch', 载体: '卡带', 版本: '限定版', 开发商: '北窗工作室', 发售日期: '2026-09-18',
  } },
  { category: 'figure', name: '星旅人手办', fields: {
    作品: '星旅人', 角色: '伊莱', 制造商: '模型工房', 系列: '星空系列', 比例: '1:7', 高度: '24 cm', 预计发售: '2026 Q4',
  } },
];

test('管理界面：三类商品与本地封面，预订付尾款、确认收货和取消购买', async ({ page, context }) => {
  await context.addCookies([{
    name: 'order_room_test', value: 'test-alice', domain: '127.0.0.1', path: '/api/manage', httpOnly: true, sameSite: 'Lax',
  }]);
  await page.goto('/');
  const create = page.locator('#create-product');
  const status = page.locator('#manage-status');
  const detail = page.getByRole('region', { name: '商品详情' });
  const holdings = page.getByRole('region', { name: '持有物' });
  await expect(create).toBeVisible();
  await expect(create.getByLabel(/封面.*(?:链接|URL)|币种/i)).toHaveCount(0);
  await expect(create.locator('input[type="file"]')).toHaveCount(1);
  await expect(holdings.getByText('共 0 件持有物')).toBeVisible();

  for (const { category, name, fields } of catalog) {
    await create.getByLabel('商品名称').fill(name);
    await create.getByRole('combobox', { name: '分类', exact: true }).selectOption(category);
    for (const [label, value] of Object.entries(fields)) await create.getByLabel(label, { exact: true }).fill(value);
    if (category === 'figure') {
      await create.getByLabel('目标价（CNY）').fill('99.90');
      await create.getByLabel('本地封面', { exact: false }).setInputFiles({ name: 'cover.png', mimeType: 'image/png', buffer: png });
    }
    await create.getByRole('button', { name: '添加商品' }).click();
    await expect(status).toHaveText('商品已添加。');
    await page.getByRole('button', { name, exact: true }).click();
    await expect(detail.getByRole('heading', { name, exact: true })).toBeVisible();
    for (const value of Object.values(fields)) await expect(detail.getByText(value, { exact: true })).toBeVisible();
  }
  await expect(detail.getByText('CNY 99.90')).toBeVisible();
  const cover = detail.getByRole('img', { name: '星旅人手办封面' });
  await expect(cover).toBeVisible();
  await expect.poll(() => cover.evaluate(image => image.naturalWidth)).toBe(1);

  const purchaseForm = detail.getByRole('form', { name: '登记购买' });
  await expect(purchaseForm).toBeVisible();
  await expect(purchaseForm.getByLabel(/币种|货币/)).toHaveCount(0);
  await purchaseForm.getByRole('combobox', { name: '购买类型' }).selectOption('preorder');
  await purchaseForm.getByLabel('店铺').fill('预订专卖店');
  await purchaseForm.getByLabel('定金（CNY）').fill('10.01');
  await purchaseForm.getByRole('button', { name: '登记购买' }).click();
  const preorder = detail.getByRole('article').filter({ hasText: '预订专卖店' });
  await expect(preorder.getByText('待收货')).toBeVisible();
  await expect(preorder.getByText('实付合计').locator('+ dd')).toHaveText('CNY 10.01');
  await preorder.getByLabel('尾款（CNY）').fill('20.02');
  await preorder.getByRole('button', { name: '保存付款金额' }).click();
  await expect(preorder.getByText('实付合计').locator('+ dd')).toHaveText('CNY 30.03');
  await preorder.getByLabel('收货日期').fill('2026-11-20');
  await preorder.getByRole('button', { name: '确认收货' }).click();
  await expect(preorder.getByText('已收货')).toBeVisible();
  await expect(holdings.getByText('星旅人手办 · 收货日期 2026-11-20')).toBeVisible();

  await page.reload();
  await expect(holdings.getByText('共 1 件持有物')).toBeVisible();
  await expect(holdings.getByText('星旅人手办 · 收货日期 2026-11-20')).toBeVisible();
  await page.getByRole('button', { name: '星旅人手办', exact: true }).click();
  await expect(preorder.getByText('实付合计').locator('+ dd')).toHaveText('CNY 30.03');
  await expect(preorder.getByRole('button', { name: '确认收货' })).toHaveCount(0);

  await purchaseForm.getByLabel('店铺').fill('备用店');
  await purchaseForm.getByLabel('已付金额（CNY）').fill('15');
  await purchaseForm.getByRole('button', { name: '登记购买' }).click();
  const regular = detail.getByRole('article').filter({ hasText: '备用店' });
  page.once('dialog', dialog => dialog.accept());
  await regular.getByRole('button', { name: '取消购买' }).click();
  await expect(regular.getByText('已取消')).toBeVisible();
  await expect(regular.getByRole('button', { name: '确认收货' })).toHaveCount(0);
  await page.reload();
  await expect(holdings.getByText('共 1 件持有物')).toBeVisible();
  await page.getByRole('button', { name: '星旅人手办', exact: true }).click();
  await expect(regular.getByText('已取消')).toBeVisible();

  await context.clearCookies();
  await page.getByRole('button', { name: '重新加载管理数据' }).click();
  await expect(status).toHaveText('尚未验证身份，无法访问订购管理。');
  await expect(holdings).toBeHidden();
  await expect(page.getByText('星旅人手办', { exact: true })).toHaveCount(0);
});

test('未验证的浏览器会话无法获取管理数据或提交购买', async ({ page }) => {
  const listResponse = page.waitForResponse(`${apiOrigin}/api/manage/products`);
  await page.goto('/');
  expect((await listResponse).status()).toBe(401);
  await expect(page.locator('#manage-status')).toHaveText('尚未验证身份，无法访问订购管理。');
  await expect(page.locator('#product-list')).toBeHidden();
  await expect(page.getByRole('button', { name: '添加商品' })).toHaveCount(0);
  const attemptedPurchase = await page.evaluate(async origin => {
    const response = await fetch(`${origin}/api/manage/products/00000000-0000-4000-8000-000000000000/purchases`, {
      method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind: 'regular', shop: '备用店', amountCents: 1500 }),
    });
    return [response.status, await response.json()];
  }, apiOrigin);
  expect(attemptedPurchase).toEqual([401, { error: 'unauthorized' }]);
});
