import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { buildActiveGadgets } from './gadgets-3d.js';

const PRESETS = {
  overview: { position: [5.9, 4.8, 6.7], target: [0.15, 1.3, -0.6] },
  electronics: { position: [1.55, 2.35, 3.35], target: [-1.85, 1.18, 1.08] },
  game: { position: [-0.65, 2.05, 2.45], target: [-0.65, 1.48, -2.55] },
  figure: { position: [0.72, 2.1, 1.9], target: [2.25, 1.62, -1.65] },
};

const THEMES = {
  day: {
    bg: 0x0f151e,
    fog: 0x0f151e,
    ambient: [0xfff4e0, 0.9],
    hemi: [0xdbeafe, 0x3b2f24, 0.75],
    key: [0xffe7c2, 2.3],
    keyPos: [-7.5, 6.8, 3.2],
    deskLamp: [0xffb86b, 2.6],
    shelfLed: 0xf59e0b,
    shelfIntensity: 1.5,
    cabinetSpot: [0xfff3d6, 3.8],
    skyTop: '#4f86c6',
    skyBottom: '#f7c588',
    accentGlow: 0x38bdf8,
  },
  night: {
    bg: 0x070a12,
    fog: 0x070a12,
    ambient: [0x4c5f8a, 0.52],
    hemi: [0x1e293b, 0x0f172a, 0.55],
    key: [0x7dd3fc, 0.9],
    keyPos: [-6.5, 5.5, 2.5],
    deskLamp: [0xff9e44, 3.2],
    shelfLed: 0x22d3ee,
    shelfIntensity: 2.8,
    cabinetSpot: [0xe0f2fe, 4.8],
    skyTop: '#070b1a',
    skyBottom: '#1e1b4b',
    accentGlow: 0x22d3ee,
  },
  gallery: {
    bg: 0x09090b,
    fog: 0x09090b,
    ambient: [0x9ca3af, 0.35],
    hemi: [0x334155, 0x111827, 0.35],
    key: [0xfef3c7, 1.1],
    keyPos: [2.5, 7.5, 4.5],
    deskLamp: [0xfde68a, 3.6],
    shelfLed: 0xfbbf24,
    shelfIntensity: 2.6,
    cabinetSpot: [0xffffff, 5.6],
    skyTop: '#111827',
    skyBottom: '#1f2937',
    accentGlow: 0xf59e0b,
  },
};

function makeCanvasTexture(width, height, draw, { repeat = [1, 1], srgb = true } = {}) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  draw(canvas.getContext('2d'), width, height);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(...repeat);
  texture.anisotropy = 4;
  return texture;
}

function createWoodTexture() {
  return makeCanvasTexture(512, 512, (ctx, w, h) => {
    ctx.fillStyle = '#3b281c';
    ctx.fillRect(0, 0, w, h);
    const rows = 8;
    const rh = h / rows;
    for (let r = 0; r < rows; r++) {
      const shade = 44 + ((r * 13) % 16);
      ctx.fillStyle = `rgb(${shade + 18}, ${shade - 4}, ${shade - 16})`;
      ctx.fillRect(0, r * rh + 1, w, rh - 2);
      ctx.fillStyle = 'rgba(0, 0, 0, 0.28)';
      ctx.fillRect(0, (r + 1) * rh - 2, w, 2);
      const splitX = ((r * 173 + 90) % (w - 80)) + 40;
      ctx.fillRect(splitX, r * rh, 2, rh);
      ctx.strokeStyle = 'rgba(255, 220, 185, 0.05)';
      ctx.beginPath();
      for (let g = 0; g < 6; g++) {
        const gy = r * rh + 8 + g * (rh / 7);
        ctx.moveTo(0, gy);
        ctx.lineTo(w, gy + ((g % 2) ? 2 : -2));
      }
      ctx.stroke();
    }
  }, { repeat: [3, 3] });
}

function createRugTexture() {
  return makeCanvasTexture(512, 512, (ctx, w, h) => {
    ctx.fillStyle = '#1f2933';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#384654';
    ctx.lineWidth = 14;
    ctx.strokeRect(20, 20, w - 40, h - 40);
    ctx.strokeStyle = '#c59b6d';
    ctx.lineWidth = 3;
    ctx.strokeRect(42, 42, w - 84, h - 84);
    ctx.strokeStyle = 'rgba(212, 175, 122, 0.28)';
    ctx.lineWidth = 2;
    for (let i = -w; i < w * 2; i += 48) {
      ctx.beginPath();
      ctx.moveTo(i, 48);
      ctx.lineTo(i + h * 0.4, h - 48);
      ctx.stroke();
    }
  });
}

