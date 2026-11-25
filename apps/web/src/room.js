import './room.css';

const furniture = [
  { name: '桌面', category: '电子产品', slots: [['desk-1', 2, 12, 3], ['desk-2', 6, 9, 3]] },
  { name: '媒体架', category: '游戏', slots: [['shelf-1', 9.5, 3.1, 4], ['shelf-2', 15, 1.6, 4]] },
  { name: '展示柜', category: '手办', slots: [['cabinet-1', 12, 11.5, 3], ['cabinet-2', 16, 8, 3]] },
];

function el(tag, text, attrs = {}) {
  const node = document.createElement(tag);
  if (text != null) node.textContent = text;
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
  return node;
}

const project = (x, y, z = 0) => [335 + (x - y) * 17, 89 + (x + y) * 9 - z * 12];

function backdrop() {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 680 410');
  svg.setAttribute('aria-hidden', 'true');
  const face = (fill, points) => {
    const polygon = document.createElementNS(svg.namespaceURI, 'polygon');
    polygon.setAttribute('fill', fill);
    polygon.setAttribute('points', points.map(point => project(...point).join(',')).join(' '));
    svg.append(polygon);
  };
  const slab = (x, y, w, d, z, h, [top, left, right]) => {
    face(left, [[x, y + d, z], [x + w, y + d, z], [x + w, y + d, z + h], [x, y + d, z + h]]);
    face(right, [[x + w, y, z], [x + w, y + d, z], [x + w, y + d, z + h], [x + w, y, z + h]]);
    face(top, [[x, y, z + h], [x + w, y, z + h], [x + w, y + d, z + h], [x, y + d, z + h]]);
  };
  slab(0, 0, 18, 15, -0.7, 0.7, ['#e9dec6', '#bba182', '#ab8e6f']);
  face('#dce9dc', [[0, 0], [18, 0], [18, 0, 6.2], [0, 0, 6.2]]);
  face('#c5d9ce', [[0, 0], [0, 15], [0, 15, 6.2], [0, 0, 6.2]]);
  face('#f8f6dd', [[0, 3, 2], [0, 8, 2], [0, 8, 5.2], [0, 3, 5.2]]);
  face('#aaccc9', [[0, 3.3, 2.3], [0, 7.7, 2.3], [0, 7.7, 4.9], [0, 3.3, 4.9]]);
  face('#d7e5d6', [[0, 5.45, 2.3], [0, 5.65, 2.3], [0, 5.65, 4.9], [0, 5.45, 4.9]]);
  for (let x = 0; x < 18; x += 3) {
    for (let y = 0; y < 15; y += 3) {
      if ((x + y) % 2) face('#f1e7d3', [[x, y], [x + 3, y], [x + 3, y + 3], [x, y + 3]]);
    }
  }
  // Media shelves at the back, a free-standing desk, then the foreground cabinet.
  const wood = ['#ba8e65', '#936748', '#77503a'];
  slab(8.8, 0.8, 7, 0.4, 0, 4.3, wood);
  for (const z of [0.3, 1.9, 3.6]) slab(8.8, 1.2, 7, 2.9, z, 0.4, wood);
  for (const x of [8.8, 15.45]) slab(x, 1.2, 0.35, 2.9, 0, 4.3, wood);
  for (const [x, y] of [[1.3, 8.4], [6.4, 8.4], [1.3, 13], [6.4, 13]]) slab(x, y, 0.45, 0.45, 0, 2.7, wood);
  slab(1, 8, 6.1, 5.8, 2.7, 0.45, ['#dbb787', '#b4885f', '#97734e']);
  const cabinet = ['#a8cec1', '#6b9c8d', '#517c71'];
  slab(11, 7, 6.3, 6, 0, 1.1, cabinet);
  slab(11, 7, 6.3, 0.35, 1.1, 2.6, cabinet);
  slab(11, 7.35, 0.35, 5.65, 1.1, 2.6, cabinet);
  slab(11.35, 7.35, 5.95, 5.65, 2.7, 0.35, ['#c3dfd2', '#80ab9e', '#619082']);
  return svg;
}

