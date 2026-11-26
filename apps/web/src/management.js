import { bindRoomToolbar, destroyRoom, renderCuratorDock, renderRoom, setRoomCamera, setRoomCuratorMode } from './room.js';
import { SURFACES } from './room-surfaces.js';

const categories = {
  electronics: { label: '电子产品', fields: { brand: '品牌', model: '型号', configuration: '配置', specifications: '规格' } },
  game: { label: '游戏', fields: { platform: '平台', medium: '载体', edition: '版本', developer: '开发商', releaseDate: '发售日期' } },
  figure: { label: '手办', fields: { work: '作品', character: '角色', manufacturer: '制造商', series: '系列', scale: '比例', height: '高度', expectedRelease: '预计发售' } },
};
const amounts = { amountCents: '已付金额', depositCents: '定金', balanceCents: '尾款' };
const purchaseStates = { pending: '待收货', received: '已收货', cancelled: '已取消' };
const mimeTypes = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];
const activityCoalesceMs = 60_000;
const codePattern = /^(?:\d{6}|[a-f0-9]{32})$/;
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

async function checkedModel(file) {
  if (!file || !file.name) return null;
  if (!file.name.toLowerCase().endsWith('.glb') || !file.size || file.size > 20 * 1024 * 1024) {
    throw new Error('请选择不超过 20 MiB 的 .glb 3D 模型文件。');
  }
  const head = new Uint8Array(await file.slice(0, 4).arrayBuffer());
  if (head[0] !== 0x67 || head[1] !== 0x6C || head[2] !== 0x54 || head[3] !== 0x46) {
    throw new Error('所选文件不是有效的 glTF 2.0 二进制 (.glb) 模型。');
  }
  return file;
}

function parseRetryAfterSeconds(value) {
  if (!value) return 60;
  const trimmed = value.trim();
  if (/^\d+$/.test(trimmed)) return Math.min(86400, Math.max(1, Number(trimmed)));
  const at = Date.parse(trimmed);
  if (Number.isFinite(at)) return Math.min(86400, Math.max(1, Math.ceil((at - Date.now()) / 1000)));
  return 60;
}

