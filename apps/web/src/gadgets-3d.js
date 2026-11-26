import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

function canvasTex(width, height, draw) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  draw(canvas.getContext('2d'), width, height);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

let useSimpleBoxes = false;

function rbox(w, h, d, radius, mat, pos = [0, 0, 0], rot = [0, 0, 0]) {
  const geo = useSimpleBoxes || radius <= 0 ? new THREE.BoxGeometry(w, h, d) : new RoundedBoxGeometry(w, h, d, 1, radius);
  const m = new THREE.Mesh(geo, mat);
  m.position.set(...pos);
  m.rotation.set(...rot);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

function tagDevice(root, info, focus = {}) {
  root.userData.gadgetRoot = root;
  root.userData.gadgetInfo = info;
  root.userData.gadgetFocus = focus;
  root.traverse(node => {
    if (node.isMesh) {
      node.userData.gadget = info;
      node.userData.gadgetRoot = root;
    }
  });
  return root;
}

export function buildActiveGadgets(deskGroup, shelfGroup, { fast = false } = {}) {
  useSimpleBoxes = Boolean(fast);
  const textures = [];
  const trackTex = tex => { textures.push(tex); return tex; };

  const spaceGray = new THREE.MeshStandardMaterial({ color: 0x525d6d, roughness: 0.28, metalness: 0.82 });
  const matteBlack = new THREE.MeshStandardMaterial({ color: 0x111827, roughness: 0.42, metalness: 0.28 });
  const darkMetal = new THREE.MeshStandardMaterial({ color: 0x1f2937, roughness: 0.3, metalness: 0.78 });
  const pureWhite = new THREE.MeshStandardMaterial({ color: 0xd8dee9, roughness: 0.48, metalness: 0.08 });
  const warmSilver = new THREE.MeshStandardMaterial({ color: 0xd1d5db, roughness: 0.24, metalness: 0.86 });
  const cyanJoy = new THREE.MeshStandardMaterial({ color: 0x06b6d4, roughness: 0.32, metalness: 0.22 });
  const coralJoy = new THREE.MeshStandardMaterial({ color: 0xf43f5e, roughness: 0.32, metalness: 0.22 });
  const glassLens = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.08, metalness: 0.9 });

  // 1. Apple MacBook Pro (M1 Pro) (2021-10) on ergonomic aluminum stand
  const macTex = trackTex(canvasTex(256, 160, (ctx, w, h) => {
    const g = ctx.createLinearGradient(0, 0, w, h);
    g.addColorStop(0, '#0f172a');
    g.addColorStop(0.55, '#1d4ed8');
    g.addColorStop(1, '#f97316');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(15, 23, 42, 0.72)';
    ctx.fillRect(24, 24, 208, 112);
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.fillRect(36, 36, 84, 88);
    ctx.fillStyle = '#38bdf8';
    ctx.fillRect(132, 42, 86, 8);
    ctx.fillStyle = '#94a3b8';
    ctx.fillRect(132, 58, 64, 6);
    ctx.fillRect(132, 72, 76, 6);
    ctx.fillStyle = '#0b0f14';
    ctx.fillRect(w / 2 - 14, 0, 28, 7);
  }));
  const macbook = new THREE.Group();
  macbook.position.set(-0.22, 0.9, -0.34);
  macbook.rotation.y = Math.PI / 2 - 0.14;
  macbook.add(
    rbox(0.38, 0.036, 0.25, 0.008, warmSilver, [0, 0.018, 0]),
    rbox(0.46, 0.016, 0.32, 0.005, spaceGray, [0, 0.055, 0]),
    rbox(0.38, 0.005, 0.14, 0.002, matteBlack, [0, 0.065, -0.04]),
    rbox(0.16, 0.004, 0.1, 0.002, darkMetal, [0, 0.064, 0.095]),
    rbox(0.46, 0.3, 0.012, 0.004, spaceGray, [0, 0.205, -0.175], [-0.22, 0, 0]),
  );
  const macScreen = new THREE.Mesh(new THREE.PlaneGeometry(0.43, 0.27), new THREE.MeshBasicMaterial({ map: macTex }));
  macScreen.position.set(0, 0.205, -0.168);
  macScreen.rotation.x = -0.22;
  macbook.add(macScreen);
  tagDevice(macbook, {
    name: 'Apple MacBook Pro (M1 Pro)',
    period: '2021.10 — 至今',
    category: '笔记本',
    note: '贵的才是性价比最高的，M1 Pro芯片在2026年依然能打',
  }, { offset: [0, 0.16, -0.06], forward: [0, 0.12, 1], distance: 0.78 });
  deskGroup.add(macbook);

  // 2. iPad Air 4 (2021-11) on magnetic folio stand + Apple Pencil
  const ipadTex = trackTex(canvasTex(256, 192, (ctx, w, h) => {
    const g = ctx.createLinearGradient(0, 0, w, h);
    g.addColorStop(0, '#0284c7');
    g.addColorStop(0.5, '#6366f1');
    g.addColorStop(1, '#ec4899');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = 'rgba(255,255,255,0.48)';
    ctx.lineWidth = 14;
    ctx.beginPath();
    ctx.arc(w * 0.5, h * 0.52, 54, 0.2, Math.PI * 1.65);
    ctx.stroke();
  }));
  const ipad = new THREE.Group();
  ipad.position.set(0.12, 0.9, 0.38);
  ipad.rotation.y = Math.PI / 2 - 0.28;
  ipad.add(
    rbox(0.24, 0.015, 0.14, 0.005, darkMetal, [0, 0.01, -0.02]),
    rbox(0.32, 0.24, 0.012, 0.004, spaceGray, [0, 0.13, 0], [-0.28, 0, 0]),
    rbox(0.01, 0.01, 0.17, 0.004, pureWhite, [0, 0.256, -0.032], [0, Math.PI / 2, 0]),
  );
  const ipadScreen = new THREE.Mesh(new THREE.PlaneGeometry(0.295, 0.215), new THREE.MeshBasicMaterial({ map: ipadTex }));
  ipadScreen.position.set(0, 0.132, 0.008);
  ipadScreen.rotation.x = -0.28;
  ipad.add(ipadScreen);
  tagDevice(ipad, {
    name: 'iPad Air 4',
    period: '2021.11 — 至今',
    category: '平板',
    note: '不管是看片还是漫画、娱乐起来太强了',
  }, { offset: [0, 0.12, 0], forward: [0, 0.14, 1], distance: 0.62 });
  deskGroup.add(ipad);

  // 3. OPPO Find X8 (2025-04) upright on MagSafe-style desk dock
  const oppoTex = trackTex(canvasTex(128, 256, (ctx, w, h) => {
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#38bdf8');
    g.addColorStop(0.55, '#bae6fd');
    g.addColorStop(1, '#0f172a');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#0f172a';
    ctx.font = 'bold 28px system-ui';
    ctx.fillText('18:00', 22, 68);
  }));
  const oppo = new THREE.Group();
  oppo.position.set(0.34, 0.9, 0.66);
  oppo.rotation.y = Math.PI / 2 - 0.42;
  oppo.add(
    rbox(0.095, 0.018, 0.11, 0.006, darkMetal, [0, 0.01, 0]),
    rbox(0.095, 0.195, 0.012, 0.005, warmSilver, [0, 0.115, 0], [-0.24, 0, 0]),
  );
  const oppoScreen = new THREE.Mesh(new THREE.PlaneGeometry(0.086, 0.184), new THREE.MeshBasicMaterial({ map: oppoTex }));
  oppoScreen.position.set(0, 0.116, 0.007);
  oppoScreen.rotation.x = -0.24;
  const oppoCamRing = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 0.008, 24), warmSilver);
  oppoCamRing.rotation.x = Math.PI / 2 - 0.24;
  oppoCamRing.position.set(0, 0.15, -0.008);
  const oppoCamGlass = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.024, 0.009, 24), glassLens);
  oppoCamGlass.rotation.x = Math.PI / 2 - 0.24;
  oppoCamGlass.position.set(0, 0.15, -0.009);
  oppo.add(oppoScreen, oppoCamRing, oppoCamGlass);
  tagDevice(oppo, {
    name: 'OPPO Find X8',
    period: '2025.04 — 至今',
    category: '手机',
    note: 'OPhone名不虚传，皮实好用就是爽',
  }, { offset: [0, 0.11, 0], forward: [0, 0.14, 1], distance: 0.52 });
  deskGroup.add(oppo);

  // 4. Kindle Voyage (2019-01) on reading stand
  const kindleTex = trackTex(canvasTex(160, 220, (ctx, w, h) => {
    ctx.fillStyle = '#f5f0e6';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#1e293b';
    ctx.font = 'bold 14px serif';
    ctx.fillText('CHAPTER IV', 18, 28);
    ctx.fillStyle = '#475569';
    for (let y = 44; y < h - 24; y += 16) {
      ctx.fillRect(18, y, y % 48 === 28 ? w - 58 : w - 36, 4);
    }
  }));
  const kindle = new THREE.Group();
  kindle.position.set(0.28, 0.9, -0.58);
  kindle.rotation.y = Math.PI / 2 + 0.22;
  kindle.add(
    rbox(0.15, 0.014, 0.11, 0.005, darkMetal, [0, 0.008, -0.01]),
    rbox(0.165, 0.22, 0.012, 0.004, matteBlack, [0, 0.118, 0], [-0.32, 0, 0]),
  );
  const kindleScreen = new THREE.Mesh(new THREE.PlaneGeometry(0.135, 0.175), new THREE.MeshBasicMaterial({ map: kindleTex }));
  kindleScreen.position.set(0, 0.122, 0.007);
  kindleScreen.rotation.x = -0.32;
  kindle.add(kindleScreen);
  tagDevice(kindle, {
    name: 'Kindle Voyage',
    period: '2019.01 — 至今',
    category: '平板 / 阅读器',
    note: '陪伴多年依然清晰的经典墨水屏阅读器',
  }, { offset: [0, 0.11, 0], forward: [0, 0.16, 1], distance: 0.56 });
  deskGroup.add(kindle);

  // 5. Xbox Series S (2021-11) + sculpted wireless controller (media shelf bottom-left)
  const xbox = new THREE.Group();
  xbox.position.set(-0.74, 0.19, 0.03);
  xbox.rotation.y = 0.08;
  xbox.add(rbox(0.42, 0.11, 0.26, 0.014, pureWhite, [0, 0.055, 0]));
  const xboxFan = new THREE.Mesh(new THREE.CylinderGeometry(0.088, 0.088, 0.008, 32), matteBlack);
  xboxFan.position.set(-0.09, 0.112, 0);
  const xboxLogo = new THREE.Mesh(
    new THREE.SphereGeometry(0.012, 12, 12),
    new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 1.4 }),
  );
  xboxLogo.position.set(0.15, 0.075, 0.128);
  const xboxPad = new THREE.Group();
  xboxPad.position.set(0.32, 0.02, 0.07);
  xboxPad.rotation.y = -0.25;
  xboxPad.add(
    rbox(0.18, 0.044, 0.12, 0.016, pureWhite, [0, 0.022, 0]),
    rbox(0.04, 0.022, 0.04, 0.006, matteBlack, [-0.045, 0.05, -0.01]),
    rbox(0.04, 0.022, 0.04, 0.006, matteBlack, [0.04, 0.05, 0.01]),
  );
  xbox.add(xboxFan, xboxLogo, xboxPad);
  tagDevice(xbox, {
    name: 'Xbox Series S',
    period: '2021.11 — 至今',
    category: '游戏机',
    note: '最便宜的次世代机器，小巧纯白高颜值',
  }, { offset: [0.06, 0.08, 0], forward: [0, 0.25, 1], distance: 0.9 });
  shelfGroup.add(xbox);

  // 6. Steam Deck (2024-02) on dock (media shelf bottom-right)
  const steamTex = trackTex(canvasTex(256, 160, (ctx, w, h) => {
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#1e3a8a';
    ctx.fillRect(14, 16, w - 28, 34);
    ctx.fillStyle = '#e2e8f0';
    ctx.font = 'bold 14px system-ui';
    ctx.fillText('STEAM OS', 24, 38);
    for (let i = 0; i < 4; i++) {
      ctx.fillStyle = ['#38bdf8', '#a855f7', '#10b981', '#f59e0b'][i];
      ctx.fillRect(18 + i * 56, 66, 48, 74);
    }
  }));
  const steamDeck = new THREE.Group();
  steamDeck.position.set(0.74, 0.19, 0.05);
  steamDeck.rotation.y = -0.14;
  steamDeck.add(
    rbox(0.28, 0.03, 0.14, 0.008, darkMetal, [0, 0.015, 0]),
    rbox(0.48, 0.19, 0.045, 0.018, matteBlack, [0, 0.12, 0.01], [-0.22, 0, 0]),
    rbox(0.05, 0.05, 0.014, 0.004, darkMetal, [-0.15, 0.11, 0.036], [-0.22, 0, 0]),
    rbox(0.05, 0.05, 0.014, 0.004, darkMetal, [0.15, 0.11, 0.036], [-0.22, 0, 0]),
  );
  const steamScreen = new THREE.Mesh(new THREE.PlaneGeometry(0.24, 0.145), new THREE.MeshBasicMaterial({ map: steamTex }));
  steamScreen.position.set(0, 0.122, 0.034);
  steamScreen.rotation.x = -0.22;
  steamDeck.add(steamScreen);
  tagDevice(steamDeck, {
    name: 'Steam Deck',
    period: '2024.02 — 至今',
    category: '游戏机',
    note: 'Valve的硬件与第三方游戏优化反哺体验，爽的',
  }, { offset: [0, 0.12, 0], forward: [0, 0.16, 1], distance: 0.72 });
  shelfGroup.add(steamDeck);

  // 7. Nintendo Switch 2 (2025-06) docked with sculpted Joy-Cons (media shelf top-left)
  const switch2 = new THREE.Group();
  switch2.position.set(-0.62, 2.61, 0.02);
  switch2.rotation.y = 0.08;
  switch2.add(
    rbox(0.36, 0.19, 0.08, 0.014, matteBlack, [0, 0.095, -0.02]),
    rbox(0.32, 0.21, 0.024, 0.008, darkMetal, [0, 0.125, 0.005]),
    rbox(0.055, 0.21, 0.032, 0.014, darkMetal, [-0.19, 0.125, 0.005]),
    rbox(0.055, 0.21, 0.032, 0.014, darkMetal, [0.19, 0.125, 0.005]),
    rbox(0.014, 0.18, 0.026, 0.005, cyanJoy, [-0.158, 0.125, 0.005]),
    rbox(0.014, 0.18, 0.026, 0.005, coralJoy, [0.158, 0.125, 0.005]),
  );
  tagDevice(switch2, {
    name: 'Nintendo Switch 2',
    period: '2025.06 — 至今',
    category: '游戏机',
    note: '首发购入，任天堂无需多说',
  }, { offset: [0, 0.12, 0], forward: [0, 0.16, 1], distance: 0.76 });
  shelfGroup.add(switch2);

  // 8. Meta Quest 2 (2021-08) VR headset + dual Touch ring controllers (media shelf top-right)
  const quest2 = new THREE.Group();
  quest2.position.set(0.74, 2.61, 0.04);
  quest2.rotation.y = -0.14;
  quest2.add(
    rbox(0.28, 0.14, 0.14, 0.036, pureWhite, [0, 0.08, 0.01]),
    rbox(0.24, 0.12, 0.08, 0.02, matteBlack, [0, 0.08, -0.06]),
    rbox(0.26, 0.035, 0.22, 0.012, pureWhite, [0, 0.09, -0.11]),
  );
  for (const side of [-1, 1]) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.055, 0.01, 12, 26), pureWhite);
    ring.position.set(side * 0.24, 0.065, 0.04);
    ring.rotation.x = Math.PI * 0.36;
    ring.castShadow = true;
    const handle = rbox(0.032, 0.1, 0.032, 0.012, pureWhite, [side * 0.24, 0.03, 0.06], [0.25, 0, 0]);
    quest2.add(ring, handle);
  }
  tagDevice(quest2, {
    name: 'Meta Quest 2',
    period: '2021.08 — 至今',
    category: '游戏机 · VR',
    note: 'VR游戏，best游戏！',
  }, { offset: [0, 0.08, 0], forward: [0, 0.18, 1], distance: 0.88 });
  shelfGroup.add(quest2);

  return {
    dispose() {
      for (const tex of textures) tex.dispose();
    },
  };
}