export function renderRoom(scene, slots, { coverUrl, openProduct } = {}) {
  scene.replaceChildren(backdrop());
  for (const group of furniture) {
    for (const [index, [id, x, y, z]] of group.slots.entries()) {
      const exhibit = slots.find(entry => entry.slot === id)?.exhibit;
      const label = `${group.name} ${index + 1}`;
      const interactive = exhibit && openProduct;
      const marker = el(interactive ? 'button' : 'div', null, {
        class: `room-marker${exhibit ? ' occupied' : ''}`,
        ...(interactive && { type: 'button', 'aria-label': `${label}：${exhibit.name}（查看商品详情）` }),
      });
      const [px, py] = project(x, y, z);
      marker.style.left = `${px / 6.8}%`;
      marker.style.top = `${py / 4.1}%`;
      const src = exhibit && coverUrl?.(exhibit);
      if (src) {
        const image = el('img', null, { alt: `${exhibit.name}封面`, referrerpolicy: 'no-referrer',
          crossorigin: interactive ? 'use-credentials' : 'anonymous' });
        image.addEventListener('error', () => { image.hidden = true; });
        image.src = src;
        marker.append(image);
      }
      marker.append(el('span', exhibit?.name ?? '空位', { class: 'marker-name' }), el('small', label));
      if (interactive) marker.addEventListener('click', () => openProduct(exhibit.productId));
      scene.append(marker);
    }
  }
}

export function renderSlotEditors(root, slots, products, holdings, save) {
  const placed = new Set(slots.map(entry => entry.exhibit?.holdingId));
  const productById = new Map(products.map(product => [product.id, product]));
  root.replaceChildren(...furniture.map(group => {
    const panel = el('div', null, { class: 'room-controls' });
    panel.append(el('h4', `${group.name} · ${group.category}`));
    for (const [index, [id]] of group.slots.entries()) {
      const slot = slots.find(entry => entry.slot === id);
      const current = slot.exhibit?.holdingId;
      const form = el('form', null, { class: 'slot-editor' });
      const label = el('label', `${group.name} ${index + 1}`);
      const select = el('select');
      select.append(el('option', '空位（不摆放）', { value: '' }));
      for (const item of holdings) {
        const product = productById.get(item.productId);
        if (product?.category !== slot.category || (placed.has(item.id) && item.id !== current)) continue;
        select.append(el('option', `${product.name} · ${item.receivedDate}`, { value: item.id }));
      }
      select.value = current || '';
      const submit = el('button', '保存槽位', { class: 'secondary', disabled: '' });
      select.addEventListener('change', () => { submit.disabled = select.value === (current ?? ''); });
      form.addEventListener('submit', event => {
        event.preventDefault();
        if (!submit.disabled) save(id, select.value || null);
      });
      label.append(select);
      form.append(label, submit);
      panel.append(form);
    }
    return panel;
  }));
}

export async function startPublicRoom(apiUrl, token) {
  const resolveUrl = typeof apiUrl === 'function' ? apiUrl : path => new URL(path, apiUrl).toString();
  const panel = document.getElementById('public-room');
  panel.hidden = false;
  const status = document.getElementById('public-room-status');
  try {
    if (!/^[a-f0-9]{32}$/.test(token)) {
      status.textContent = '此房间未公开或链接已失效。';
      return;
    }
    const response = await fetch(resolveUrl(`/api/public/rooms/${token}`), {
      credentials: 'omit', signal: AbortSignal.timeout(10000), referrerPolicy: 'no-referrer',
    });
    if (response.status === 404) {
      status.textContent = '此房间未公开或链接已失效。';
      return;
    }
    if (!response.ok) throw new Error('Room unavailable');
    const { slots } = await response.json();
    renderRoom(document.getElementById('public-room-scene'), slots, {
      coverUrl: exhibit => exhibit.coverPath ? resolveUrl(exhibit.coverPath) : null,
    });
    status.textContent = slots.some(slot => slot.exhibit) ? '仅展示房间内公开摆放的收藏。' : '这间小屋还没有摆出收藏。';
  } catch {
    status.textContent = '暂时无法加载房间，请刷新重试。';
  }
}