class RequestError extends Error {
  constructor(responseStatus, body = {}, retryAfterSeconds = null) {
    const messages = {
      unauthorized: '尚未验证身份，无法访问订购管理。',
      session_invalid: '尚未验证身份，无法访问订购管理。',
      invalid_code: '验证码或恢复码无效，请检查输入或等待下一枚验证码。',
      origin_not_allowed: '当前站点无权访问管理 API。',
      auth_rate_limited: `请求过于频繁${retryAfterSeconds ? `，请在 ${retryAfterSeconds} 秒后重试` : ''}。`,
      auth_unavailable: '认证服务暂时不可用，请稍后重试。',
      revocation_unconfirmed: '本地会话已清除，但远端撤销未得到确认。',
      holding_not_placeable: '无法摆放：请选择已收货、分类相符且未占用其他槽位的持有物。',
      purchase_closed: '该购买记录已收货或取消，请重新打开商品查看状态。',
      invalid_input: `提交内容无效${body.field ? `（${body.field}）` : ''}。`,
      unsupported_media_type: '文件类型不受支持。',
      not_found: '未找到该记录或没有访问权限。',
      payload_too_large: '提交的内容过大。',
    };
    super(messages[body.error] || '管理请求失败，请稍后重试。');
    this.status = responseStatus;
    this.code = body.error;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

export function startManagement(apiUrl) {
  const resolveUrl = typeof apiUrl === 'function' ? apiUrl : path => new URL(path, apiUrl).toString();
  const root = byId('management');
  const status = byId('manage-status');
  const reload = byId('reload-management');
  const authLogin = byId('auth-login');
  const authLogout = byId('auth-logout');
  const loginButton = authLogin.querySelector('button[type="submit"]');
  const create = byId('create-product');
  const detail = byId('product-detail');
  let products = [];
  let holdings = [];
  let room;
  const scene = byId('private-room-scene');
  const curatorToggle = byId('curator-toggle');
  const curatorDock = byId('room-curator-dock');
  const shareLink = byId('room-share-link');
  const shareToggle = byId('room-share-toggle');
  const copyShareBtn = byId('copy-share-link');
  const catalogFilter = byId('catalog-filter');
  let activeCategory = 'all';
  let curatorMode = false;
  let coverUrl;
  let busy = false;
  let authMode = 'unknown';
  let authenticated = false;
  let lastActivityAt = 0;
  let activityInFlight = null;
  let loginBlockedUntil = 0;
  let activityBlockedUntil = 0;
  let loginCooldownTimer = null;
  let sessionExpiredByActivity = false;

  bindRoomToolbar(byId('room-management'), scene);

  async function api(path, { method = 'GET', json, file, contentType, image = false } = {}) {
    let response;
    try {
      response = await fetch(resolveUrl(`/api/manage${path}`), {
        method, credentials: 'include', signal: AbortSignal.timeout(15000),
        headers: file ? { 'Content-Type': contentType || file.type } : json ? { 'Content-Type': 'application/json' } : {},
        body: file ?? (json && JSON.stringify(json)),
      });
    } catch {
      throw new Error('无法连接管理 API，请检查网络后重试。');
    }
    if (!response.ok) throw new RequestError(response.status, await response.json().catch(() => ({})));
    return image ? response.blob() : response.json();
  }

  async function authFetch(action, { method = 'GET', json } = {}) {
    try {
      return await fetch(resolveUrl(`/api/auth/${action}`), {
        method,
        credentials: 'same-origin',
        signal: AbortSignal.timeout(15000),
        headers: json ? { 'Content-Type': 'application/json' } : {},
        ...(json && { body: JSON.stringify(json) }),
      });
    } catch {
      throw new Error('无法连接认证服务，请检查网络后重试。');
    }
  }

  function closeDetail() {
    if (coverUrl) URL.revokeObjectURL(coverUrl);
    coverUrl = undefined;
    detail.replaceChildren();
    detail.hidden = true;
  }

  function clearPrivateState() {
    root.hidden = true;
    products = [];
    holdings = [];
    room = undefined;
    renderPrivateRoom();
    closeDetail();
    renderOverview();
    create.reset();
    renderCategory();
  }

  function syncLoginButtonLock() {
    const remaining = loginBlockedUntil - Date.now();
    if (loginCooldownTimer) {
      clearTimeout(loginCooldownTimer);
      loginCooldownTimer = null;
    }
    if (remaining > 0) {
      loginButton.disabled = true;
      loginCooldownTimer = setTimeout(() => {
        loginCooldownTimer = null;
        loginButton.disabled = busy;
      }, remaining);
    } else {
      loginButton.disabled = busy;
    }
  }

  function expireSession(message) {
    sessionExpiredByActivity = true;
    authenticated = false;
    lastActivityAt = 0;
    clearPrivateState();
    authLogin.hidden = authMode !== 'enabled';
    authLogout.hidden = true;
    reload.hidden = false;
    status.textContent = message;
    status.dataset.state = 'error';
  }

  function recordUserActivity() {
    if (authMode !== 'enabled' || !authenticated || activityInFlight) return;
    const now = Date.now();
    if (now < activityBlockedUntil || now - lastActivityAt < activityCoalesceMs) return;
    activityInFlight = (async () => {
      let response;
      try {
        response = await fetch(resolveUrl('/api/auth/activity'), {
          method: 'POST',
          credentials: 'same-origin',
          signal: AbortSignal.timeout(15000),
        });
      } catch {
        return;
      }
      if (response.status === 401) {
        expireSession('会话已失效，请重新登录。');
        return;
      }
      if (response.status === 429) {
        const seconds = parseRetryAfterSeconds(response.headers.get('Retry-After'));
        activityBlockedUntil = Date.now() + seconds * 1000;
        loginBlockedUntil = Math.max(loginBlockedUntil, activityBlockedUntil);
        syncLoginButtonLock();
        expireSession(`会话刷新过于频繁，请在 ${seconds} 秒后重新登录。`);
        return;
      }
      if (response.ok) {
        const body = await response.json().catch(() => null);
        if (body?.authenticated === true) lastActivityAt = Date.now();
      }
    })().finally(() => {
      activityInFlight = null;
    });
  }

  async function run(action, { trackActivity = true } = {}) {
    if (busy) return;
    sessionExpiredByActivity = false;
    if (trackActivity && authMode === 'enabled' && authenticated) recordUserActivity();
    busy = root.disabled = reload.disabled = authLogout.disabled = true;
    loginButton.disabled = true;
    status.textContent = '处理中…';
    status.dataset.state = 'checking';
    try {
      const message = await action();
      if (sessionExpiredByActivity) return;
      status.textContent = message || '管理数据已加载。';
      status.dataset.state = 'ok';
    } catch (error) {
      if (sessionExpiredByActivity) return;
      if (error.status === 401 || error.status === 403) {
        authenticated = false;
        lastActivityAt = 0;
        clearPrivateState();
        reload.hidden = false;
        authLogout.hidden = true;
        if (authMode === 'enabled') authLogin.hidden = error.status !== 401;
      }
      status.textContent = error.status === 403 ? '当前站点无权访问管理 API。' : error.message;
      status.dataset.state = 'error';
    } finally {
      busy = root.disabled = reload.disabled = authLogout.disabled = false;
      syncLoginButtonLock();
    }
  }

  function bind(form, handler, options) {
    form.addEventListener('submit', event => {
      event.preventDefault();
      if (busy) return;
      const data = Object.fromEntries(new FormData(form));
      void run(() => handler(data), options);
    });
  }

  function renderCategory() {
    const { fields } = categories[create.elements.category.value];
    byId('category-fields').replaceChildren(...Object.entries(fields).map(([name, label]) =>
      field(label, { name, ...(name === 'releaseDate' ? { type: 'date' } : { maxlength: '2000' }) })));
  }

  function renderMetrics() {
    const placed = room ? room.placements.length : 0;
    byId('metric-products').textContent = String(products.length);
    byId('metric-holdings').textContent = String(holdings.length);
    byId('metric-placed').textContent = `${placed} 件`;
    byId('metric-share').textContent = room?.shareToken ? '公开分享中' : '仅自己可见';
  }

  function renderOverview() {
    const visibleProducts = activeCategory === 'all'
      ? products
      : products.filter(product => product.category === activeCategory);
    const list = el('ul', null, { class: 'product-list' });
    for (const product of visibleProducts) {
      const row = el('li');
      const open = el('button', product.name, { type: 'button', class: 'secondary' });
      open.addEventListener('click', () => void run(() => openProduct(product.id)));
      row.append(open, el('span', categories[product.category].label, { class: 'category-badge' }));
      list.append(row);
    }
    byId('product-list').replaceChildren(
      visibleProducts.length ? list : el('p', products.length ? '该分类下还没有商品。' : '还没有商品。'),
    );
    byId('holdings-count').textContent = `共 ${holdings.length} 件持有物`;
    byId('holdings-list').replaceChildren(...holdings.map(item => {
      const product = products.find(entry => entry.id === item.productId);
      const row = el('li');
      row.append(
        el('span', `${product?.name ?? '商品'} · 收货日期 ${item.receivedDate}`),
        ...(product ? [el('span', categories[product.category].label, { class: 'category-badge' })] : []),
      );
      return row;
    }));
    renderMetrics();
  }

  function savePlacement(holdingId, transform) {
    return void run(async () => {
      await api(`/room/placements/${holdingId}`, { method: 'PUT', json: transform });
      room = await api('/room');
      renderPrivateRoom();
      return '展品摆放已保存。';
    });
  }

  function removePlacement(holdingId) {
    return void run(async () => {
      await api(`/room/placements/${holdingId}`, { method: 'DELETE' });
      room = await api('/room');
      renderPrivateRoom();
      return '已从房间收起展品。';
    });
  }

  function renderPrivateRoom() {
    const token = room?.shareToken;
    shareLink.hidden = !token;
    copyShareBtn.hidden = !token;
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
    renderMetrics();
    if (!room) {
      curatorMode = false;
      curatorToggle.classList.remove('is-active');
      curatorToggle.setAttribute('aria-pressed', 'false');
      curatorToggle.textContent = '✎ 布置房间';
      curatorDock.hidden = true;
      curatorDock.replaceChildren();
      destroyRoom(scene);
      return;
    }
    renderRoom(scene, room.placements, {
      coverUrl: item => item.hasCover ? resolveUrl(`/api/manage/products/${item.productId}/cover`) : null,
      modelUrl: item => item.hasModel ? resolveUrl(`/api/manage/products/${item.productId}/model`) : null,
      openProduct: id => void run(() => openProduct(id)),
      onSavePlacement: savePlacement,
      onRemovePlacement: removePlacement,
      curatorMode,
    });
    setRoomCuratorMode(scene, curatorMode);
    curatorDock.hidden = !curatorMode;
    if (curatorMode) {
      renderCuratorDock(curatorDock, {
        sceneEl: scene,
        placements: room.placements,
        products,
        holdings,
        onPlace: savePlacement,
        onRemove: removePlacement,
        onSelect(placed) {
          const zone = SURFACES[placed.surface]?.zone || 'overview';
          setRoomCamera(scene, zone);
          renderPrivateRoom();
        },
      });
    } else {
      curatorDock.replaceChildren();
    }
  }

  curatorToggle.addEventListener('click', () => {
    curatorMode = !curatorMode;
    curatorToggle.classList.toggle('is-active', curatorMode);
    curatorToggle.setAttribute('aria-pressed', String(curatorMode));
    curatorToggle.textContent = curatorMode ? '✓ 完成布置' : '✎ 布置房间';
    renderPrivateRoom();
  });

  copyShareBtn.addEventListener('click', async () => {
    if (!shareLink.href) return;
    try {
      await navigator.clipboard.writeText(shareLink.href);
      status.textContent = '分享链接已复制到剪贴板。';
      status.dataset.state = 'ok';
    } catch {
      status.textContent = '无法自动复制，请手动复制下方链接。';
      status.dataset.state = 'error';
    }
  });

  for (const btn of catalogFilter.querySelectorAll('[data-category]')) {
    btn.addEventListener('click', () => {
      activeCategory = btn.dataset.category;
      for (const b of catalogFilter.querySelectorAll('[data-category]')) b.classList.toggle('active', b === btn);
      renderOverview();
    });
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

  async function initSession() {
    reload.hidden = false;
    const response = await authFetch('status');
    if (response.status === 404) {
      authMode = 'disabled';
      authLogin.hidden = true;
      authLogout.hidden = true;
      await loadManagement();
      return;
    }
    authMode = 'enabled';
    if (response.status === 401) {
      authenticated = false;
      clearPrivateState();
      authLogin.hidden = false;
      authLogout.hidden = true;
      throw new RequestError(401, { error: 'unauthorized' });
    }
    if (response.status === 403) {
      authenticated = false;
      clearPrivateState();
      authLogin.hidden = true;
      authLogout.hidden = true;
      throw new RequestError(403, { error: 'origin_not_allowed' });
    }
    if (!response.ok) {
      authenticated = false;
      clearPrivateState();
      authLogin.hidden = true;
      authLogout.hidden = true;
      throw new Error('暂时无法验证身份，请稍后重试。');
    }
    const body = await response.json().catch(() => null);
    if (body?.authenticated !== true) {
      authenticated = false;
      clearPrivateState();
      authLogin.hidden = true;
      authLogout.hidden = true;
      throw new Error('暂时无法验证身份，请稍后重试。');
    }
    authenticated = true;
    lastActivityAt = 0;
    authLogin.hidden = true;
    authLogout.hidden = false;
    await loadManagement();
  }

  bind(authLogin, async data => {
    const remaining = loginBlockedUntil - Date.now();
    if (remaining > 0) {
      throw new Error(`请求过于频繁，请在 ${Math.ceil(remaining / 1000)} 秒后重试。`);
    }
    const code = (data.code ?? '').trim();
    if (!codePattern.test(code)) {
      throw new Error('请输入 6 位数字验证码或 32 位小写十六进制恢复码。');
    }
    const response = await authFetch('login', { method: 'POST', json: { code } });
    const body = await response.json().catch(() => ({}));
    if (response.status === 429) {
      const seconds = parseRetryAfterSeconds(response.headers.get('Retry-After'));
      loginBlockedUntil = Date.now() + seconds * 1000;
      syncLoginButtonLock();
      throw new RequestError(429, { error: 'auth_rate_limited', ...body }, seconds);
    }
    if (!response.ok) {
      throw new RequestError(response.status, body);
    }
    if (body?.authenticated !== true) {
      throw new RequestError(503, { error: 'auth_unavailable' });
    }
    authMode = 'enabled';
    authenticated = true;
    lastActivityAt = Date.now();
    loginBlockedUntil = 0;
    activityBlockedUntil = 0;
    authLogin.reset();
    authLogin.hidden = true;
    authLogout.hidden = false;
    await loadManagement();
    return '已登录，管理数据已加载。';
  }, { trackActivity: false });

  authLogout.addEventListener('click', () => void run(async () => {
    const response = await authFetch('logout', { method: 'POST' });
    const body = await response.json().catch(() => ({}));
    authenticated = false;
    lastActivityAt = 0;
    clearPrivateState();
    authLogin.hidden = authMode !== 'enabled';
    authLogout.hidden = true;
    reload.hidden = false;
    if (!response.ok) {
      throw new RequestError(response.status, body);
    }
    return body.remoteRevoked === null ? '本地会话已清除。' : '已退出登录。';
  }, { trackActivity: false }));

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
      const idx = products.findIndex(item => item.id === updated.id);
      if (idx !== -1) products[idx] = updated;
      await renderCover(area, updated);
      if (room.placements.some(p => p.productId === product.id)) {
        room = await api('/room');
        renderPrivateRoom();
      }
      return '封面已保存。';
    });
    area.append(upload);
  }