function createMonitorTexture() {
  return makeCanvasTexture(512, 256, (ctx, w, h) => {
    const grad = ctx.createLinearGradient(0, 0, w, h);
    grad.addColorStop(0, '#07131f');
    grad.addColorStop(0.5, '#0c2738');
    grad.addColorStop(1, '#14213d');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(34, 211, 238, 0.16)';
    ctx.fillRect(28, 28, 190, 200);
    ctx.fillStyle = 'rgba(245, 158, 11, 0.18)';
    ctx.fillRect(236, 28, 248, 92);
    ctx.fillStyle = 'rgba(52, 211, 153, 0.16)';
    ctx.fillRect(236, 134, 248, 94);
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 3;
    ctx.beginPath();
    for (let x = 44; x < 204; x += 8) {
      const y = 145 + Math.sin(x * 0.08) * 32 + Math.cos(x * 0.03) * 14;
      if (x === 44) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.fillStyle = '#e2e8f0';
    ctx.font = '600 16px system-ui';
    ctx.fillText("COLLECTOR'S STUDIO OS", 252, 62);
    ctx.fillStyle = '#67e8f9';
    ctx.font = '12px monospace';
    ctx.fillText('3D DIORAMA // LIVE SYNC', 252, 88);
  });
}

function createPosterTexture() {
  return makeCanvasTexture(256, 340, (ctx, w, h) => {
    ctx.fillStyle = '#111827';
    ctx.fillRect(0, 0, w, h);
    const glow = ctx.createRadialGradient(w * 0.5, h * 0.42, 12, w * 0.5, h * 0.42, 120);
    glow.addColorStop(0, '#f59e0b');
    glow.addColorStop(0.45, '#ea580c');
    glow.addColorStop(1, 'rgba(17, 24, 39, 0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth = 2;
    ctx.strokeRect(22, 22, w - 44, h - 44);
    ctx.beginPath();
    ctx.arc(w / 2, h * 0.45, 58, 0, Math.PI * 2);
    ctx.stroke();
  });
}

function createSkyTexture(top, bottom, nightStars = false) {
  return makeCanvasTexture(256, 256, (ctx, w, h) => {
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, top);
    grad.addColorStop(1, bottom);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
    if (nightStars) {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.78)';
      for (let i = 0; i < 42; i++) {
        const sx = (i * 73) % w;
        const sy = (i * 41) % (h * 0.7);
        ctx.fillRect(sx, sy, (i % 3) + 1, (i % 3) + 1);
      }
      ctx.fillStyle = '#fef08a';
      ctx.beginPath();
      ctx.arc(w * 0.72, h * 0.28, 16, 0, Math.PI * 2);
      ctx.fill();
    }
  });
}

function box(w, h, d, material, pos = [0, 0, 0], { cast = true, receive = true } = {}) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  mesh.position.set(...pos);
  mesh.castShadow = cast;
  mesh.receiveShadow = receive;
  return mesh;
}

