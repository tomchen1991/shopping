import { test, expect } from '@playwright/test';

const apiOrigin = 'http://127.0.0.1:8791';

function buildMinimalGlb() {
  const json = Buffer.from(JSON.stringify({ asset: { version: '2.0' }, scenes: [{ nodes: [] }], scene: 0 }));
  const pad = (4 - (json.length % 4)) % 4;
  const chunkLen = json.length + pad;
  const totalLen = 12 + 8 + chunkLen;
  const out = Buffer.alloc(totalLen, 0x20);
  out.writeUInt32LE(0x46546C67, 0);
  out.writeUInt32LE(2, 4);
  out.writeUInt32LE(totalLen, 8);
  out.writeUInt32LE(chunkLen, 12);
  out.writeUInt32LE(0x4E4F534A, 16);
  json.copy(out, 20);
  return out;
}

test('上传 .glb 3D 模型后可在 3D 房间与公开分享中加载，撤销后失效', async ({ page, context, browser }) => {
  await context.addCookies([{
    name: 'order_room_test', value: 'test-room-owner', domain: '127.0.0.1', path: '/api/manage', httpOnly: true, sameSite: 'Lax',
  }]);
  await page.goto('/');

  const name = '3D模型手办';
  const create = page.locator('#create-product');
  await create.getByLabel('商品名称').fill(name);
  await create.getByRole('combobox', { name: '分类', exact: true }).selectOption('figure');
  await create.getByRole('button', { name: '添加商品' }).click();
  await expect(page.locator('#manage-status')).toHaveText('商品已添加。');

  await page.getByRole('button', { name, exact: true }).click();
  const detail = page.getByRole('region', { name: '商品详情' });
  await expect(detail.getByText('尚未上传 3D 模型')).toBeVisible();

  const glb = buildMinimalGlb();
  await detail.getByLabel('选择 3D 模型', { exact: false }).setInputFiles({
    name: 'figure.glb', mimeType: 'model/gltf-binary', buffer: glb,
  });
  await detail.getByRole('button', { name: '上传 3D 模型' }).click();
  await expect(page.locator('#manage-status')).toHaveText('3D 模型已保存。');
  await expect(detail.getByText('已绑定 3D 模型')).toBeVisible();

  const purchase = detail.getByRole('form', { name: '登记购买' });
  await purchase.getByLabel('店铺').fill('模型店');
  await purchase.getByLabel('已付金额（CNY）').fill('199.00');
  await purchase.getByRole('button', { name: '登记购买' }).click();
  const card = detail.getByRole('article').filter({ hasText: '模型店' });
  await card.getByLabel('收货日期').fill('2026-11-25');
  await card.getByRole('button', { name: '确认收货' }).click();
  await expect(card.getByText('已收货')).toBeVisible();

  const room = page.getByRole('region', { name: '我的收藏房间' });
  const slot = room.getByRole('combobox', { name: '展示柜 2', exact: true });
  await slot.selectOption({ label: `${name} · 2026-11-25` });
  const privateModelReq = page.waitForResponse(res => res.url().endsWith('/model') && res.status() === 200);
  await slot.locator('xpath=ancestor::form').getByRole('button', { name: '保存槽位' }).click();
  await privateModelReq;

  await room.getByRole('button', { name: '开启分享' }).click();
  const shareUrl = await room.getByRole('link').getAttribute('href');
  const token = new URL(shareUrl).pathname.split('/').at(-1);

  const visitor = await browser.newContext();
  try {
    const guest = await visitor.newPage();
    const publicModelReq = guest.waitForResponse(`${apiOrigin}/api/public/rooms/${token}/models/cabinet-2`);
    await guest.goto(shareUrl);
    expect((await publicModelReq).status()).toBe(200);

    await room.getByRole('button', { name: '关闭分享' }).click();
    await expect(page.locator('#manage-status')).toHaveText('分享已关闭，原链接已失效。');
    expect((await visitor.request.get(`${apiOrigin}/api/public/rooms/${token}/models/cabinet-2`)).status()).toBe(404);
  } finally {
    await visitor.close();
  }
});