  async function attachModel(id, file) {
    const { id: modelId } = await api('/models', { method: 'POST', file, contentType: 'model/gltf-binary' });
    return api(`/products/${id}/model`, { method: 'PUT', json: { modelId } });
  }

  function renderModel(area, product) {
    area.replaceChildren();
    area.append(el('p', product.modelId ? '已绑定 3D 模型（.glb），摆入 3D 房间后将直接渲染立体模型。' : '尚未上传 3D 模型（房间内使用封面展示）。', { class: 'status-line' }));
    const upload = el('form', null, { class: 'inline-form' });
    upload.append(
      field('选择 3D 模型（.glb，最大 20 MiB）', { type: 'file', name: 'model', accept: '.glb,model/gltf-binary', required: '' }),
      el('button', product.modelId ? '更换 3D 模型' : '上传 3D 模型', { class: 'secondary' }),
    );
    if (product.modelId) {
      const remove = el('button', '移除 3D 模型', { type: 'button', class: 'danger' });
      remove.addEventListener('click', () => void run(async () => {
        const updated = await api(`/products/${product.id}/model`, { method: 'PUT', json: { modelId: null } });
        const idx = products.findIndex(item => item.id === updated.id);
        if (idx !== -1) products[idx] = updated;
        renderModel(area, updated);
        if (room.placements.some(p => p.productId === product.id)) {
          room = await api('/room');
          renderPrivateRoom();
        }
        return '3D 模型已移除。';
      }));
      upload.append(remove);
    }
    bind(upload, async data => {
      const updated = await attachModel(product.id, await checkedModel(data.model));
      const idx = products.findIndex(item => item.id === updated.id);
      if (idx !== -1) products[idx] = updated;
      renderModel(area, updated);
      if (room.placements.some(p => p.productId === product.id)) {
        room = await api('/room');
        renderPrivateRoom();
      }
      return '3D 模型已保存。';
    });
    area.append(upload);
  }

