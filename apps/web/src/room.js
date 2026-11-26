import './room.css';
import { createRoomStage } from './room-3d.js';

const furniture = [
  { name: '桌面', heading: '办公桌 · 电子产品', zone: 'electronics', category: '电子产品', slots: [['desk-1', 16, 58], ['desk-2', 32, 72]] },
  { name: '媒体架', heading: '游戏展示柜', zone: 'game', category: '游戏', slots: [['shelf-1', 46, 36], ['shelf-2', 58, 52]] },
  { name: '展示柜', heading: '手办玻璃展示柜', zone: 'figure', category: '手办', slots: [['cabinet-1', 76, 32], ['cabinet-2', 76, 56]] },
];

const slotZoneMap = Object.fromEntries(
  furniture.flatMap(group => group.slots.map(([id]) => [id, group.zone])),
);

const stages = new WeakMap();

function el(tag, text, attrs = {}) {
  const node = document.createElement(tag);
  if (text != null) node.textContent = text;
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
  return node;
}

export function setRoomTheme(sceneEl, theme) {
  stages.get(sceneEl)?.stage?.setTheme(theme);
  const shell = sceneEl.closest('.room-stage-shell');
  if (shell) shell.dataset.theme = theme;
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
    record.cleanup?.();
    record.stage?.dispose();
    stages.delete(sceneEl);
  }
  sceneEl.replaceChildren();
}

