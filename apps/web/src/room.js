import './room.css';
import { createRoomStage } from './room-3d.js';

const furniture = [
  { name: '桌面', zone: 'electronics', category: '电子产品', slots: [['desk-1', 12, 58], ['desk-2', 28, 72]] },
  { name: '媒体架', zone: 'game', category: '游戏', slots: [['shelf-1', 42, 34], ['shelf-2', 56, 48]] },
  { name: '展示柜', zone: 'figure', category: '手办', slots: [['cabinet-1', 76, 32], ['cabinet-2', 76, 56]] },
];

const stages = new WeakMap();

function el(tag, text, attrs = {}) {
  const node = document.createElement(tag);
  if (text != null) node.textContent = text;
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
  return node;
}

export function setRoomTheme(sceneEl, theme) {
  stages.get(sceneEl)?.stage?.setTheme(theme);
}

export function setRoomCamera(sceneEl, preset) {
  stages.get(sceneEl)?.stage?.setCameraPreset(preset);
}

export function setRoomZone(sceneEl, zone) {
  stages.get(sceneEl)?.stage?.setZoneFocus(zone);
}

export function destroyRoom(sceneEl) {
  const record = stages.get(sceneEl);
  if (record) {
    record.stage?.dispose();
    stages.delete(sceneEl);
  }
  sceneEl.replaceChildren();
}

export function renderRoom(sceneEl, slots, { coverUrl, openProduct } = {}) {
  let record = stages.get(sceneEl);
  if (!record) {
    sceneEl.replaceChildren();
    const overlay = el('div', null, { class: 'room-overlay' });
    const hint = el('div', '拖拽旋转 3D 视角 · 滚轮缩放 · 点击展品检视详情', { class: 'room-hud-hint' });
    sceneEl.append(overlay, hint);
    record = { overlay, markers: new Map(), openProduct, stage: null };
    try {
      record.stage = createRoomStage(sceneEl, {
        onSelectSlot(slotId) {
          const exhibit = record.slots?.find(entry => entry.slot === slotId)?.exhibit;
          if (exhibit && record.openProduct) record.openProduct(exhibit.productId);
        },
        onHoverSlot(slotId) {
          for (const [id, marker] of record.markers.entries()) {
            marker.classList.toggle('is-hovered', id === slotId);
          }
        },
        onProject(projected) {
          for (const [id, marker] of record.markers.entries()) {
            const point = projected[id];
            if (!point || !point.visible) {
              marker.classList.add('is-offscreen');
              continue;
            }
            marker.classList.remove('is-offscreen');
            marker.style.left = `${point.x}px`;
            marker.style.top = `${point.y}px`;
          }
        },
      });
    } catch {
      sceneEl.dataset.fallback = 'true';
    }
    stages.set(sceneEl, record);
  }

  record.openProduct = openProduct;
  record.slots = slots;
  record.markers.clear();
  record.overlay.replaceChildren();

  const stageExhibits = [];

  for (const group of furniture) {
    for (const [index, [id, fallbackX, fallbackY]] of group.slots.entries()) {
      const exhibit = slots.find(entry => entry.slot === id)?.exhibit ?? null;
      const label = `${group.name} ${index + 1}`;
      const interactive = exhibit && openProduct;
      const marker = el(interactive ? 'button' : 'div', null, {
        class: `room-marker${exhibit ? ' occupied' : ''}`,
        'data-slot': id,
        'data-zone': group.zone,
        ...(interactive && { type: 'button', 'aria-label': `${label}：${exhibit.name}（查看商品详情）` }),
      });

      if (!record.stage) {
        marker.style.left = `${fallbackX}%`;
        marker.style.top = `${fallbackY}%`;
      }

      let imageEl = null;
      const src = exhibit && coverUrl?.(exhibit);
      if (src) {
        imageEl = el('img', null, {
          alt: `${exhibit.name}封面`,
          referrerpolicy: 'no-referrer',
          crossorigin: interactive ? 'use-credentials' : 'anonymous',
        });
        imageEl.addEventListener('load', () => {
          record.stage?.refreshSlotTexture(id, imageEl);
        });
        imageEl.addEventListener('error', () => { imageEl.hidden = true; });
        imageEl.src = src;
        marker.append(imageEl);
      }

      const meta = el('span', null, { class: 'marker-meta' });
      meta.append(el('span', exhibit?.name ?? '空位', { class: 'marker-name' }), el('small', label));
      marker.append(meta);

      if (interactive) marker.addEventListener('click', () => openProduct(exhibit.productId));
      marker.addEventListener('mouseenter', () => record.stage?.setHoveredSlot(id));
      marker.addEventListener('mouseleave', () => record.stage?.setHoveredSlot(null));

      record.overlay.append(marker);
      record.markers.set(id, marker);
      stageExhibits.push({
        slot: id,
        exhibit: exhibit ? { ...exhibit, imageEl } : null,
      });
    }
  }

  record.stage?.setExhibits(stageExhibits);
}