  async function openProduct(id) {
    const [product, { purchases }] = await Promise.all([api(`/products/${id}`), api(`/products/${id}/purchases`)]);
    closeDetail();
    const category = categories[product.category];
    const cover = el('div');
    const model = el('div');
    const purchaseList = el('div');
    const title = el('h3', product.name, { tabindex: '-1' });
    detail.append(title, description([
      ['分类', category.label], ['商品链接', product.link], ['标签', product.tags.join('、')],
      ['目标价', product.targetPriceCents == null ? null : money(product.targetPriceCents)],
      ['感兴趣的原因', product.interestReason],
      ...Object.entries(category.fields).map(([key, label]) => [label, product.details[key]]),
    ]), cover, el('h4', '3D 模型（.glb）'), model, el('h4', '登记购买'), purchaseForm(product, purchases, purchaseList), el('h4', '购买记录'), purchaseList);
    renderPurchases(purchases, purchaseList);
    renderModel(model, product);
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

  for (const eventName of ['click', 'change', 'keydown']) {
    root.addEventListener(eventName, event => {
      if (event.isTrusted === false) return;
      recordUserActivity();
    });
  }

  create.elements.category.addEventListener('change', renderCategory);
  reload.addEventListener('click', () => {
    if (authMode === 'enabled' && !authenticated) void run(initSession, { trackActivity: false });
    else void run(loadManagement, { trackActivity: authMode === 'enabled' });
  });
  renderCategory();
  void run(initSession, { trackActivity: false });
}