export function createRoomStage(container, { onSelectSlot, onHoverSlot, onHoverGadget, onProject } = {}) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.autoUpdate = false;
  renderer.shadowMap.needsUpdate = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.08;
  renderer.domElement.className = 'room-canvas';
  container.prepend(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(THEMES.day.bg);
  scene.fog = new THREE.FogExp2(THEMES.day.fog, 0.028);

  const camera = new THREE.PerspectiveCamera(38, 16 / 10, 0.1, 60);
  camera.position.set(...PRESETS.overview.position);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.07;
  controls.target.set(...PRESETS.overview.target);
  controls.minDistance = 2.6;
  controls.maxDistance = 12.5;
  controls.minPolarAngle = 0.25;
  controls.maxPolarAngle = Math.PI * 0.47;
  controls.update();

  // Lighting
  const ambientLight = new THREE.AmbientLight(...THEMES.day.ambient);
  const hemiLight = new THREE.HemisphereLight(...THEMES.day.hemi);
  const keyLight = new THREE.DirectionalLight(...THEMES.day.key);
  keyLight.position.set(...THEMES.day.keyPos);
  keyLight.castShadow = true;
  keyLight.shadow.mapSize.set(1024, 1024);
  keyLight.shadow.camera.near = 1;
  keyLight.shadow.camera.far = 22;
  keyLight.shadow.camera.left = -6;
  keyLight.shadow.camera.right = 6;
  keyLight.shadow.camera.top = 6;
  keyLight.shadow.camera.bottom = -6;
  keyLight.shadow.bias = -0.0005;

  const deskLampLight = new THREE.PointLight(0xffb86b, 2.6, 5.5, 1.6);
  deskLampLight.position.set(-2.22, 1.48, -0.05);

  const cabinetSpotA = new THREE.PointLight(0xfff3d6, 3.8, 4.5, 1.5);
  const cabinetSpotB = new THREE.PointLight(0xfff3d6, 2.4, 3.8, 1.6);
  const shelfLight = new THREE.PointLight(0xf59e0b, 1.8, 6.2, 1.4);
  shelfLight.position.set(-0.65, 1.95, -1.75);

  scene.add(ambientLight, hemiLight, keyLight, deskLampLight, shelfLight);

  // Materials
  const woodTex = createWoodTexture();
  const rugTex = createRugTexture();
  const monitorTex = createMonitorTexture();
  const posterTex = createPosterTexture();
  const textures = [woodTex, rugTex, monitorTex, posterTex];

  const floorMat = new THREE.MeshStandardMaterial({ map: woodTex, roughness: 0.72, metalness: 0.05 });
  const plinthMat = new THREE.MeshStandardMaterial({ color: 0x181d25, roughness: 0.85, metalness: 0.2 });
  const wallMat = new THREE.MeshStandardMaterial({ color: 0x1c2430, roughness: 0.86, metalness: 0.05 });
  const trimMat = new THREE.MeshStandardMaterial({ color: 0x121720, roughness: 0.6, metalness: 0.3 });
  const walnutMat = new THREE.MeshStandardMaterial({ color: 0x5c3a24, roughness: 0.55, metalness: 0.08 });
  const darkOakMat = new THREE.MeshStandardMaterial({ color: 0x2a1f19, roughness: 0.62, metalness: 0.1 });
  const matteMetalMat = new THREE.MeshStandardMaterial({ color: 0x161b22, roughness: 0.42, metalness: 0.72 });
  const brassMat = new THREE.MeshStandardMaterial({ color: 0xd4a359, roughness: 0.32, metalness: 0.85 });
  const ledStripMat = new THREE.MeshStandardMaterial({
    color: 0xfbbf24, emissive: 0xf59e0b, emissiveIntensity: 1.8, roughness: 0.2,
  });
  const accentLedMat = new THREE.MeshStandardMaterial({
    color: 0x38bdf8, emissive: 0x38bdf8, emissiveIntensity: 1.4, roughness: 0.2,
  });
  const glassMat = new THREE.MeshStandardMaterial({
    color: 0xdbeafe, transparent: true, opacity: 0.16, roughness: 0.08, metalness: 0.15,
    depthWrite: false, side: THREE.DoubleSide,
  });

  // Architectural Room Shell
  const roomGroup = new THREE.Group();
  roomGroup.add(box(7.4, 0.24, 6.6, plinthMat, [0, -0.13, 0], { cast: false }));
  roomGroup.add(box(7.2, 0.04, 6.4, floorMat, [0, -0.01, 0], { cast: false }));
  roomGroup.add(box(2.9, 0.02, 3.2, new THREE.MeshStandardMaterial({ map: rugTex, roughness: 0.95 }), [0.2, 0.015, 0.6], { cast: false }));

  // Back Wall (z = -3.2) & Acoustic Slats
  roomGroup.add(box(7.38, 3.85, 0.18, wallMat, [0, 1.925, -3.29]));
  roomGroup.add(box(7.2, 0.14, 0.05, trimMat, [0, 0.07, -3.18]));
  for (let i = 0; i < 16; i++) {
    roomGroup.add(box(0.08, 3.6, 0.05, walnutMat, [1.2 + i * 0.14, 1.9, -3.17]));
  }
  roomGroup.add(box(6.8, 0.04, 0.04, ledStripMat, [0, 3.74, -3.18], { cast: false }));

  // Left Wall (x = -3.6) with Cutout Panoramic Window
  roomGroup.add(box(0.18, 3.85, 1.5, wallMat, [-3.69, 1.925, -2.55]));
  roomGroup.add(box(0.18, 3.85, 2.2, wallMat, [-3.69, 1.925, 2.1]));
  roomGroup.add(box(0.18, 1.1, 2.8, wallMat, [-3.69, 0.55, -0.4]));
  roomGroup.add(box(0.18, 0.8, 2.8, wallMat, [-3.69, 3.45, -0.4]));
  roomGroup.add(box(0.24, 0.07, 2.84, trimMat, [-3.66, 1.1, -0.4]));
  roomGroup.add(box(0.24, 0.07, 2.84, trimMat, [-3.66, 3.05, -0.4]));
  roomGroup.add(box(0.22, 1.95, 0.06, trimMat, [-3.66, 2.08, -0.4]));
  roomGroup.add(box(0.18, 0.14, 6.4, trimMat, [-3.58, 0.07, 0]));

  const skyMat = new THREE.MeshBasicMaterial({ map: createSkyTexture(THEMES.day.skyTop, THEMES.day.skyBottom) });
  const skyPlane = new THREE.Mesh(new THREE.PlaneGeometry(2.8, 1.95), skyMat);
  skyPlane.rotation.y = Math.PI / 2;
  skyPlane.position.set(-3.82, 2.08, -0.4);
  roomGroup.add(skyPlane);
  const windowPane = new THREE.Mesh(new THREE.PlaneGeometry(2.74, 1.9), glassMat);
  windowPane.rotation.y = Math.PI / 2;
  windowPane.position.set(-3.64, 2.08, -0.4);
  windowPane.renderOrder = 4;
  roomGroup.add(windowPane);

  // Framed Wall Poster on left-front wall
  roomGroup.add(box(0.05, 1.18, 0.88, matteMetalMat, [-3.58, 2.15, 2.05]));
  const posterMesh = new THREE.Mesh(new THREE.PlaneGeometry(0.76, 1.06), new THREE.MeshStandardMaterial({ map: posterTex, roughness: 0.4 }));
  posterMesh.rotation.y = Math.PI / 2;
  posterMesh.position.set(-3.55, 2.15, 2.05);
  roomGroup.add(posterMesh);

  // =========================================================
  // ZONE 1: STUDIO ELECTRONICS DESK (desk-1, desk-2)
  // =========================================================
  const deskGroup = new THREE.Group();
  deskGroup.position.set(-2.05, 0, 1.05);
  // Tabletop & steel legs
  deskGroup.add(box(1.36, 0.08, 3.45, walnutMat, [0, 0.86, 0]));
  for (const [lx, lz] of [[-0.56, -1.55], [0.56, -1.55], [-0.56, 1.55], [0.56, 1.55]]) {
    deskGroup.add(box(0.07, 0.84, 0.07, matteMetalMat, [lx, 0.42, lz]));
  }
  deskGroup.add(box(0.04, 0.03, 3.2, accentLedMat, [-0.64, 0.81, 0], { cast: false }));
  // Desk mat & mechanical keyboard + mouse
  deskGroup.add(box(0.56, 0.015, 1.25, matteMetalMat, [0.16, 0.905, 0]));
  deskGroup.add(box(0.18, 0.025, 0.46, new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.4 }), [0.18, 0.925, 0.05]));
  deskGroup.add(box(0.11, 0.022, 0.07, new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.35 }), [0.18, 0.922, -0.3]));
  // Studio Monitor on stand
  deskGroup.add(box(0.14, 0.03, 0.26, matteMetalMat, [-0.45, 0.915, 0.22]));
  deskGroup.add(box(0.06, 0.48, 0.08, matteMetalMat, [-0.49, 1.14, 0.22]));
  deskGroup.add(box(0.06, 0.56, 1.12, matteMetalMat, [-0.39, 1.46, 0.22]));
  const screenMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(1.04, 0.48),
    new THREE.MeshBasicMaterial({ map: monitorTex }),
  );
  screenMesh.rotation.y = Math.PI / 2;
  screenMesh.position.set(-0.358, 1.46, 0.22);
  deskGroup.add(screenMesh);
  // Architect Desk Lamp
  deskGroup.add(box(0.18, 0.03, 0.18, matteMetalMat, [-0.35, 0.915, -1.45]));
  deskGroup.add(box(0.03, 0.55, 0.03, brassMat, [-0.35, 1.18, -1.45]));
  deskGroup.add(box(0.24, 0.06, 0.12, matteMetalMat, [-0.22, 1.48, -1.43]));
  deskGroup.add(box(0.18, 0.02, 0.08, ledStripMat, [-0.22, 1.445, -1.43], { cast: false }));
  roomGroup.add(deskGroup);

  // =========================================================
  // ZONE 2: ILLUMINATED MEDIA SHELF (shelf-1, shelf-2)
  // =========================================================
  const shelfGroup = new THREE.Group();
  shelfGroup.position.set(-0.65, 0, -2.58);
  shelfGroup.add(box(2.95, 3.08, 0.06, darkOakMat, [0, 1.54, -0.3]));
  for (const sx of [-1.45, 0, 1.45]) {
    shelfGroup.add(box(0.07, 3.08, 0.64, darkOakMat, [sx, 1.54, 0]));
  }
  for (const sy of [0.08, 0.88, 1.72, 2.58, 3.06]) {
    shelfGroup.add(box(2.95, 0.06, 0.64, darkOakMat, [0, sy, 0]));
  }
  // Under-shelf glowing LED strips (all illuminated tiers)
  for (const ly of [0.84, 1.68, 2.54, 3.02]) {
    shelfGroup.add(box(1.32, 0.02, 0.04, ledStripMat, [-0.72, ly, 0.18], { cast: false }));
    shelfGroup.add(box(1.32, 0.02, 0.04, ledStripMat, [0.72, ly, 0.18], { cast: false }));
  }
  const activeGadgets = buildActiveGadgets(deskGroup, shelfGroup);
  roomGroup.add(shelfGroup);

  // =========================================================
  // ZONE 3: MUSEUM GLASS DISPLAY CABINET (cabinet-1, cabinet-2)
  // =========================================================
  const cabinetGroup = new THREE.Group();
  cabinetGroup.position.set(2.25, 0, -1.65);
  cabinetGroup.rotation.y = -0.34;
  // Plinth base & top light canopy
  cabinetGroup.add(box(1.66, 0.44, 1.12, matteMetalMat, [0, 0.22, 0]));
  cabinetGroup.add(box(1.7, 0.04, 1.16, brassMat, [0, 0.45, 0]));
  cabinetGroup.add(box(1.66, 0.16, 1.12, matteMetalMat, [0, 2.98, 0]));
  cabinetGroup.add(box(1.2, 0.03, 0.72, ledStripMat, [0, 2.89, 0], { cast: false }));
  // Corner structural pillars
  for (const [cx, cz] of [[-0.79, -0.52], [0.79, -0.52], [-0.79, 0.52], [0.79, 0.52]]) {
    cabinetGroup.add(box(0.055, 2.46, 0.055, matteMetalMat, [cx, 1.69, cz]));
  }
  // Two interior glass display shelves
  for (const sy of [1.22, 2.06]) {
    const shelfPane = box(1.52, 0.03, 0.98, glassMat, [0, sy, 0], { cast: false, receive: false });
    shelfPane.renderOrder = 3;
    cabinetGroup.add(shelfPane);
  }
  // 4 Transparent glass walls around the cabinet
  for (const [gw, gd, gx, gz] of [
    [1.56, 0.02, 0, 0.53],
    [1.56, 0.02, 0, -0.53],
    [0.02, 1.02, -0.8, 0],
    [0.02, 1.02, 0.8, 0],
  ]) {
    const pane = box(gw, 2.44, gd, glassMat, [gx, 1.69, gz], { cast: false, receive: false });
    pane.renderOrder = 5;
    cabinetGroup.add(pane);
  }
  // Internal cabinet spotlights
  cabinetSpotA.position.set(0, 2.82, 0);
  cabinetSpotB.position.set(0, 1.98, 0);
  cabinetGroup.add(cabinetSpotA, cabinetSpotB);
  roomGroup.add(cabinetGroup);

  scene.add(roomGroup);

  // =========================================================
  // SLOT ANCHORS & DYNAMIC 3D EXHIBITS
  // =========================================================
  const slotSpecs = {
    'desk-1': { parent: deskGroup, pos: [0.16, 0.9, -1.16], rotY: Math.PI / 2, kind: 'electronics' },
    'desk-2': { parent: deskGroup, pos: [0.16, 0.9, 1.18], rotY: Math.PI / 2 - 0.18, kind: 'electronics' },
    'shelf-1': { parent: shelfGroup, pos: [-0.72, 1.75, 0.04], rotY: 0.1, kind: 'game' },
    'shelf-2': { parent: shelfGroup, pos: [0.72, 0.91, 0.04], rotY: -0.1, kind: 'game' },
    'cabinet-1': { parent: cabinetGroup, pos: [0, 2.08, 0], rotY: 0, kind: 'figure' },
    'cabinet-2': { parent: cabinetGroup, pos: [0, 1.24, 0], rotY: 0, kind: 'figure' },
  };

  const slotAnchors = new Map();
  const slotGroups = new Map();
  const interactiveMeshes = [];
  const exhibitTextures = new Map();
  const gltfLoader = new GLTFLoader();
  const modelVersions = new Map();
  let currentExhibits = new Map();
  let hoveredSlot = null;
  let activeZone = 'all';

  for (const [id, spec] of Object.entries(slotSpecs)) {
    const anchor = new THREE.Group();
    anchor.position.set(...spec.pos);
    anchor.rotation.y = spec.rotY;
    spec.parent.add(anchor);
    slotAnchors.set(id, anchor);
  }

  function makeCoverTexture(imageEl) {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, 512, 512);
    const iw = imageEl.naturalWidth || 512;
    const ih = imageEl.naturalHeight || 512;
    const scale = Math.min(472 / iw, 472 / ih);
    const dw = iw * scale;
    const dh = ih * scale;
    ctx.drawImage(imageEl, (512 - dw) / 2, (512 - dh) / 2, dw, dh);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    tex.needsUpdate = true;
    return tex;
  }

  function applyCoverMaterial(mesh, exhibit, fallbackColor) {
    const mat = new THREE.MeshStandardMaterial({ color: fallbackColor, roughness: 0.32, metalness: 0.08 });
    if (exhibit?.imageEl && exhibit.imageEl.complete && exhibit.imageEl.naturalWidth > 0) {
      try {
        const tex = makeCoverTexture(exhibit.imageEl);
        exhibitTextures.get(mesh.userData.slotId)?.dispose();
        exhibitTextures.set(mesh.userData.slotId, tex);
        mat.map = tex;
        mat.emissiveMap = tex;
        mat.emissive.setHex(0xffffff);
        mat.emissiveIntensity = 0.35;
        mat.color.setHex(0xffffff);
        mat.needsUpdate = true;
      } catch {
        // Ignore CORS-tainted texture upload fallback cleanly.
      }
    }
    mesh.material = mat;
  }

  function disposeObject(root) {
    root.traverse(node => {
      if (node.isMesh) {
        node.geometry?.dispose();
        const mats = Array.isArray(node.material) ? node.material : [node.material];
        for (const mat of mats) {
          if (!mat) continue;
          for (const key of ['map', 'emissiveMap', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap']) {
            mat[key]?.dispose?.();
          }
          mat.dispose();
        }
      }
    });
  }

  function removeInteractiveSlot(id) {
    for (let i = interactiveMeshes.length - 1; i >= 0; i--) {
      if (interactiveMeshes[i].userData.slotId === id) interactiveMeshes.splice(i, 1);
    }
  }

  function normalizeModelToSlot(modelRoot, kind) {
    const limits = {
      electronics: { maxW: 0.5, maxH: 0.48, maxD: 0.44, baseY: 0.04 },
      game: { maxW: 0.46, maxH: 0.54, maxD: 0.36, baseY: 0.04 },
      figure: { maxW: 0.58, maxH: 0.68, maxD: 0.52, baseY: 0.1 },
    }[kind];
    modelRoot.updateMatrixWorld(true);
    const box3 = new THREE.Box3().setFromObject(modelRoot);
    const wrapper = new THREE.Group();
    if (box3.isEmpty()) {
      wrapper.add(modelRoot);
      return wrapper;
    }
    const size = box3.getSize(new THREE.Vector3());
    const center = box3.getCenter(new THREE.Vector3());
    const maxAxis = Math.max(size.x || 1, size.y || 1, size.z || 1);
    const scale = Math.min(
      limits.maxW / Math.max(size.x, 0.001),
      limits.maxH / Math.max(size.y, 0.001),
      limits.maxD / Math.max(size.z, 0.001),
      1 / Math.max(maxAxis * 0.01, 0.001),
    );
    modelRoot.scale.setScalar(scale);
    modelRoot.position.set(-center.x * scale, limits.baseY - box3.min.y * scale, -center.z * scale);
    wrapper.add(modelRoot);
    return wrapper;
  }

  async function loadGlbIntoSlot(id, group, exhibit, fallbackDisplay, version) {
    try {
      const response = await fetch(exhibit.modelUrl, {
        credentials: exhibit.modelCredentials ?? 'omit',
        referrerPolicy: 'no-referrer',
        signal: AbortSignal.timeout(20000),
      });
      if (!response.ok) throw new Error('Model fetch failed');
      const buffer = await response.arrayBuffer();
      if (modelVersions.get(id) !== version) return;
      const gltf = await new Promise((resolve, reject) => gltfLoader.parse(buffer, '', resolve, reject));
      if (modelVersions.get(id) !== version) {
        disposeObject(gltf.scene);
        return;
      }
      const spec = slotSpecs[id];
      const wrapped = normalizeModelToSlot(gltf.scene, spec.kind);
      let hasMesh = false;
      wrapped.traverse(node => {
        if (node.isMesh) {
          hasMesh = true;
          node.castShadow = true;
          node.receiveShadow = true;
          node.userData.slotId = id;
        }
      });
      if (hasMesh) {
        if (fallbackDisplay) {
          for (const node of fallbackDisplay) node.visible = false;
        }
        removeInteractiveSlot(id);
        wrapped.traverse(node => {
          if (node.isMesh) interactiveMeshes.push(node);
        });
      }
      group.add(wrapped);
      renderer.shadowMap.needsUpdate = true;
      markActive();
    } catch {
      // Keep the 2D cover standee fallback visible if model fails to load.
    }
  }

  function buildSlotContent(id, exhibit) {
    const anchor = slotAnchors.get(id);
    const version = (modelVersions.get(id) ?? 0) + 1;
    modelVersions.set(id, version);
    const prev = slotGroups.get(id);
    if (prev) {
      anchor.remove(prev);
      disposeObject(prev);
    }
    removeInteractiveSlot(id);

    const group = new THREE.Group();
    const spec = slotSpecs[id];

    // Base pedestal / placement pad
    const ringMat = new THREE.MeshStandardMaterial({
      color: exhibit ? 0x34d399 : 0x475569,
      emissive: exhibit ? 0x10b981 : 0x1e293b,
      emissiveIntensity: exhibit ? 0.9 : 0.35,
      roughness: 0.3,
    });
    const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.27, 0.03, 28), ringMat);
    ring.position.y = 0.015;
    ring.receiveShadow = true;
    group.add(ring);
    group.userData.ring = ring;

    if (exhibit) {
      let displayMesh;
      const fallbackNodes = [];
      if (spec.kind === 'electronics') {
        const stand = box(0.46, 0.05, 0.26, matteMetalMat, [0, 0.05, 0]);
        const bezel = box(0.5, 0.38, 0.04, matteMetalMat, [0, 0.28, -0.02]);
        bezel.rotation.x = -0.14;
        displayMesh = new THREE.Mesh(new THREE.PlaneGeometry(0.46, 0.34), new THREE.MeshStandardMaterial({ color: 0x38bdf8 }));
        displayMesh.position.set(0, 0.28, 0.004);
        displayMesh.rotation.x = -0.14;
        group.add(stand, bezel, displayMesh);
        fallbackNodes.push(stand, bezel, displayMesh);
      } else if (spec.kind === 'game') {
        const easel = box(0.36, 0.04, 0.22, brassMat, [0, 0.04, 0]);
        const caseBox = box(0.38, 0.5, 0.05, new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.3, metalness: 0.4 }), [0, 0.29, -0.01]);
        caseBox.rotation.x = -0.12;
        displayMesh = new THREE.Mesh(new THREE.PlaneGeometry(0.35, 0.46), new THREE.MeshStandardMaterial({ color: 0xa78bfa }));
        displayMesh.position.set(0, 0.29, 0.02);
        displayMesh.rotation.x = -0.12;
        group.add(easel, caseBox, displayMesh);
        fallbackNodes.push(easel, caseBox, displayMesh);
      } else {
        // Figure inside illuminated glass cabinet on tiered museum riser
        const riser = new THREE.Mesh(
          new THREE.CylinderGeometry(0.22, 0.25, 0.08, 28),
          new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.25, metalness: 0.7 }),
        );
        riser.position.y = 0.06;
        const frame = box(0.48, 0.58, 0.036, matteMetalMat, [0, 0.41, -0.015]);
        displayMesh = new THREE.Mesh(new THREE.PlaneGeometry(0.44, 0.54), new THREE.MeshStandardMaterial({ color: 0xfbbf24, side: THREE.DoubleSide }));
        displayMesh.position.set(0, 0.41, 0.006);
        group.add(riser, frame, displayMesh);
        fallbackNodes.push(frame, displayMesh);
        group.userData.turntable = true;
      }
      displayMesh.userData.slotId = id;
      applyCoverMaterial(displayMesh, exhibit, spec.kind === 'electronics' ? 0x38bdf8 : spec.kind === 'game' ? 0xa78bfa : 0xfbbf24);
      interactiveMeshes.push(displayMesh);
      if (exhibit.modelUrl) {
        void loadGlbIntoSlot(id, group, exhibit, fallbackNodes, version);
      }
    }

    anchor.add(group);
    slotGroups.set(id, group);
  }

  function setExhibits(slots) {
    currentExhibits = new Map();
    for (const entry of slots) {
      currentExhibits.set(entry.slot, entry.exhibit ?? null);
      buildSlotContent(entry.slot, entry.exhibit ?? null);
    }
    renderer.shadowMap.needsUpdate = true;
    markActive();
  }

  function refreshSlotTexture(slotId, imageEl) {
    const exhibit = currentExhibits.get(slotId);
    if (!exhibit) return;
    exhibit.imageEl = imageEl;
    const mesh = interactiveMeshes.find(item => item.userData.slotId === slotId);
    if (mesh) applyCoverMaterial(mesh, exhibit, 0xffffff);
    markActive();
  }

  // Camera Preset Tweening
  let camAnim = null;
  let needsRender = true;
  let lastRenderTime = 0;
  function markActive() {
    needsRender = true;
  }
  controls.addEventListener('change', markActive);

  function setCameraPreset(name) {
    const preset = PRESETS[name] || PRESETS.overview;
    activeZone = name === 'overview' ? 'all' : name;
    camAnim = {
      startPos: camera.position.clone(),
      endPos: new THREE.Vector3(...preset.position),
      startTarget: controls.target.clone(),
      endTarget: new THREE.Vector3(...preset.target),
      progress: 0,
    };
    markActive();
  }

  function setZoneFocus(zone) {
    activeZone = zone || 'all';
    markActive();
  }

  function setHoveredSlot(slotId) {
    hoveredSlot = slotId;
    markActive();
  }

  function setTheme(name) {
    const theme = THEMES[name] || THEMES.day;
    scene.background.setHex(theme.bg);
    scene.fog.color.setHex(theme.fog);
    ambientLight.color.setHex(theme.ambient[0]);
    ambientLight.intensity = theme.ambient[1];
    hemiLight.color.setHex(theme.hemi[0]);
    hemiLight.groundColor.setHex(theme.hemi[1]);
    hemiLight.intensity = theme.hemi[2];
    keyLight.color.setHex(theme.key[0]);
    keyLight.intensity = theme.key[1];
    keyLight.position.set(...theme.keyPos);
    deskLampLight.color.setHex(theme.deskLamp[0]);
    deskLampLight.intensity = theme.deskLamp[1];
    ledStripMat.color.setHex(theme.shelfLed);
    ledStripMat.emissive.setHex(theme.shelfLed);
    ledStripMat.emissiveIntensity = theme.shelfIntensity;
    accentLedMat.color.setHex(theme.accentGlow);
    accentLedMat.emissive.setHex(theme.accentGlow);
    shelfLight.color.setHex(theme.shelfLed);
    shelfLight.intensity = theme.shelfIntensity;
    cabinetSpotA.color.setHex(theme.cabinetSpot[0]);
    cabinetSpotA.intensity = theme.cabinetSpot[1];
    cabinetSpotB.color.setHex(theme.cabinetSpot[0]);
    cabinetSpotB.intensity = theme.cabinetSpot[1] * 0.65;
    skyMat.map?.dispose();
    skyMat.map = createSkyTexture(theme.skyTop, theme.skyBottom, name === 'night');
    skyMat.needsUpdate = true;
    renderer.shadowMap.needsUpdate = true;
    markActive();
  }

  // Raycasting for 3D exhibit click/hover and active gadgets tooltip
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  const gadgetMeshes = [];
  roomGroup.traverse(node => {
    if (node.isMesh && node.userData.gadget) gadgetMeshes.push(node);
  });
  let pointerDown = null;
  let hoveredGadget = null;

  function hitSlot(clientX, clientY) {
    const rect = renderer.domElement.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);
    const hits = raycaster.intersectObjects(interactiveMeshes, false);
    return hits[0]?.object?.userData?.slotId ?? null;
  }

  function hitGadget(clientX, clientY) {
    const rect = renderer.domElement.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);
    const hits = raycaster.intersectObjects(gadgetMeshes, false);
    return hits[0]?.object?.userData?.gadget ?? null;
  }

  renderer.domElement.addEventListener('pointerdown', event => {
    pointerDown = [event.clientX, event.clientY];
    camAnim = null;
  });
  renderer.domElement.addEventListener('pointermove', event => {
    const slotId = hitSlot(event.clientX, event.clientY);
    const gadget = slotId ? null : hitGadget(event.clientX, event.clientY);
    renderer.domElement.style.cursor = slotId ? 'pointer' : gadget ? 'help' : 'grab';
    if (slotId !== hoveredSlot) {
      hoveredSlot = slotId;
      onHoverSlot?.(slotId);
    }
    if (gadget !== hoveredGadget) {
      hoveredGadget = gadget;
      onHoverGadget?.(gadget);
    }
  });
  renderer.domElement.addEventListener('pointerup', event => {
    if (!pointerDown) return;
    const dist = Math.hypot(event.clientX - pointerDown[0], event.clientY - pointerDown[1]);
    pointerDown = null;
    if (dist < 6) {
      const slotId = hitSlot(event.clientX, event.clientY);
      if (slotId) onSelectSlot?.(slotId);
    }
  });

  // Resize observer
  function resize() {
    const w = Math.max(container.clientWidth, 320);
    const h = Math.max(container.clientHeight, 320);
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    markActive();
  }
  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(container);
  resize();

  // Animation & Projection loop (demand-driven when idle; smooth 30-60fps during interaction/turntable)
  const worldVec = new THREE.Vector3();
  const scaleVec = new THREE.Vector3();
  const clock = new THREE.Clock();
  const lastProjected = {};
  let rafId = 0;

  function tick(now = 0) {
    rafId = requestAnimationFrame(tick);
    const dt = Math.min(clock.getDelta(), 0.05);
    let animating = Boolean(camAnim) || needsRender;

    if (camAnim) {
      camAnim.progress = Math.min(1, camAnim.progress + dt * 2.4);
      const t = 1 - Math.pow(1 - camAnim.progress, 3);
      camera.position.lerpVectors(camAnim.startPos, camAnim.endPos, t);
      controls.target.lerpVectors(camAnim.startTarget, camAnim.endTarget, t);
      if (camAnim.progress >= 1) camAnim = null;
    }

    let hasTurntable = false;
    for (const [id, group] of slotGroups.entries()) {
      const spec = slotSpecs[id];
      const highlight = hoveredSlot === id || (activeZone !== 'all' && activeZone === spec.kind);
      const targetScale = highlight ? 1.09 : 1.0;
      if (Math.abs(group.scale.x - targetScale) > 0.004) {
        group.scale.lerp(scaleVec.set(targetScale, targetScale, targetScale), 0.18);
        animating = true;
      }
      if (group.userData.turntable && currentExhibits.get(id)) {
        hasTurntable = true;
        group.rotation.y = Math.sin(now * 0.0012) * 0.32;
      }
      if (group.userData.ring) {
        group.userData.ring.material.emissiveIntensity = highlight ? 2.1 : currentExhibits.get(id) ? 0.9 : 0.3;
      }
    }

    if (controls.update()) animating = true;
    if (!animating && (!hasTurntable || now - lastRenderTime < 80)) return;
    needsRender = false;
    lastRenderTime = now;
    renderer.render(scene, camera);

    if (onProject) {
      const w = container.clientWidth || 1;
      const h = container.clientHeight || 1;
      const projected = {};
      let changed = false;
      for (const [id, anchor] of slotAnchors.entries()) {
        anchor.getWorldPosition(worldVec);
        worldVec.y += currentExhibits.get(id) ? 0.68 : 0.12;
        worldVec.project(camera);
        const rawX = (worldVec.x * 0.5 + 0.5) * w;
        const rawY = (-worldVec.y * 0.5 + 0.5) * h;
        const px = Math.round(Math.min(w - 92, Math.max(92, rawX)));
        const py = Math.round(Math.min(h - 18, Math.max(48, rawY)));
        const vis = worldVec.z > -1 && worldVec.z < 1 && rawX >= -30 && rawX <= w + 30 && rawY >= -20 && rawY <= h + 30;
        const prev = lastProjected[id];
        if (!prev || prev.x !== px || prev.y !== py || prev.visible !== vis) changed = true;
        lastProjected[id] = projected[id] = { x: px, y: py, visible: vis };
      }
      if (changed) onProject(projected);
    }
  }
  tick();

  return {
    setExhibits,
    refreshSlotTexture,
    setCameraPreset,
    setZoneFocus,
    setHoveredSlot,
    setTheme,
    dispose() {
      cancelAnimationFrame(rafId);
      resizeObserver.disconnect();
      controls.dispose();
      for (const tex of textures) tex.dispose();
      for (const tex of exhibitTextures.values()) tex.dispose();
      activeGadgets.dispose();
      skyMat.map?.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}
