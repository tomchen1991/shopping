import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';

// The credential is accepted only by the fixture Worker, not the deployment entrypoint.
async function openPrivatePage(page) {
  await page.context().setExtraHTTPHeaders({ Authorization: 'Bearer test-alice' });
  await page.goto('/');
}
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64');

async function addProduct(page, category, details, cover = false) {
  const name = `${category}-${randomUUID()}`;
  const form = page.locator('#create-product');
  await form.locator('[name=name]').fill(name);
  await form.locator('[name=category]').selectOption(category);
  for (const [key, value] of Object.entries(details)) await form.locator(`[name="${key}"]`).fill(value);
  await expect(form.locator('input[type=url]')).toHaveCount(1);
  await expect(form.locator('input[type=url]')).toHaveAttribute('name', 'link');
  await expect(page.locator('form :is(input,select,textarea)[name*=currency i]')).toHaveCount(0);
  await expect(form.getByLabel(/封面/)).toHaveCount(1);
  await expect(form.getByLabel(/封面/)).toHaveAttribute('type','file');
  if (cover) await form.getByLabel(/封面/).setInputFiles({name:'cover.png', mimeType:'image/png', buffer:png});
  await form.getByRole('button',{name:'添加商品'}).click();
  await expect(page.locator('#product-list')).toContainText(name);
  await expect(page.locator('#manage-status')).toHaveText('商品已添加。');
  return name;
}

async function inspect(page, name) {
  await page.locator('#product-list').getByRole('button',{name:new RegExp(name)}).click();
  const detail = page.locator('#product-detail');
  await expect(detail).toContainText(name);
  return detail;
}

test('preorder deposit and balance, receipt, and cancellation persist independently', async ({page}) => {
  await openPrivatePage(page);
  const name = await addProduct(page,'figure',{character:'测试角色'});
  const detail = await inspect(page,name);
  const form = detail.locator('form').filter({has:page.getByRole('button',{name:'登记购买'})});
  const holdings = page.locator('#holdings-list li');
  const before = await holdings.count();
  await form.getByLabel('购买类型').selectOption('preorder');
  await form.getByLabel('店铺').fill('预订店');
  await form.getByLabel('定金').fill('17.83');
  await expect(form.getByLabel(/币种|currency/i)).toHaveCount(0);
  await form.getByRole('button').click();
  const card = detail.getByRole('article').filter({hasText:'预订店'});
  const total = card.locator('dt').filter({hasText:'实付合计'}).locator('+ dd');
  await expect(total).toHaveText('CNY 17.83');
  await card.getByLabel('尾款').fill('28.49');
  await card.getByRole('button',{name:'保存付款金额'}).click();
  await expect(total).toHaveText('CNY 46.32');
  await card.getByLabel('收货日期').fill('2025-06-01');
  await card.getByRole('button',{name:'确认收货'}).click();
  await expect(holdings).toHaveCount(before + 1);
  await page.reload();
  await expect(holdings.filter({hasText:name})).toContainText('2025-06-01');
  await inspect(page,name);
  await expect(card).toContainText('已收货');
  await expect(total).toHaveText('CNY 46.32');
  await form.getByLabel('店铺').fill('取消店');
  await form.getByLabel('已付金额').fill('5.15');
  await form.getByRole('button').click();
  const cancelled = detail.getByRole('article').filter({hasText:'取消店'});
  page.once('dialog', dialog => dialog.accept());
  await cancelled.getByRole('button',{name:'取消购买'}).click();
  await expect(cancelled).toContainText('已取消');
  await page.reload();
  await inspect(page,name);
  await expect(cancelled).toContainText('已取消');
  await expect(holdings).toHaveCount(before + 1);
  await expect(holdings.filter({hasText:name})).toHaveCount(1);
});

test('three categories retain specific fields and a locally selected cover', async ({ page }) => {
  await openPrivatePage(page);
  const rows = [];
  for (const [category, data] of [
    ['electronics',{brand:'品牌 QA',model:'Model-X',configuration:'32GB',specifications:'600g'}],
    ['game',{platform:'掌机',medium:'卡带',edition:'典藏',developer:'游戏社',releaseDate:'2025-06-01'}],
    ['figure',{work:'原作 QA',character:'角色 QA',manufacturer:'厂商 QA',series:'花园系列',scale:'1/8',height:'24cm',expectedRelease:'2026-12-10'}]
  ]) rows.push([await addProduct(page,category,data,category==='figure'), data]);
  await page.reload();
  for (const [name,data] of rows) {
    const detail = await inspect(page,name);
    for (const value of Object.values(data)) await expect(detail).toContainText(value);
    if (data.work) await expect.poll(() => detail.locator('img').evaluateAll(images => images.some(img => img.complete && img.naturalWidth > 0))).toBe(true);
  }
});
