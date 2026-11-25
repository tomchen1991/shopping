import { renderRoom, renderSlotEditors } from './room.js';

const categories = {
  electronics: { label: '电子产品', fields: { brand: '品牌', model: '型号', configuration: '配置', specifications: '规格' } },
  game: { label: '游戏', fields: { platform: '平台', medium: '载体', edition: '版本', developer: '开发商', releaseDate: '发售日期' } },
  figure: { label: '手办', fields: { work: '作品', character: '角色', manufacturer: '制造商', series: '系列', scale: '比例', height: '高度', expectedRelease: '预计发售' } },
};
const amounts = { amountCents: '已付金额', depositCents: '定金', balanceCents: '尾款' };
const purchaseStates = { pending: '待收货', received: '已收货', cancelled: '已取消' };
const mimeTypes = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];
const money = cents => `CNY ${(cents / 100).toFixed(2)}`;
const byId = id => document.getElementById(id);

function el(tag, text, attrs = {}) {
  const node = document.createElement(tag);
  if (text != null) node.textContent = text;
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
  return node;
}

function field(label, attrs) {
  const wrapper = el('label', label);
  wrapper.append(el('input', null, attrs));
  return wrapper;
}

function description(entries) {
  const list = el('dl');
  for (const [label, value] of entries) {
    if (value == null || value === '') continue;
    list.append(el('dt', label), el('dd', value));
  }
  return list;
}

function readCents(value, label) {
  if (!/^\d{1,11}(\.\d{1,2})?$/.test(value)) throw new Error(`${label}须为非负金额，最多两位小数。`);
  const [whole, fraction = ''] = value.split('.');
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  if (cents > 1_000_000_000_000) throw new Error(`${label}超出限额。`);
  return cents;
}

function paymentFields(kind, current = {}) {
  return (kind === 'preorder' ? ['depositCents', 'balanceCents'] : ['amountCents']).map(name =>
    field(`${amounts[name]}（CNY）`, {
      name, inputmode: 'decimal', ...(name !== 'balanceCents' && { required: '' }),
      ...(current[name] != null && { value: (current[name] / 100).toFixed(2) }),
    }));
}

function paymentInput(data, kind) {
  if (kind === 'regular') return { amountCents: readCents(data.amountCents.trim(), '已付金额') };
  return {
    depositCents: readCents(data.depositCents.trim(), '定金'),
    ...(data.balanceCents.trim() && { balanceCents: readCents(data.balanceCents.trim(), '尾款') }),
  };
}

function checkedCover(file) {
  if (!file || !file.name) return null;
  if (!mimeTypes.includes(file.type) || !file.size || file.size > 5 * 1024 * 1024) {
    throw new Error('请选择不超过 5 MiB 的 PNG、JPEG、WebP 或 GIF 图片。');
  }
  return file;
}

class RequestError extends Error {
  constructor(responseStatus, body) {
    const messages = {
      unauthorized: '尚未验证身份，无法访问订购管理。',
      holding_not_placeable: '无法摆放：请选择已收货、分类相符且未占用其他槽位的持有物。',
      purchase_closed: '该购买记录已收货或取消，请重新打开商品查看状态。',
      invalid_input: `提交内容无效${body.field ? `（${body.field}）` : ''}。`,
      unsupported_media_type: '文件类型不受支持。',
      not_found: '未找到该记录或没有访问权限。',
      payload_too_large: '提交的内容过大。',
    };
    super(messages[body.error] || '管理请求失败，请稍后重试。');
    this.status = responseStatus;
  }
}