export function renderSlotEditors(root, slots, products, holdings, save, { onZoneHover } = {}) {
  const placed = new Set(slots.map(entry => entry.exhibit?.holdingId));
  const productById = new Map(products.map(product => [product.id, product]));
  root.replaceChildren(...furniture.map(group => {
    const panel = el('div', null, { class: 'room-controls', 'data-zone': group.zone });
    const head = el('div', null, { class: 'room-controls-head' });
    head.append(el('h4', group.name), el('span', group.category, { class: 'zone-chip' }));
    panel.append(head);
    if (onZoneHover) {
      panel.addEventListener('mouseenter', () => onZoneHover(group.zone));
      panel.addEventListener('mouseleave', () => onZoneHover(null));
    }
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
      const submit = el('button', '保存槽位', { class: 'secondary btn-sm', disabled: '' });
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

export function bindRoomToolbar(scopeEl, sceneEl) {
  if (!scopeEl) return;
  for (const btn of scopeEl.querySelectorAll('[data-camera]')) {
    btn.addEventListener('click', () => {
      for (const b of scopeEl.querySelectorAll('[data-camera]')) b.classList.toggle('active', b === btn);
      setRoomCamera(sceneEl, btn.dataset.camera);
    });
  }
  for (const btn of scopeEl.querySelectorAll('[data-lighting]')) {
    btn.addEventListener('click', () => {
      for (const b of scopeEl.querySelectorAll('[data-lighting]')) b.classList.toggle('active', b === btn);
      setRoomTheme(sceneEl, btn.dataset.lighting);
    });
  }
}

export async function startPublicRoom(apiUrl, token) {
  const resolveUrl = typeof apiUrl === 'function' ? apiUrl : path => new URL(path, apiUrl).toString();
  const panel = document.getElementById('public-room');
  const sceneEl = document.getElementById('public-room-scene');
  panel.hidden = false;
  bindRoomToolbar(panel, sceneEl);
  const status = document.getElementById('public-room-status');
  try {
    if (!/^[a-f0-9]{32}$/.test(token)) {
      destroyRoom(sceneEl);
      status.textContent = '此房间未公开或链接已失效。';
      return;
    }
    const response = await fetch(resolveUrl(`/api/public/rooms/${token}`), {
      credentials: 'omit', signal: AbortSignal.timeout(10000), referrerPolicy: 'no-referrer',
    });
    if (response.status === 404) {
      destroyRoom(sceneEl);
      status.textContent = '此房间未公开或链接已失效。';
      return;
    }
    if (!response.ok) throw new Error('Room unavailable');
    const { slots } = await response.json();
    renderRoom(sceneEl, slots, {
      coverUrl: exhibit => exhibit.coverPath ? resolveUrl(exhibit.coverPath) : null,
    });
    status.textContent = slots.some(slot => slot.exhibit) ? '仅展示房间内公开摆放的收藏。' : '这间小屋还没有摆出收藏。';
  } catch {
    destroyRoom(sceneEl);
    status.textContent = '暂时无法加载房间，请刷新重试。';
  }
}
