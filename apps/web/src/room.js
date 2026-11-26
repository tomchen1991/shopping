import './room.css';
import { createRoomStage } from './room-3d.js';
import { SURFACES, findOpenSpot } from './room-surfaces.js';

const categoryLabels = { electronics: '电子产品', game: '游戏', figure: '手办' };
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

export function setRoomCuratorMode(sceneEl, enabled) {
  const record = stages.get(sceneEl);
  if (!record) return;
  record.curatorMode = Boolean(enabled);
  const shell = sceneEl.closest('.room-stage-shell');
  if (shell) shell.classList.toggle('is-curating', record.curatorMode);
  record.stage?.setCuratorMode(record.curatorMode);
  if (!record.curatorMode) {
    record.selectedId = null;
    record.renderInspector?.();
  }
}

export function beginDockDrag(sceneEl, holdingId, category) {
  const record = stages.get(sceneEl);
  if (!record) return;
  record.externalDrag = { holdingId, category, lastHit: null };
  record.stage?.setHighlightedCategory(category);
}

export function endDockDrag(sceneEl) {
  const record = stages.get(sceneEl);
  if (!record) return;
  record.externalDrag = null;
  record.stage?.setHighlightedCategory(null);
  record.stage?.hideGhost();
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

export function renderRoom(sceneEl, placements, {
  coverUrl,
  modelUrl,
  openProduct,
  onSavePlacement,
  onRemovePlacement,
  curatorMode = false,
} = {}) {
  let record = stages.get(sceneEl);
  if (!record) {
    sceneEl.replaceChildren();
    const shell = sceneEl.closest('.room-stage-shell');
    const overlay = el('div', null, { class: 'room-overlay' });
    const gadgetChip = el('div', null, { class: 'room-gadget-chip', hidden: '' });
    const inspectorBar = el('div', null, { class: 'room-inspector-bar', hidden: '' });
    const hint = el('div', '拖拽旋转 · 滚轮缩放 · 点击展品或屏幕单独放大特写', { class: 'room-hud-hint' });

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

    const hudControls = el('div', null, { class: 'room-hud-controls', role: 'group', 'aria-label': '3D 展厅快捷控制' });
    const orbitBtn = el('button', '✦ 自动环绕', { type: 'button', class: 'hud-pill', 'aria-pressed': 'false' });
    const labelsBtn = el('button', '隐藏标签', { type: 'button', class: 'hud-pill', 'aria-pressed': 'false' });
    const resetBtn = el('button', '↺ 全景复位', { type: 'button', class: 'hud-pill' });
    hudControls.append(orbitBtn, labelsBtn, resetBtn);

    sceneEl.append(overlay, gadgetChip, inspectorBar, topBar, hint, hudControls);

    let hideLabels = false;
    let isExpanded = false;
    let lockedChip = false;

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

    const showFocusBanner = (title, subtitle, { allowBack = true, productId = null } = {}) => {
      const textWrap = el('div', null, { class: 'room-gadget-chip-text' });
      textWrap.append(el('strong', title), el('span', subtitle));
      gadgetChip.replaceChildren(textWrap);
      if (productId && record.openProduct) {
        const detailBtn = el('button', '商品详情', { type: 'button', class: 'hud-pill' });
        detailBtn.addEventListener('click', () => record.openProduct(productId));
        gadgetChip.append(detailBtn);
      }
      if (allowBack) {
        const backBtn = el('button', '← 返回全景', { type: 'button', class: 'hud-pill is-active' });
        backBtn.addEventListener('click', resetToOverview);
        gadgetChip.append(backBtn);
      }
      gadgetChip.hidden = false;
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

    // HTML5 Drag & Drop onto 3D Display Surfaces
    sceneEl.addEventListener('dragover', event => {
      if (!record.externalDrag || !record.stage) return;
      const { holdingId, category } = record.externalDrag;
      const hit = record.stage.raycastSurface(event.clientX, event.clientY, category, holdingId, 1);
      if (hit) {
        record.externalDrag.lastHit = hit;
        record.stage.showGhost(hit.surface, hit.x, hit.z, hit.ok, 1);
        if (hit.ok) event.preventDefault();
      } else {
        record.externalDrag.lastHit = null;
        record.stage.hideGhost();
      }
    });

    sceneEl.addEventListener('dragleave', event => {
      if (!sceneEl.contains(event.relatedTarget)) {
        record.stage?.hideGhost();
      }
    });

    sceneEl.addEventListener('drop', event => {
      const drag = record.externalDrag;
      if (!drag) return;
      event.preventDefault();
      const hit = drag.lastHit || record.stage?.raycastSurface(event.clientX, event.clientY, drag.category, drag.holdingId, 1);
      endDockDrag(sceneEl);
      if (hit?.ok && record.onSavePlacement) {
        record.selectedId = drag.holdingId;
        record.onSavePlacement(drag.holdingId, {
          surface: hit.surface,
          x: hit.x,
          z: hit.z,
          rotationY: 0,
          scale: 1,
        });
      }
    });

    record = {
      overlay,
      inspectorBar,
      markers: new Map(),
      openProduct,
      onSavePlacement,
      onRemovePlacement,
      curatorMode,
      selectedId: null,
      externalDrag: null,
      stage: null,
      cleanup: () => window.removeEventListener('keydown', onKeyDown),
    };

    const syncOrbitBtn = active => {
      orbitBtn.classList.toggle('is-active', active);
      orbitBtn.setAttribute('aria-pressed', String(active));
      orbitBtn.textContent = active ? '❚❚ 暂停环绕' : '✦ 自动环绕';
    };

    const zoomToExhibit = item => {
      const id = item.holdingId || item.id;
      const zone = SURFACES[item.surface]?.zone || 'overview';
      const scope = sceneEl.closest('.showcase-card');
      if (scope) {
        for (const btn of scope.querySelectorAll('[data-camera]')) {
          btn.classList.toggle('active', btn.dataset.camera === zone);
        }
      }
      record.stage?.focusPlacement(id);
      lockedChip = true;
      showFocusBanner(
        `特写展示 · ${item.name}`,
        `${SURFACES[item.surface]?.label || ''} · 可拖拽微调视角，按 Esc 返回全景`,
        { productId: item.productId || null },
      );
    };
    record.zoomToExhibit = zoomToExhibit;

    const renderInspector = () => {
      const item = record.curatorMode && record.selectedId
        ? record.placements?.find(p => (p.holdingId || p.id) === record.selectedId)
        : null;
      if (!item) {
        inspectorBar.hidden = true;
        inspectorBar.replaceChildren();
        return;
      }
      const sameCategorySurfaces = Object.values(SURFACES).filter(s => s.category === item.category);
      const surfaceWrap = el('div', null, { class: 'inspector-surfaces' });
      for (const s of sameCategorySurfaces) {
        const btn = el('button', s.label, {
          type: 'button',
          class: `hud-pill${item.surface === s.id ? ' is-active' : ''}`,
        });
        btn.addEventListener('click', () => {
          if (item.surface === s.id) return;
          const spot = findOpenSpot(item.category, record.placements, s.id);
          record.onSavePlacement?.(item.holdingId, {
            surface: s.id,
            x: spot.surface === s.id ? spot.x : 0.5,
            z: spot.surface === s.id ? spot.z : 0.5,
            rotationY: item.rotationY || 0,
            scale: item.scale || 1,
          });
        });
        surfaceWrap.append(btn);
      }

      const rotLabel = el('label', '朝向', { class: 'inspector-slider' });
      const rotInput = el('input', null, {
        type: 'range', min: '-180', max: '180', step: '5',
        value: String(Math.round(((item.rotationY || 0) * 180) / Math.PI)),
      });
      rotInput.addEventListener('input', () => {
        const rad = (Number(rotInput.value) * Math.PI) / 180;
        record.stage?.previewPlacementTransform(item.holdingId, { rotationY: rad });
      });
      rotInput.addEventListener('change', () => {
        const rad = (Number(rotInput.value) * Math.PI) / 180;
        record.onSavePlacement?.(item.holdingId, {
          surface: item.surface, x: item.x, z: item.z, rotationY: rad, scale: item.scale || 1,
        });
      });
      rotLabel.append(rotInput);

      const scaleLabel = el('label', '大小', { class: 'inspector-slider' });
      const scaleInput = el('input', null, {
        type: 'range', min: '0.65', max: '1.5', step: '0.05',
        value: String(item.scale ?? 1),
      });
      scaleInput.addEventListener('input', () => {
        record.stage?.previewPlacementTransform(item.holdingId, { scale: Number(scaleInput.value) });
      });
      scaleInput.addEventListener('change', () => {
        record.onSavePlacement?.(item.holdingId, {
          surface: item.surface, x: item.x, z: item.z, rotationY: item.rotationY || 0, scale: Number(scaleInput.value),
        });
      });
      scaleLabel.append(scaleInput);

      const zoomBtn = el('button', '🔍 特写', { type: 'button', class: 'hud-pill' });
      zoomBtn.addEventListener('click', () => zoomToExhibit(item));

      const removeBtn = el('button', '收起藏品', { type: 'button', class: 'hud-pill' });
      removeBtn.addEventListener('click', () => {
        record.selectedId = null;
        renderInspector();
        record.onRemovePlacement?.(item.holdingId);
      });

      inspectorBar.replaceChildren(
        el('span', item.name, { class: 'inspector-title' }),
        ...(sameCategorySurfaces.length > 1 ? [surfaceWrap] : []),
        rotLabel,
        scaleLabel,
        zoomBtn,
        removeBtn,
      );
      inspectorBar.hidden = false;
    };
    record.renderInspector = renderInspector;

    try {
      record.stage = createRoomStage(sceneEl, {
        onAutoOrbitChange: syncOrbitBtn,
        onSelectPlacement(id, { fromCanvas = false } = {}) {
          const item = record.placements?.find(p => (p.holdingId || p.id) === id);
          if (!item) return;
          if (record.curatorMode) {
            record.selectedId = id;
            record.stage?.setSelectedPlacement(id);
            for (const [mid, marker] of record.markers.entries()) {
              marker.classList.toggle('is-selected', mid === id);
            }
            renderInspector();
            return;
          }
          if (fromCanvas || !record.openProduct) {
            zoomToExhibit(item);
            return;
          }
          record.openProduct(item.productId);
        },
        onCommitPlacement(holdingId, transform) {
          record.onSavePlacement?.(holdingId, transform);
        },
        onSelectGadget(gadget) {
          if (!gadget) return;
          lockedChip = true;
          showFocusBanner(
            `屏幕特写 · ${gadget.name}`,
            `${gadget.category} · ${gadget.period} — ${gadget.note}`,
          );
        },
        onHoverPlacement(id) {
          for (const [mid, marker] of record.markers.entries()) {
            marker.classList.toggle('is-hovered', mid === id);
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
  record.onSavePlacement = onSavePlacement;
  record.onRemovePlacement = onRemovePlacement;
  record.curatorMode = curatorMode;
  record.placements = placements;
  record.markers.clear();
  record.overlay.replaceChildren();

  const stageItems = [];

  for (const [idx, item] of placements.entries()) {
    const key = item.holdingId || item.id;
    const surfaceMeta = SURFACES[item.surface];
    const zone = surfaceMeta?.zone || 'electronics';
    const label = surfaceMeta?.label || '';
    const interactive = Boolean(openProduct);
    const modelSrc = modelUrl?.(item);

    const stageItem = {
      ...item,
      holdingId: key,
      imageEl: null,
      modelUrl: modelSrc ? String(modelSrc) : null,
      modelCredentials: openProduct ? 'include' : 'omit',
    };
    stageItems.push(stageItem);

    const markerGroup = el('div', null, {
      class: `room-marker-group${record.selectedId === key ? ' is-selected' : ''}`,
      'data-holding': key,
      'data-zone': zone,
    });

    if (!record.stage) {
      markerGroup.style.left = `${20 + (idx % 4) * 20}%`;
      markerGroup.style.top = `${40 + Math.floor(idx / 4) * 20}%`;
    }

    const marker = el('button', null, {
      type: 'button',
      class: 'room-marker occupied',
      'aria-label': interactive ? `${label}：${item.name}（查看商品详情）` : `${label}：${item.name}（放大特写）`,
    });

    const src = coverUrl?.(item);
    if (src) {
      const imageEl = el('img', null, {
        alt: `${item.name}封面`,
        referrerpolicy: 'no-referrer',
        crossorigin: interactive ? 'use-credentials' : 'anonymous',
      });
      imageEl.addEventListener('load', () => {
        record.stage?.refreshPlacementTexture(key, imageEl);
      });
      imageEl.addEventListener('error', () => { imageEl.hidden = true; });
      imageEl.src = src;
      stageItem.imageEl = imageEl;
      marker.append(imageEl);
    }

    const meta = el('span', null, { class: 'marker-meta' });
    meta.append(el('span', item.name, { class: 'marker-name' }), el('small', label));
    marker.append(meta);

    marker.addEventListener('click', () => {
      if (record.curatorMode) {
        record.selectedId = key;
        record.stage?.setSelectedPlacement(key);
        record.renderInspector?.();
        return;
      }
      if (interactive) openProduct(item.productId);
      else record.zoomToExhibit?.(item);
    });

    const zoomBtn = el('button', '放大', {
      type: 'button',
      class: 'marker-zoom-btn',
      'aria-label': `放大展示 ${item.name}`,
      title: '单独放大特写',
    });
    zoomBtn.addEventListener('click', () => record.zoomToExhibit?.(item));

    markerGroup.append(marker, zoomBtn);
    markerGroup.addEventListener('mouseenter', () => record.stage?.setHoveredPlacement(key));
    markerGroup.addEventListener('mouseleave', () => record.stage?.setHoveredPlacement(null));

    record.overlay.append(markerGroup);
    record.markers.set(key, markerGroup);
  }

  record.stage?.setPlacements(stageItems);
  record.renderInspector?.();
}

export function renderCuratorDock(dockEl, {
  sceneEl,
  placements,
  products,
  holdings,
  onPlace,
  onRemove,
  onSelect,
}) {
  const productById = new Map(products.map(p => [p.id, p]));
  const placedByHolding = new Map(placements.map(p => [p.holdingId, p]));

  const head = el('div', null, { class: 'curator-dock-head' });
  head.append(
    el('h4', '已入库藏品托盘'),
    el('p', '直接把未摆放藏品拖入上方 3D 展示面，或点击「放入房间」自动落位；拖动已摆放模型可调整位置。'),
  );

  if (!holdings.length) {
    dockEl.replaceChildren(head, el('p', '还没有已收货的藏品。在下方添加商品并确认收货后，即可摆进 3D 房间。', { class: 'status-line' }));
    return;
  }

  const grid = el('div', null, { class: 'curator-grid' });

  for (const item of holdings) {
    const product = productById.get(item.productId);
    if (!product) continue;
    const placed = placedByHolding.get(item.id);
    const card = el('div', null, {
      class: `curator-card${placed ? ' is-placed' : ''}`,
      ...(!placed && { draggable: 'true' }),
    });

    if (!placed) {
      card.addEventListener('dragstart', event => {
        event.dataTransfer?.setData('text/plain', item.id);
        beginDockDrag(sceneEl, item.id, product.category);
      });
      card.addEventListener('dragend', () => endDockDrag(sceneEl));
    }

    const info = el('div', null, { class: 'curator-card-info' });
    info.append(el('span', product.name, { class: 'curator-card-title' }));
    const meta = el('div', null, { class: 'curator-card-meta' });
    meta.append(el('span', categoryLabels[product.category]));
    if (product.modelId) meta.append(el('span', '· 3D模型'));
    if (placed) meta.append(el('span', `· ${SURFACES[placed.surface]?.label || ''}`));
    info.append(meta);

    const actions = el('div', null, { class: 'curator-card-actions' });
    if (placed) {
      const focusBtn = el('button', '调整', {
        type: 'button',
        class: 'secondary btn-sm',
        'aria-label': `调整 ${product.name}`,
      });
      focusBtn.addEventListener('click', () => onSelect(placed));
      const removeBtn = el('button', '收起', {
        type: 'button',
        class: 'secondary btn-sm',
        'aria-label': `收起 ${product.name}`,
      });
      removeBtn.addEventListener('click', () => onRemove(item.id));
      actions.append(focusBtn, removeBtn);
    } else {
      const placeBtn = el('button', '放入房间', {
        type: 'button',
        class: 'btn-sm',
        'aria-label': `将 ${product.name} 放入房间`,
      });
      placeBtn.addEventListener('click', () => {
        const spot = findOpenSpot(product.category, placements);
        onPlace(item.id, spot);
      });
      actions.append(placeBtn);
    }

    card.append(info, actions);
    grid.append(card);
  }

  dockEl.replaceChildren(head, grid);
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
    const { placements } = await response.json();
    renderRoom(sceneEl, placements, {
      coverUrl: item => item.coverPath ? resolveUrl(item.coverPath) : null,
      modelUrl: item => item.modelPath ? resolveUrl(item.modelPath) : null,
    });
    status.textContent = placements.length ? '仅展示房间内公开摆放的收藏。' : '这间小屋还没有摆出收藏。';
  } catch {
    destroyRoom(sceneEl);
    status.textContent = '暂时无法加载房间，请刷新重试。';
  }
}