export function startManagement(apiOrigin) {
  const root = byId('management');
  const status = byId('manage-status');
  const reload = byId('reload-management');
  const create = byId('create-product');
  const detail = byId('product-detail');
  let products = [];
  let holdings = [];
  let room;
  const scene = byId('private-room-scene');
  const editors = byId('room-editors');
  const shareLink = byId('room-share-link');
  const shareToggle = byId('room-share-toggle');
  let coverUrl;
  let busy = false;

  async function api(path, { method = 'GET', json, file, image = false } = {}) {
    let response;
    try {
      response = await fetch(new URL(`/api/manage${path}`, apiOrigin), {
        method, credentials: 'include', signal: AbortSignal.timeout(15000),
        headers: file ? { 'Content-Type': file.type } : json ? { 'Content-Type': 'application/json' } : {},
        body: file ?? (json && JSON.stringify(json)),
      });
    } catch {
      throw new Error('无法连接管理 API，请检查网络后重试。');
    }
    if (!response.ok) throw new RequestError(response.status, await response.json().catch(() => ({})));
    return image ? response.blob() : response.json();
  }

  function closeDetail() {
    if (coverUrl) URL.revokeObjectURL(coverUrl);
    coverUrl = undefined;
    detail.replaceChildren();
    detail.hidden = true;
  }

  async function run(action) {
    if (busy) return;
    busy = root.disabled = reload.disabled = true;
    status.textContent = '处理中…';
    status.dataset.state = 'checking';
    try {
      status.textContent = (await action()) || '管理数据已加载。';
      status.dataset.state = 'ok';
    } catch (error) {
      if (error.status === 401 || error.status === 403) {
        root.hidden = true;
        reload.hidden = false;
        products = holdings = [];
        room = undefined;
        renderPrivateRoom();
        closeDetail();
        renderOverview();
        create.reset();
        renderCategory();
      }
      status.textContent = error.status === 403 ? '当前站点无权访问管理 API。' : error.message;
      status.dataset.state = 'error';
    } finally {
      busy = root.disabled = reload.disabled = false;
    }
  }

  function bind(form, handler) {
    form.addEventListener('submit', event => {
      event.preventDefault();
      if (busy) return;
      const data = Object.fromEntries(new FormData(form));
      void run(() => handler(data));
    });
  }

  function renderCategory() {
    const { fields } = categories[create.elements.category.value];
    byId('category-fields').replaceChildren(...Object.entries(fields).map(([name, label]) =>
      field(label, { name, ...(name === 'releaseDate' ? { type: 'date' } : { maxlength: '2000' }) })));
  }

  function renderOverview() {
    const list = el('ul', null, { class: 'product-list' });
    for (const product of products) {
      const row = el('li');
      const open = el('button', product.name, { type: 'button', class: 'secondary' });
      open.addEventListener('click', () => void run(() => openProduct(product.id)));
      row.append(open, el('span', categories[product.category].label));
      list.append(row);
    }
    byId('product-list').replaceChildren(products.length ? list : el('p', '还没有商品。'));
    byId('holdings-count').textContent = `共 ${holdings.length} 件持有物`;
    byId('holdings-list').replaceChildren(...holdings.map(item => {
      const name = products.find(product => product.id === item.productId)?.name ?? '商品';
      return el('li', `${name} · 收货日期 ${item.receivedDate}`);
    }));
  }

  function renderPrivateRoom() {
    const token = room?.shareToken;
    shareLink.hidden = !token;
    if (token) {
      shareLink.href = new URL(`/room/${token}`, window.location.origin);
      shareLink.textContent = shareLink.href;
    } else {
      shareLink.removeAttribute('href');
      shareLink.textContent = '';
    }
    byId('room-share-state').textContent = token
      ? '分享已开启。拥有链接的访客只能查看摆出的收藏。'
      : '房间不公开。开启分享后，仅摆出的收藏可通过链接查看。';
    shareToggle.textContent = token ? '关闭分享' : '开启分享';
    if (!room) {
      scene.replaceChildren();
      editors.replaceChildren();
      return;
    }
    renderRoom(scene, room.slots, {
      coverUrl: exhibit => exhibit.hasCover ? new URL(`/api/manage/products/${exhibit.productId}/cover`, apiOrigin) : null,
      openProduct: id => void run(() => openProduct(id)),
    });
    renderSlotEditors(editors, room.slots, products, holdings, (slot, holdingId) => void run(async () => {
      await api(`/room/slots/${slot}`, { method: 'PUT', json: { holdingId } });
      room = await api('/room');
      renderPrivateRoom();
      return '槽位已保存。';
    }));
  }

  shareToggle.addEventListener('click', () => void run(async () => {
    const enabled = !room.shareToken;
    const { shareToken } = await api('/room/share', { method: 'PUT', json: { enabled } });
    room.shareToken = shareToken;
    renderPrivateRoom();
    return enabled ? '分享链接已生成。' : '分享已关闭，原链接已失效。';
  }));

  async function loadManagement() {
    reload.hidden = false;
    const [catalog, inventory, layout] = await Promise.all([api('/products'), api('/holdings'), api('/room')]);
    products = catalog.products;
    holdings = inventory.holdings;
    room = layout;
    closeDetail();
    renderOverview();
    renderPrivateRoom();
    root.hidden = false;
  }

  async function attachCover(id, file) {
    const { id: coverId } = await api('/covers', { method: 'POST', file });
    return api(`/products/${id}/cover`, { method: 'PUT', json: { coverId } });
  }

  async function renderCover(area, product) {
    if (coverUrl) URL.revokeObjectURL(coverUrl);
    coverUrl = undefined;
    area.replaceChildren();
    if (product.coverId) {
      try {
        const image = await api(`/products/${product.id}/cover`, { image: true });
        coverUrl = URL.createObjectURL(image);
        area.append(el('img', null, { src: coverUrl, alt: `${product.name}封面`, class: 'cover' }));
      } catch (error) {
        if (error.status === 401 || error.status === 403) throw error;
        area.append(el('p', '封面暂时无法读取，请重新打开商品重试。'));
      }
    }
    const upload = el('form', null, { class: 'inline-form' });
    upload.append(field('选择本地封面', { type: 'file', name: 'cover', accept: mimeTypes.join(','), required: '' }),
      el('button', product.coverId ? '更换封面' : '上传封面', { class: 'secondary' }));
    bind(upload, async data => {
      const updated = await attachCover(product.id, checkedCover(data.cover));
      await renderCover(area, updated);
      if (room.slots.some(slot => slot.exhibit?.productId === product.id)) {
        room = await api('/room');
        renderPrivateRoom();
      }
      return '封面已保存。';
    });
    area.append(upload);
  }

  async function openProduct(id) {
    const [product, { purchases }] = await Promise.all([api(`/products/${id}`), api(`/products/${id}/purchases`)]);
    closeDetail();
    const category = categories[product.category];
    const cover = el('div');
    const purchaseList = el('div');
    const title = el('h3', product.name, { tabindex: '-1' });
    detail.append(title, description([
      ['分类', category.label], ['商品链接', product.link], ['标签', product.tags.join('、')],
      ['目标价', product.targetPriceCents == null ? null : money(product.targetPriceCents)],
      ['感兴趣的原因', product.interestReason],
      ...Object.entries(category.fields).map(([key, label]) => [label, product.details[key]]),
    ]), cover, el('h4', '登记购买'), purchaseForm(product, purchases, purchaseList), el('h4', '购买记录'), purchaseList);
    renderPurchases(purchases, purchaseList);
    detail.hidden = false;
    await renderCover(cover, product);
    // The enclosing fieldset is busy until run() returns; the heading is not a control.
    title.focus();
  }

  function purchaseForm(product, purchases, list) {
    const form = el('form', null, { class: 'fields', 'aria-label': '登记购买' });
    const label = el('label', '购买类型');
    const select = el('select', null, { name: 'kind' });
    select.append(el('option', '普通购买', { value: 'regular' }), el('option', '预订', { value: 'preorder' }));
    label.append(select);
    const payment = el('div', null, { class: 'fields wide' });
    const refresh = () => payment.replaceChildren(...paymentFields(select.value));
    select.addEventListener('change', refresh);
    refresh();
    const actions = el('div', null, { class: 'wide' });
    actions.append(el('button', '登记购买'));
    form.append(label, field('店铺', { name: 'shop', required: '', maxlength: '200' }), payment, actions);
    bind(form, async data => {
      const saved = await api(`/products/${product.id}/purchases`, { method: 'POST', json: {
        kind: data.kind, shop: data.shop.trim(), ...paymentInput(data, data.kind),
      } });
      purchases.unshift(saved);
      renderPurchases(purchases, list);
      form.reset();
      refresh();
      return '购买已登记。';
    });
    return form;
  }

  function renderPurchases(purchases, list) {
    list.replaceChildren(...purchases.map((purchase, index) => {
      const card = el('article', null, { class: 'purchase' });
      card.append(el('h5', purchase.shop), description([
        ['类型', purchase.kind === 'preorder' ? '预订' : '普通购买'], ['状态', purchaseStates[purchase.status]],
        ...Object.entries(amounts).map(([key, label]) => [label, purchase[key] == null ? null : money(purchase[key])]),
        ['实付合计', money(purchase.totalCents)], ['收货日期', purchase.receivedDate],
      ]));
      if (purchase.status !== 'pending') return card;
      const path = `/purchases/${purchase.id}`;
      const update = saved => { purchases[index] = saved; renderPurchases(purchases, list); };
      const pay = el('form', null, { class: 'inline-form' });
      pay.append(...paymentFields(purchase.kind, purchase), el('button', '保存付款金额'));
      bind(pay, async data => {
        update(await api(path, { method: 'PATCH', json: paymentInput(data, purchase.kind) }));
        return '付款金额已保存。';
      });
      const receive = el('form', null, { class: 'inline-form' });
      receive.append(field('收货日期', { name: 'receivedDate', type: 'date', required: '' }), el('button', '确认收货'));
      bind(receive, async ({ receivedDate }) => {
        update(await api(`${path}/receive`, { method: 'POST', json: { receivedDate } }));
        try {
          ({ holdings } = await api('/holdings'));
          renderOverview();
          renderPrivateRoom();
        } catch (error) {
          if (error.status === 401 || error.status === 403) throw error;
          throw new Error('已确认收货，但未能刷新持有物，请重新加载管理数据。');
        }
        return '已确认收货，持有物已更新。';
      });
      const cancel = el('button', '取消购买', { type: 'button', class: 'danger' });
      cancel.addEventListener('click', () => {
        if (!window.confirm('取消这笔购买？取消后不能确认收货。')) return;
        void run(async () => {
          update(await api(`${path}/cancel`, { method: 'POST' }));
          return '购买已取消。';
        });
      });
      card.append(pay, receive, cancel);
      return card;
    }));
    if (!purchases.length) list.append(el('p', '还没有购买记录。'));
  }

  bind(create, async data => {
    const { name, category, link, targetPriceCents, tags, interestReason } = data;
    const details = Object.fromEntries(Object.keys(categories[category].fields)
      .map(key => [key, data[key].trim()]).filter(([, value]) => value));
    const file = checkedCover(data.cover);
    const product = await api('/products', { method: 'POST', json: {
      name: name.trim(), category, details, tags: tags.split(/[,，]/).map(tag => tag.trim()).filter(Boolean),
      ...(link.trim() && { link: link.trim() }),
      ...(targetPriceCents.trim() && { targetPriceCents: readCents(targetPriceCents.trim(), '目标价') }),
      ...(interestReason.trim() && { interestReason: interestReason.trim() }),
    } });
    products.unshift(product);
    renderOverview();
    create.reset();
    renderCategory();
    if (file) {
      try {
        await attachCover(product.id, file);
      } catch (error) {
        if (error.status === 401 || error.status === 403) throw error;
        throw new Error(`商品已添加，但封面未保存。${error.message}请打开商品重试上传。`);
      }
    }
    return '商品已添加。';
  });
  create.elements.category.addEventListener('change', renderCategory);
  reload.addEventListener('click', () => void run(loadManagement));
  renderCategory();
  void run(loadManagement);
}