export function renderRoom(sceneEl, slots, { coverUrl, modelUrl, openProduct } = {}) {
  let record = stages.get(sceneEl);
  if (!record) {
    sceneEl.replaceChildren();
    const shell = sceneEl.closest('.room-stage-shell');
    const overlay = el('div', null, { class: 'room-overlay' });
    const gadgetChip = el('div', null, { class: 'room-gadget-chip', hidden: '' });
    const hint = el('div', '拖拽旋转 · 滚轮缩放 · 点击任意展品或设备屏幕单独放大展示', { class: 'room-hud-hint' });

    // Top-right HUD quick switcher (shows full camera/theme pills when expanded to fullscreen)
    const topBar = el('div', null, { class: 'room-hud-top-bar' });
    const expandBtn = el('button', '⛶ 放大全屏', { type: 'button', class: 'hud-pill', 'aria-pressed': 'false' });

    const expandedCamGroup = el('div', null, { class: 'expanded-only' });
    for (const [cam, label] of [['overview', '全景'], ['electronics', '办公桌'], ['game', '游戏柜'], ['figure', '手办柜']]) {
      const btn = el('button', label, { type: 'button', class: 'hud-pill', 'data-hud-camera': cam });
      btn.addEventListener('click', () => {
        const scope = sceneEl.closest('.showcase-card');
        if (scope) {
          for (const b of scope.querySelectorAll('[data-camera]')) b.classList.toggle('active', b.dataset.camera === cam);
        }
        record.stage?.setCameraPreset(cam);
      });
      expandedCamGroup.append(btn);
    }

    const expandedThemeGroup = el('div', null, { class: 'expanded-only' });
    for (const [theme, label] of [['day', '☀'], ['night', '☾'], ['gallery', '✦']]) {
      const btn = el('button', label, { type: 'button', class: 'hud-pill', 'data-hud-lighting': theme });
      btn.addEventListener('click', () => {
        const scope = sceneEl.closest('.showcase-card');
        if (scope) {
          for (const b of scope.querySelectorAll('[data-lighting]')) b.classList.toggle('active', b.dataset.lighting === theme);
        }
        setRoomTheme(sceneEl, theme);
      });
      expandedThemeGroup.append(btn);
    }
    topBar.append(expandedCamGroup, expandedThemeGroup, expandBtn);

    // Bottom-right Stage Action Pills (Auto-orbit, Labels toggle, Reset view)
    const hudControls = el('div', null, { class: 'room-hud-controls', role: 'group', 'aria-label': '3D 展厅快捷控制' });
    const orbitBtn = el('button', '✦ 自动环绕', { type: 'button', class: 'hud-pill', 'aria-pressed': 'false' });
    const labelsBtn = el('button', '隐藏标签', { type: 'button', class: 'hud-pill', 'aria-pressed': 'false' });
    const resetBtn = el('button', '↺ 全景复位', { type: 'button', class: 'hud-pill' });
    hudControls.append(orbitBtn, labelsBtn, resetBtn);

    sceneEl.append(overlay, gadgetChip, topBar, hint, hudControls);

    let hideLabels = false;
    let isExpanded = false;
    let lockedChip = false;

    const showFocusBanner = (title, subtitle, { allowBack = true } = {}) => {
      const textWrap = el('div', null, { class: 'room-gadget-chip-text' });
      textWrap.append(el('strong', title), el('span', subtitle));
      gadgetChip.replaceChildren(textWrap);
      if (allowBack) {
        const backBtn = el('button', '← 返回全景', { type: 'button', class: 'hud-pill is-active' });
        backBtn.addEventListener('click', () => {
          lockedChip = false;
          gadgetChip.hidden = true;
          gadgetChip.replaceChildren();
          resetToOverview();
        });
        gadgetChip.append(backBtn);
      }
      gadgetChip.hidden = false;
    };

    const resetToOverview = () => {
      lockedChip = false;
      gadgetChip.hidden = true;
      gadgetChip.replaceChildren();
      const scope = sceneEl.closest('.showcase-card');
      if (scope) {
        for (const btn of scope.querySelectorAll('[data-camera]')) {
          btn.classList.toggle('active', btn.dataset.camera === 'overview');
        }
      }
      record.stage?.setAutoOrbit(false);
      record.stage?.setCameraPreset('overview');
    };

    const setExpanded = next => {
      isExpanded = next;
      if (shell) shell.classList.toggle('is-expanded', isExpanded);
      expandBtn.classList.toggle('is-active', isExpanded);
      expandBtn.setAttribute('aria-pressed', String(isExpanded));
      expandBtn.textContent = isExpanded ? '✕ 退出全屏' : '⛶ 放大全屏';
    };

    expandBtn.addEventListener('click', () => setExpanded(!isExpanded));

    const onKeyDown = event => {
      if (event.key === 'Escape') {
        if (isExpanded) setExpanded(false);
        else if (lockedChip) resetToOverview();
      }
    };
    window.addEventListener('keydown', onKeyDown);

    labelsBtn.addEventListener('click', () => {
      hideLabels = !hideLabels;
      overlay.classList.toggle('hide-labels', hideLabels);
      labelsBtn.classList.toggle('is-active', hideLabels);
      labelsBtn.setAttribute('aria-pressed', String(hideLabels));
      labelsBtn.textContent = hideLabels ? '显示标签' : '隐藏标签';
    });

    orbitBtn.addEventListener('click', () => {
      if (!record.stage) return;
      record.stage.setAutoOrbit(!record.stage.isAutoOrbit());
    });

    resetBtn.addEventListener('click', resetToOverview);

    record = {
      overlay,
      markers: new Map(),
      openProduct,
      stage: null,
      cleanup: () => window.removeEventListener('keydown', onKeyDown),
    };

    const syncOrbitBtn = active => {
      orbitBtn.classList.toggle('is-active', active);
      orbitBtn.setAttribute('aria-pressed', String(active));
      orbitBtn.textContent = active ? '❚❚ 暂停环绕' : '✦ 自动环绕';
    };

    const zoomToExhibit = (slotId, exhibit) => {
      const zone = slotZoneMap[slotId] || 'overview';
      const scope = sceneEl.closest('.showcase-card');
      if (scope) {
        for (const btn of scope.querySelectorAll('[data-camera]')) {
          btn.classList.toggle('active', btn.dataset.camera === zone);
        }
      }
      record.stage?.focusSlot(slotId);
      lockedChip = true;
      showFocusBanner(
        `特写展示 · ${exhibit.name}`,
        '支持拖拽微调角度或滚轮缩放，按 Esc 返回全景',
      );
    };
    record.zoomToExhibit = zoomToExhibit;

    try {
      record.stage = createRoomStage(sceneEl, {
        onAutoOrbitChange: syncOrbitBtn,
        onSelectSlot(slotId, { fromCanvas = false } = {}) {
          const exhibit = record.slots?.find(entry => entry.slot === slotId)?.exhibit;
          if (!exhibit) return;
          if (fromCanvas || !record.openProduct) {
            zoomToExhibit(slotId, exhibit);
            return;
          }
          record.openProduct(exhibit.productId);
        },
        onSelectGadget(gadget) {
          if (!gadget) return;
          lockedChip = true;
          showFocusBanner(
            `屏幕特写 · ${gadget.name}`,
            `${gadget.category} · ${gadget.period} — ${gadget.note}`,
          );
        },
        onHoverSlot(slotId) {
          for (const [id, marker] of record.markers.entries()) {
            marker.classList.toggle('is-hovered', id === slotId);
          }
        },
        onHoverGadget(gadget) {
          if (lockedChip) return;
          if (!gadget) {
            gadgetChip.hidden = true;
            gadgetChip.replaceChildren();
            return;
          }
          showFocusBanner(
            `现役 · ${gadget.name}`,
            `${gadget.category} · ${gadget.period} — ${gadget.note}（点击放大屏幕）`,
            { allowBack: false },
          );
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
      const modelSrc = exhibit && modelUrl?.(exhibit);
      stageExhibits.push({
        slot: id,
        exhibit: exhibit ? {
          ...exhibit,
          imageEl: null,
          modelUrl: modelSrc ? String(modelSrc) : null,
          modelCredentials: openProduct ? 'include' : 'omit',
        } : null,
      });

      // Only render markers for occupied exhibits — never clutter the 3D scene with empty placeholders
      if (!exhibit) continue;

      const interactive = Boolean(openProduct);
      const markerGroup = el('div', null, {
        class: 'room-marker-group',
        'data-slot': id,
        'data-zone': group.zone,
      });

      if (!record.stage) {
        markerGroup.style.left = `${fallbackX}%`;
        markerGroup.style.top = `${fallbackY}%`;
      }

      const marker = el('button', null, {
        type: 'button',
        class: 'room-marker occupied',
        'aria-label': interactive ? `${label}：${exhibit.name}（查看商品详情）` : `${label}：${exhibit.name}（放大特写）`,
      });

      const src = coverUrl?.(exhibit);
      if (src) {
        const imageEl = el('img', null, {
          alt: `${exhibit.name}封面`,
          referrerpolicy: 'no-referrer',
          crossorigin: interactive ? 'use-credentials' : 'anonymous',
        });
        imageEl.addEventListener('load', () => {
          record.stage?.refreshSlotTexture(id, imageEl);
        });
        imageEl.addEventListener('error', () => { imageEl.hidden = true; });
        imageEl.src = src;
        stageExhibits[stageExhibits.length - 1].exhibit.imageEl = imageEl;
        marker.append(imageEl);
      }

      const meta = el('span', null, { class: 'marker-meta' });
      meta.append(el('span', exhibit.name, { class: 'marker-name' }), el('small', label));
      marker.append(meta);

      marker.addEventListener('click', () => {
        if (interactive) openProduct(exhibit.productId);
        else record.zoomToExhibit?.(id, exhibit);
      });

      const zoomBtn = el('button', '放大', {
        type: 'button',
        class: 'marker-zoom-btn',
        'aria-label': `放大展示 ${exhibit.name}`,
        title: '单独放大特写',
      });
      zoomBtn.addEventListener('click', () => record.zoomToExhibit?.(id, exhibit));

      markerGroup.append(marker, zoomBtn);
      markerGroup.addEventListener('mouseenter', () => record.stage?.setHoveredSlot(id));
      markerGroup.addEventListener('mouseleave', () => record.stage?.setHoveredSlot(null));

      record.overlay.append(markerGroup);
      record.markers.set(id, markerGroup);
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
    head.append(el('h4', group.heading), el('span', group.category, { class: 'zone-chip' }));
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
      select.append(el('option', '未摆放（收起）', { value: '' }));
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
      modelUrl: exhibit => exhibit.modelPath ? resolveUrl(exhibit.modelPath) : null,
    });
    status.textContent = slots.some(slot => slot.exhibit) ? '仅展示房间内公开摆放的收藏。' : '这间小屋还没有摆出收藏。';
  } catch {
    destroyRoom(sceneEl);
    status.textContent = '暂时无法加载房间，请刷新重试。';
  }
}
