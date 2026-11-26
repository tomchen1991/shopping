import { test, expect } from '@playwright/test';

const apiOrigin = 'http://127.0.0.1:8791';
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aRUsAAAAASUVORK5CYII=', 'base64');

test('手办从本地封面和预订流转到展示柜，可分享且可撤销', async ({ page, context, browser }) => {
  await context.addCookies([{
    name: 'order_room_test', value: 'test-room-owner', domain: '127.0.0.1', path: '/api/manage', httpOnly: true, sameSite: 'Lax',
  }]);
  await page.goto('/');
  const room = page.getByRole('region', { name: '我的收藏房间' });
  await expect(room.getByText(/房间不公开/)).toBeVisible();
  await room.getByRole('button', { name: '✎ 布置房间' }).click();
  await expect(room.getByText(/还没有已收货的藏品/)).toBeVisible();

  const name = '潮汐观测员手办';
  const create = page.locator('#create-product');
  await create.getByLabel('商品名称').fill(name);
  await create.getByRole('combobox', { name: '分类', exact: true }).selectOption('figure');
  await create.getByLabel('比例', { exact: true }).fill('1:8');
  await create.getByLabel('感兴趣的原因').fill('只在私人详情显示');
  await create.getByLabel('本地封面', { exact: false }).setInputFiles({ name: 'cover.png', mimeType: 'image/png', buffer: png });
  await create.getByRole('button', { name: '添加商品' }).click();
  await expect(page.locator('#manage-status')).toHaveText('商品已添加。');
  await page.getByRole('button', { name, exact: true }).click();
  const detail = page.getByRole('region', { name: '商品详情' });
  const purchase = detail.getByRole('form', { name: '登记购买' });
  await purchase.getByRole('combobox', { name: '购买类型' }).selectOption('preorder');
  await purchase.getByLabel('店铺').fill('不公开的商店');
  await purchase.getByLabel('定金（CNY）').fill('50.20');
  await purchase.getByRole('button', { name: '登记购买' }).click();
  const record = detail.getByRole('article').filter({ hasText: '不公开的商店' });
  await expect(record.getByText('待收货')).toBeVisible();
  await expect(room.getByRole('button', { name: `将 ${name} 放入房间` })).toHaveCount(0);
  await record.getByLabel('尾款（CNY）').fill('112.30');
  await record.getByRole('button', { name: '保存付款金额' }).click();
  await expect(record.getByText('CNY 162.50')).toBeVisible();
  await record.getByLabel('收货日期').fill('2026-11-22');
  await record.getByRole('button', { name: '确认收货' }).click();
  await expect(record.getByText('已收货')).toBeVisible();

  await room.getByRole('button', { name: `将 ${name} 放入房间` }).click();
  await expect(page.locator('#manage-status')).toHaveText('展品摆放已保存。');
  await room.getByRole('button', { name: '✓ 完成布置' }).click();
  const exhibit = room.getByRole('button', { name: new RegExp(`：${name}（查看商品详情）`) });
  await expect(exhibit).toBeVisible();
  await page.reload();
  await expect(exhibit).toBeVisible();
  const privateCover = exhibit.getByRole('img', { name: `${name}封面` });
  await expect.poll(() => privateCover.evaluate(image => image.naturalWidth)).toBe(1);
  await exhibit.click();
  await expect(detail.getByRole('heading', { name, exact: true })).toBeFocused();
  await expect(detail.getByText('1:8', { exact: true })).toBeVisible();
  await expect(detail.getByText('只在私人详情显示')).toBeVisible();

  await room.getByRole('button', { name: '开启分享' }).click();
  const link = room.getByRole('link');
  await expect(link).toBeVisible();
  const shareUrl = await link.getAttribute('href');
  const visitor = await browser.newContext();
  try {
    const guest = await visitor.newPage();
    const token = new URL(shareUrl).pathname.split('/').at(-1);
    const apiUrl = `${apiOrigin}/api/public/rooms/${token}`;
    await guest.goto(shareUrl);
    const publicRoom = guest.getByRole('region', { name: '公开收藏房间' });
    await expect(publicRoom.getByText(name, { exact: true })).toBeVisible();
    const cover = publicRoom.getByRole('img', { name: `${name}封面` });
    await expect.poll(() => cover.evaluate(image => image.naturalWidth)).toBe(1);
    const originalCover = await cover.getAttribute('src');
    await expect(guest.getByRole('region', { name: '订购管理' })).toHaveCount(0);
    await expect(publicRoom.getByText(/私人详情|不公开的商店|162\.50/)).toHaveCount(0);

    await room.getByRole('button', { name: '关闭分享' }).click();
    await expect(page.locator('#manage-status')).toHaveText('分享已关闭，原链接已失效。');
    await expect(link).toBeHidden();
    for (const url of [apiUrl, originalCover]) expect((await visitor.request.get(url)).status()).toBe(404);
    await guest.reload();
    await expect(publicRoom.getByRole('status')).toHaveText('此房间未公开或链接已失效。');
    await expect(publicRoom.getByText(name, { exact: true })).toHaveCount(0);
  } finally {
    await visitor.close();
  }
});
