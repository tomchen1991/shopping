import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { buildActiveGadgets } from './gadgets-3d.js';
import { buildDeskAccessories, buildRoomDecor, buildStudioChair, buildStudioSpeakers, buildWindowAndExterior, setPropsFastMode } from './room-props-3d.js';
import { SURFACES, checkSurfacePlacement, surfaceLocalToNorm, surfaceNormToLocal } from './room-surfaces.js';

const PRESETS = {
  overview: { position: [5.95, 4.7, 6.75], target: [0.05, 1.32, -0.5] },
  electronics: { position: [1.55, 2.38, 3.15], target: [-1.95, 1.18, 0.72] },
  game: { position: [-0.55, 1.98, 2.65], target: [-0.55, 1.48, -2.5] },
  figure: { position: [0.45, 2.08, 2.38], target: [2.32, 1.62, -1.5] },
};

const THEMES = {
  day: {
    bg: 0x0e1520,
    fog: 0x0e1520,
    envIntensity: 0.42,
    ambient: [0xfff4e0, 0.82],
    hemi: [0xdbeafe, 0x4b382a, 0.82],
    key: [0xffe7c2, 2.3],
    keyPos: [-7.2, 6.6, 3.4],
    rim: [0x7dd3fc, 0.55],
    deskLamp: [0xffb86b, 2.4],
    shelfLed: 0xf59e0b,
    shelfIntensity: 2.1,
    cabinetSpot: [0xfff3d6, 2.2],
    accentGlow: 0x38bdf8,
    bloom: { strength: 0.18, radius: 0.38, threshold: 1.08 },
    moteColor: 0xffe4b5,
  },
  night: {
    bg: 0x060913,
    fog: 0x060913,
    envIntensity: 0.24,
    ambient: [0x4c5f8a, 0.48],
    hemi: [0x1e293b, 0x0f172a, 0.55],
    key: [0x7dd3fc, 0.9],
    keyPos: [-6.5, 5.5, 2.5],
    rim: [0xa78bfa, 0.78],
    deskLamp: [0xff9e44, 3.0],
    shelfLed: 0x22d3ee,
    shelfIntensity: 2.8,
    cabinetSpot: [0xe0f2fe, 2.7],
    accentGlow: 0x22d3ee,
    bloom: { strength: 0.34, radius: 0.48, threshold: 0.96 },
    moteColor: 0x67e8f9,
  },
  gallery: {
    bg: 0x08080b,
    fog: 0x08080b,
    envIntensity: 0.32,
    ambient: [0x9ca3af, 0.34],
    hemi: [0x334155, 0x111827, 0.38],
    key: [0xfef3c7, 1.2],
    keyPos: [2.6, 7.6, 4.4],
    rim: [0xfde68a, 0.5],
    deskLamp: [0xfde68a, 3.1],
    shelfLed: 0xfbbf24,
    shelfIntensity: 2.4,
    cabinetSpot: [0xffffff, 3.1],
    accentGlow: 0xf59e0b,
    bloom: { strength: 0.22, radius: 0.42, threshold: 1.02 },
    moteColor: 0xfef08a,
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
    ctx.fillStyle = '#3d281b';
    ctx.fillRect(0, 0, w, h);
    const rows = 8;
    const rh = h / rows;
    for (let r = 0; r < rows; r++) {
      const shade = 48 + ((r * 13) % 18);
      ctx.fillStyle = `rgb(${shade + 22}, ${shade - 2}, ${shade - 16})`;
      ctx.fillRect(0, r * rh + 1, w, rh - 2);
      ctx.fillStyle = 'rgba(0, 0, 0, 0.32)';
      ctx.fillRect(0, (r + 1) * rh - 2, w, 2);
      const splitX = ((r * 173 + 90) % (w - 80)) + 40;
      ctx.fillRect(splitX, r * rh, 2, rh);
      ctx.strokeStyle = 'rgba(255, 225, 190, 0.055)';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      for (let g = 0; g < 7; g++) {
        const gy = r * rh + 6 + g * (rh / 8);
        ctx.moveTo(0, gy);
        ctx.bezierCurveTo(w * 0.33, gy + ((g % 2) ? 3 : -3), w * 0.66, gy + ((g % 2) ? -2 : 2), w, gy);
      }
      ctx.stroke();
    }
  }, { repeat: [3, 3] });
}

function createWallTexture() {
  return makeCanvasTexture(256, 256, (ctx, w, h) => {
    ctx.fillStyle = '#1b2330';
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 900; i++) {
      const x = (i * 73) % w;
      const y = (i * 137) % h;
      ctx.fillStyle = i % 2 === 0 ? 'rgba(255,255,255,0.018)' : 'rgba(0,0,0,0.03)';
      ctx.fillRect(x, y, 2, 2);
    }
  }, { repeat: [4, 2] });
}

function createRugTexture() {
  return makeCanvasTexture(512, 512, (ctx, w, h) => {
    ctx.fillStyle = '#1e2834';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(255,255,255,0.022)';
    for (let y = 0; y < h; y += 4) ctx.fillRect(0, y, w, 1);
    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 16;
    ctx.strokeRect(20, 20, w - 40, h - 40);
    ctx.strokeStyle = '#c59b6d';
    ctx.lineWidth = 3;
    ctx.strokeRect(44, 44, w - 88, h - 88);
    ctx.strokeStyle = 'rgba(212, 175, 122, 0.25)';
    ctx.lineWidth = 2;
    for (let i = -w; i < w * 2; i += 44) {
      ctx.beginPath();
      ctx.moveTo(i, 52);
      ctx.lineTo(i + h * 0.38, h - 52);
      ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(212, 175, 122, 0.38)';
    ctx.beginPath();
    ctx.moveTo(w / 2, 110);
    ctx.lineTo(w - 110, h / 2);
    ctx.lineTo(w / 2, h - 110);
    ctx.lineTo(110, h / 2);
    ctx.closePath();
    ctx.stroke();
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
    ctx.fillStyle = 'rgba(15, 23, 42, 0.55)';
    ctx.fillRect(24, 24, 198, 208);
    ctx.fillRect(236, 24, 252, 96);
    ctx.fillRect(236, 134, 252, 98);
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.35)';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(24, 24, 198, 208);
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 3;
    ctx.beginPath();
    for (let x = 40; x < 208; x += 6) {
      const y = 148 + Math.sin(x * 0.08) * 32 + Math.cos(x * 0.03) * 14;
      if (x === 40) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.fillStyle = '#e2e8f0';
    ctx.font = '600 16px system-ui';
    ctx.fillText("COLLECTOR'S STUDIO OS", 252, 60);
    ctx.fillStyle = '#67e8f9';
    ctx.font = '12px monospace';
    ctx.fillText('3D DIORAMA // LIVE SYNC', 252, 84);
    ctx.fillStyle = '#34d399';
    for (let i = 0; i < 6; i++) {
      const bh = 22 + ((i * 19) % 42);
      ctx.fillRect(256 + i * 36, 212 - bh, 22, bh);
    }
  });
}

function createSurfaceGridTexture() {
  return makeCanvasTexture(256, 256, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(56, 189, 248, 0.14)';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = 'rgba(125, 211, 252, 0.45)';
    ctx.lineWidth = 3;
    ctx.strokeRect(4, 4, w - 8, h - 8);
    ctx.strokeStyle = 'rgba(125, 211, 252, 0.2)';
    ctx.lineWidth = 1;
    for (let i = 32; i < w; i += 32) {
      ctx.beginPath();
      ctx.moveTo(i, 0);
      ctx.lineTo(i, h);
      ctx.moveTo(0, i);
      ctx.lineTo(w, i);
      ctx.stroke();
    }
  });
}

function createParticleTexture() {
  return makeCanvasTexture(64, 64, (ctx, w, h) => {
    const grad = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    grad.addColorStop(0, 'rgba(255, 255, 255, 1)');
    grad.addColorStop(0.4, 'rgba(255, 255, 255, 0.55)');
    grad.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
  });
}

let useSimpleShellBoxes = false;

function box(w, h, d, material, pos = [0, 0, 0], { cast = true, receive = true, radius = 0 } = {}) {
  const geo = !useSimpleShellBoxes && radius > 0 ? new RoundedBoxGeometry(w, h, d, 1, radius) : new THREE.BoxGeometry(w, h, d);
  const mesh = new THREE.Mesh(geo, material);
  mesh.position.set(...pos);
  mesh.castShadow = cast;
  mesh.receiveShadow = receive;
  return mesh;
}

export function createRoomStage(container, {
  onSelectPlacement,
  onCommitPlacement,
  onSelectGadget,
  onHoverPlacement,
  onHoverGadget,
  onProject,
  onAutoOrbitChange,
} = {}) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  const gl = renderer.getContext();
  const debugInfo = gl?.getExtension?.('WEBGL_debug_renderer_info');
  const gpuName = debugInfo ? gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) : gl?.getParameter?.(gl.RENDERER) || '';
  const isSoftwareGpu = /swiftshader|llvmpipe|software/i.test(String(gpuName));
  useSimpleShellBoxes = isSoftwareGpu;
  setPropsFastMode(isSoftwareGpu);

  const pixelRatio = Math.min(window.devicePixelRatio || 1, isSoftwareGpu ? 1 : 1.5);
  renderer.setPixelRatio(pixelRatio);
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
  scene.fog = new THREE.FogExp2(THEMES.day.fog, 0.022);

  let envRT = null;
  if (!isSoftwareGpu) {
    try {
      const pmrem = new THREE.PMREMGenerator(renderer);
      envRT = pmrem.fromScene(new RoomEnvironment(), 0.04);
      scene.environment = envRT.texture;
      scene.environmentIntensity = THEMES.day.envIntensity;
      pmrem.dispose();
    } catch {
      // Continue cleanly if PMREM unsupported
    }
  }

  const camera = new THREE.PerspectiveCamera(37, 16 / 10, 0.1, 60);
  camera.position.set(...PRESETS.overview.position);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.07;
  controls.target.set(...PRESETS.overview.target);
  controls.minDistance = 0.52;
  controls.maxDistance = 12.8;
  controls.minPolarAngle = 0.25;
  controls.maxPolarAngle = Math.PI * 0.47;
  controls.autoRotate = false;
  controls.autoRotateSpeed = 0.6;
  controls.update();

  let composer = null;
  let bloomPass = null;
  if (!isSoftwareGpu) {
    try {
      const initW = Math.max(container.clientWidth, 320);
      const initH = Math.max(container.clientHeight, 320);
      composer = new EffectComposer(renderer);
      composer.setPixelRatio(pixelRatio);
      composer.setSize(initW, initH);
      composer.addPass(new RenderPass(scene, camera));
      bloomPass = new UnrealBloomPass(
        new THREE.Vector2(initW, initH),
        THEMES.day.bloom.strength,
        THEMES.day.bloom.radius,
        THEMES.day.bloom.threshold,
      );
      composer.addPass(bloomPass);
      composer.addPass(new OutputPass());
    } catch {
      composer = null;
    }
  }

  // Lighting
  const ambientLight = new THREE.AmbientLight(...THEMES.day.ambient);
  const hemiLight = new THREE.HemisphereLight(...THEMES.day.hemi);
  const keyLight = new THREE.DirectionalLight(...THEMES.day.key);
  keyLight.position.set(...THEMES.day.keyPos);
  keyLight.castShadow = true;
  keyLight.shadow.mapSize.set(isSoftwareGpu ? 512 : 2048, isSoftwareGpu ? 512 : 2048);
  keyLight.shadow.camera.near = 1;
  keyLight.shadow.camera.far = 22;
  keyLight.shadow.camera.left = -5.6;
  keyLight.shadow.camera.right = 5.6;
  keyLight.shadow.camera.top = 5.6;
  keyLight.shadow.camera.bottom = -5.6;
  keyLight.shadow.bias = -0.00035;
  keyLight.shadow.normalBias = 0.02;

  const rimLight = new THREE.DirectionalLight(...THEMES.day.rim);
  rimLight.position.set(5.8, 4.2, 5.2);

  const deskLampLight = new THREE.PointLight(0xffb86b, 2.5, 5.8, 1.5);
  deskLampLight.position.set(-2.22, 1.48, -0.05);

  const cabinetSpotA = new THREE.PointLight(0xfff3d6, 2.2, 3.6, 2.0);
  const cabinetSpotB = new THREE.PointLight(0xfff3d6, 1.5, 3.0, 2.0);
  const shelfLight = new THREE.PointLight(0xf59e0b, 1.6, 6.2, 1.4);
  shelfLight.position.set(-0.55, 2.05, -1.75);

  scene.add(ambientLight, hemiLight, keyLight, rimLight, deskLampLight, shelfLight);

  // Materials
  const woodTex = createWoodTexture();
  const wallTex = createWallTexture();
  const rugTex = createRugTexture();
  const monitorTex = createMonitorTexture();
  const surfaceGridTex = createSurfaceGridTexture();
  const moteTex = createParticleTexture();
  const textures = [woodTex, wallTex, rugTex, monitorTex, surfaceGridTex, moteTex];

  const floorMat = new THREE.MeshStandardMaterial({ map: woodTex, roughness: 0.64, metalness: 0.06 });
  const plinthMat = new THREE.MeshStandardMaterial({ color: 0x151a22, roughness: 0.78, metalness: 0.25 });
  const wallMat = new THREE.MeshStandardMaterial({ map: wallTex, roughness: 0.88, metalness: 0.05 });
  const trimMat = new THREE.MeshStandardMaterial({ color: 0x11161f, roughness: 0.55, metalness: 0.35 });
  const walnutMat = new THREE.MeshStandardMaterial({ color: 0x5f3c25, roughness: 0.48, metalness: 0.08 });
  const darkOakMat = new THREE.MeshStandardMaterial({ color: 0x241c17, roughness: 0.58, metalness: 0.1 });
  const matteMetalMat = new THREE.MeshStandardMaterial({ color: 0x161b22, roughness: 0.38, metalness: 0.75 });
  const chromeMat = new THREE.MeshStandardMaterial({ color: 0xcbd5e1, roughness: 0.22, metalness: 0.88 });
  const brassMat = new THREE.MeshStandardMaterial({ color: 0xd9a75a, roughness: 0.26, metalness: 0.88 });
  const ledStripMat = new THREE.MeshStandardMaterial({
    color: 0xfbbf24, emissive: 0xf59e0b, emissiveIntensity: 2.2, roughness: 0.2,
  });
  const accentLedMat = new THREE.MeshStandardMaterial({
    color: 0x38bdf8, emissive: 0x38bdf8, emissiveIntensity: 2.0, roughness: 0.2,
  });
  const glassMat = new THREE.MeshStandardMaterial({
    color: 0xcbe7ff, transparent: true, opacity: 0.036, roughness: 0.08, metalness: 0.1,
    envMapIntensity: 0.12, depthWrite: false, side: THREE.DoubleSide,
  });
  const shelfGlassMat = new THREE.MeshStandardMaterial({
    color: 0xe0f2fe, transparent: true, opacity: 0.16, roughness: 0.08, metalness: 0.12,
    envMapIntensity: 0.22, depthWrite: false, side: THREE.DoubleSide,
  });

  const propMats = {
    walnut: walnutMat,
    darkOak: darkOakMat,
    matteMetal: matteMetalMat,
    chrome: chromeMat,
    brass: brassMat,
    trim: trimMat,
    glass: glassMat,
  };

  // Architectural Room Shell (8.2m x 6.8m)
  const roomGroup = new THREE.Group();
  roomGroup.add(box(8.1, 0.28, 6.9, plinthMat, [0.15, -0.15, 0], { cast: false, radius: 0.03 }));
  roomGroup.add(box(8.14, 0.025, 6.94, brassMat, [0.15, -0.025, 0], { cast: false, radius: 0.008 }));
  roomGroup.add(box(7.8, 0.04, 6.6, floorMat, [0.15, -0.005, 0], { cast: false }));

  const rugGroup = new THREE.Group();
  rugGroup.position.set(0.15, 0.015, 0.72);
  rugGroup.add(box(3.1, 0.02, 3.35, new THREE.MeshStandardMaterial({ map: rugTex, roughness: 0.95 }), [0, 0, 0], { cast: false, radius: 0.008 }));
  roomGroup.add(rugGroup);

  // Back Wall (z = -3.3) & Walnut Acoustic Slats
  roomGroup.add(box(7.98, 3.92, 0.18, wallMat, [0.15, 1.96, -3.39]));
  roomGroup.add(box(7.8, 0.14, 0.05, trimMat, [0.15, 0.07, -3.28]));
  for (let i = 0; i < 18; i++) {
    roomGroup.add(box(0.075, 3.66, 0.055, walnutMat, [1.22 + i * 0.145, 1.92, -3.27], { radius: 0.008 }));
  }
  roomGroup.add(box(7.4, 0.035, 0.035, ledStripMat, [0.15, 3.78, -3.28], { cast: false }));

  // Left Wall (x = -3.75) with Cutout Panoramic Window
  roomGroup.add(box(0.18, 3.92, 1.6, wallMat, [-3.84, 1.96, -2.6]));
  roomGroup.add(box(0.18, 3.92, 2.3, wallMat, [-3.84, 1.96, 2.15]));
  roomGroup.add(box(0.18, 1.1, 2.8, wallMat, [-3.84, 0.55, -0.4]));
  roomGroup.add(box(0.18, 0.86, 2.8, wallMat, [-3.84, 3.49, -0.4]));
  roomGroup.add(box(0.18, 0.14, 6.6, trimMat, [-3.73, 0.07, 0]));

  const exterior = buildWindowAndExterior(roomGroup, propMats);

  // =========================================================
  // ZONE 1: STUDIO ELECTRONICS DESK (Surface: desk-main)
  // =========================================================
  const deskGroup = new THREE.Group();
  deskGroup.position.set(-2.15, 0, 0.72);
  deskGroup.add(box(1.44, 0.08, 3.7, walnutMat, [0, 0.86, 0], { radius: 0.018 }));
  for (const [lx, lz] of [[-0.58, -1.66], [0.58, -1.66], [-0.58, 1.66], [0.58, 1.66]]) {
    deskGroup.add(box(0.065, 0.84, 0.065, matteMetalMat, [lx, 0.42, lz], { radius: 0.01 }));
  }
  deskGroup.add(box(0.04, 0.04, 3.3, matteMetalMat, [-0.58, 0.24, 0], { radius: 0.008 }));
  deskGroup.add(box(0.04, 0.03, 3.42, accentLedMat, [-0.66, 0.81, 0], { cast: false }));
  // Felt desk mat
  deskGroup.add(box(0.56, 0.014, 1.24, new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.92 }), [0.14, 0.905, -0.05], { radius: 0.005 }));

  // Studio Monitor (clickable & zoomable screen)
  const monitorGroup = new THREE.Group();
  monitorGroup.add(box(0.18, 0.025, 0.28, chromeMat, [-0.46, 0.912, -0.05], { radius: 0.006 }));
  monitorGroup.add(box(0.055, 0.48, 0.075, matteMetalMat, [-0.5, 1.14, -0.05], { radius: 0.01 }));
  monitorGroup.add(box(0.055, 0.56, 1.14, matteMetalMat, [-0.4, 1.46, -0.05], { radius: 0.012 }));
  const screenMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(1.06, 0.49),
    new THREE.MeshBasicMaterial({ map: monitorTex }),
  );
  screenMesh.rotation.y = Math.PI / 2;
  screenMesh.position.set(-0.368, 1.46, -0.05);
  monitorGroup.add(screenMesh);
  const monitorInfo = {
    name: 'Studio 34" 超宽屏显示器',
    period: '桌面核心屏幕',
    category: '主显示器',
    note: '展示桌搭系统状态与音频波形，点击可单独放大赏析',
  };
  monitorGroup.userData.gadgetRoot = monitorGroup;
  monitorGroup.userData.gadgetInfo = monitorInfo;
  monitorGroup.userData.gadgetFocus = { offset: [-0.36, 1.46, -0.05], forward: [1, 0.06, 0], distance: 1.25 };
  monitorGroup.traverse(node => {
    if (node.isMesh) {
      node.userData.gadget = monitorInfo;
      node.userData.gadgetRoot = monitorGroup;
    }
  });
  deskGroup.add(monitorGroup);

  // Architect Desk Lamp
  deskGroup.add(box(0.18, 0.03, 0.18, matteMetalMat, [-0.42, 0.915, -1.58], { radius: 0.01 }));
  deskGroup.add(box(0.03, 0.56, 0.03, brassMat, [-0.42, 1.18, -1.58], { radius: 0.008 }));
  deskGroup.add(box(0.25, 0.06, 0.12, matteMetalMat, [-0.28, 1.48, -1.56], { radius: 0.014 }));
  deskGroup.add(box(0.18, 0.02, 0.08, ledStripMat, [-0.28, 1.445, -1.56], { cast: false }));

  buildStudioSpeakers(deskGroup, propMats);
  buildDeskAccessories(deskGroup, propMats);
  roomGroup.add(deskGroup);
  roomGroup.add(buildStudioChair(propMats));

  // =========================================================
  // ZONE 2: ILLUMINATED GAME DISPLAY CABINET (Surfaces: game-upper, game-lower)
  // =========================================================
  const gameCabinetGroup = new THREE.Group();
  gameCabinetGroup.position.set(-0.55, 0, -2.54);
  gameCabinetGroup.add(box(2.98, 0.14, 0.72, matteMetalMat, [0, 0.07, 0], { radius: 0.016 }));
  gameCabinetGroup.add(box(2.9, 0.02, 0.03, accentLedMat, [0, 0.142, 0.345], { cast: false }));
  gameCabinetGroup.add(box(2.92, 2.98, 0.06, darkOakMat, [0, 1.63, -0.31]));
  for (const sx of [-1.43, 1.43]) {
    gameCabinetGroup.add(box(0.07, 2.98, 0.64, walnutMat, [sx, 1.63, 0], { radius: 0.01 }));
  }
  // Bottom Console Deck (0.17), Middle Game Tier (0.99 -> top 1.02), Upper Game Tier (1.91 -> top 1.94), Top Crown (3.08)
  for (const sy of [0.17, 0.99, 1.91, 3.08]) {
    gameCabinetGroup.add(box(2.92, 0.06, 0.64, walnutMat, [0, sy, 0], { radius: 0.01 }));
  }
  for (const gx of [-1.4, 1.4]) {
    gameCabinetGroup.add(box(0.03, 2.9, 0.03, matteMetalMat, [gx, 1.63, 0.315]));
  }
  const gameGlassPane = box(2.74, 2.86, 0.016, glassMat, [0, 1.63, 0.315], { cast: false, receive: false });
  gameGlassPane.renderOrder = 4;
  gameCabinetGroup.add(gameGlassPane);

  for (const ly of [0.95, 1.87, 3.04]) {
    gameCabinetGroup.add(box(2.68, 0.018, 0.035, ledStripMat, [0, ly, 0.18], { cast: false }));
  }
  const activeGadgets = buildActiveGadgets(deskGroup, gameCabinetGroup, { fast: isSoftwareGpu });
  const roomDecor = buildRoomDecor(roomGroup, gameCabinetGroup, propMats);
  roomGroup.add(gameCabinetGroup);

  // =========================================================
  // ZONE 3: MUSEUM PANORAMIC GLASS FIGURE CABINET (Surfaces: figure-upper, figure-lower)
  // =========================================================
  const cabinetGroup = new THREE.Group();
  cabinetGroup.position.set(2.34, 0, -1.52);
  cabinetGroup.rotation.y = -0.28;
  cabinetGroup.add(box(2.08, 0.44, 1.08, matteMetalMat, [0, 0.22, 0], { radius: 0.02 }));
  cabinetGroup.add(box(2.12, 0.04, 1.12, brassMat, [0, 0.45, 0], { radius: 0.01 }));
  cabinetGroup.add(box(0.52, 0.1, 0.02, brassMat, [0, 0.24, 0.542], { radius: 0.005 }));
  cabinetGroup.add(box(2.08, 0.16, 1.08, matteMetalMat, [0, 3.04, 0], { radius: 0.02 }));
  cabinetGroup.add(box(1.56, 0.03, 0.72, ledStripMat, [0, 2.95, 0], { cast: false }));
  for (const [cx, cz] of [[-1.0, -0.5], [1.0, -0.5], [-1.0, 0.5], [1.0, 0.5]]) {
    cabinetGroup.add(box(0.055, 2.52, 0.055, matteMetalMat, [cx, 1.72, cz], { radius: 0.01 }));
  }
  // Two wide glass display shelves matching SURFACES figure-lower (y=1.20) & figure-upper (y=2.08)
  for (const sy of [1.185, 2.065]) {
    const shelfPane = box(1.94, 0.03, 0.94, shelfGlassMat, [0, sy, 0], { cast: false, receive: false });
    shelfPane.renderOrder = 3;
    cabinetGroup.add(shelfPane);
  }
  for (const [gw, gd, gx, gz] of [
    [1.96, 0.02, 0, 0.51],
    [1.96, 0.02, 0, -0.51],
    [0.02, 0.98, -1.01, 0],
    [0.02, 0.98, 1.01, 0],
  ]) {
    const pane = box(gw, 2.5, gd, glassMat, [gx, 1.72, gz], { cast: false, receive: false });
    pane.renderOrder = 5;
    cabinetGroup.add(pane);
  }
  cabinetSpotA.position.set(0, 2.86, 0);
  cabinetSpotB.position.set(0, 1.98, 0);
  cabinetGroup.add(cabinetSpotA, cabinetSpotB);
  roomGroup.add(cabinetGroup);

  // Floating Ambient Dust Motes
  const moteCount = 60;
  const motePositions = new Float32Array(moteCount * 3);
  const moteSeeds = new Float32Array(moteCount * 2);
  for (let i = 0; i < moteCount; i++) {
    motePositions[i * 3] = ((i * 37) % 100) / 100 * 6.8 - 3.2;
    motePositions[i * 3 + 1] = 0.4 + ((i * 53) % 100) / 100 * 2.8;
    motePositions[i * 3 + 2] = ((i * 71) % 100) / 100 * 5.8 - 2.8;
    moteSeeds[i * 2] = i * 0.7;
    moteSeeds[i * 2 + 1] = 0.18 + (i % 5) * 0.05;
  }
  const moteGeo = new THREE.BufferGeometry();
  moteGeo.setAttribute('position', new THREE.BufferAttribute(motePositions, 3));
  const moteMat = new THREE.PointsMaterial({
    map: moteTex,
    color: THEMES.day.moteColor,
    size: 0.065,
    transparent: true,
    opacity: 0.4,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  roomGroup.add(new THREE.Points(moteGeo, moteMat));
  scene.add(roomGroup);

  // =========================================================
  // DISPLAY SURFACE PLANES + CURATOR GHOST PREVIEW
  // =========================================================
  const surfaceParents = {
    'desk-main': deskGroup,
    'game-upper': gameCabinetGroup,
    'game-lower': gameCabinetGroup,
    'figure-upper': cabinetGroup,
    'figure-lower': cabinetGroup,
  };

  const surfaceMeshes = [];
  const surfaceHighlights = new Map();

  for (const [id, spec] of Object.entries(SURFACES)) {
    const parent = surfaceParents[id];
    const w = spec.bounds.xMax - spec.bounds.xMin;
    const d = spec.bounds.zMax - spec.bounds.zMin;
    const cx = (spec.bounds.xMin + spec.bounds.xMax) / 2;
    const cz = (spec.bounds.zMin + spec.bounds.zMax) / 2;

    const planeMat = new THREE.MeshBasicMaterial({
      map: surfaceGridTex,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(w, d), planeMat);
    plane.rotation.x = -Math.PI / 2;
    plane.position.set(cx, spec.bounds.y + 0.004, cz);
    plane.userData.surfaceId = id;
    plane.userData.category = spec.category;
    plane.renderOrder = 6;
    parent.add(plane);
    surfaceMeshes.push(plane);
    surfaceHighlights.set(id, plane);
  }

  // Ghost placement indicator ring
  const ghostGroup = new THREE.Group();
  ghostGroup.visible = false;
  const ghostMat = new THREE.MeshBasicMaterial({ color: 0x34d399, transparent: true, opacity: 0.85, side: THREE.DoubleSide });
  const ghostFillMat = new THREE.MeshBasicMaterial({ color: 0x34d399, transparent: true, opacity: 0.2, side: THREE.DoubleSide, depthWrite: false });
  const ghostRing = new THREE.Mesh(new THREE.RingGeometry(0.2, 0.24, 36), ghostMat);
  ghostRing.rotation.x = -Math.PI / 2;
  const ghostDisc = new THREE.Mesh(new THREE.CircleGeometry(0.2, 32), ghostFillMat);
  ghostDisc.rotation.x = -Math.PI / 2;
  ghostGroup.add(ghostDisc, ghostRing);
  ghostGroup.renderOrder = 8;
  scene.add(ghostGroup);

  function setHighlightedCategory(category) {
    for (const [id, plane] of surfaceHighlights.entries()) {
      const active = Boolean(category) && SURFACES[id].category === category;
      plane.material.opacity = active ? 0.85 : 0;
    }
    markActive();
  }

  function showGhost(surfaceId, nx, nz, ok = true, scale = 1) {
    const parent = surfaceParents[surfaceId];
    if (!parent) {
      ghostGroup.visible = false;
      return;
    }
    parent.updateMatrixWorld(true);
    const [lx, ly, lz] = surfaceNormToLocal(surfaceId, nx, nz);
    const worldPos = new THREE.Vector3(lx, ly + 0.012, lz).applyMatrix4(parent.matrixWorld);
    ghostGroup.position.copy(worldPos);
    ghostGroup.scale.setScalar(scale);
    ghostMat.color.setHex(ok ? 0x34d399 : 0xf43f5e);
    ghostFillMat.color.setHex(ok ? 0x10b981 : 0xf43f5e);
    ghostGroup.visible = true;
    markActive();
  }

  function hideGhost() {
    ghostGroup.visible = false;
    markActive();
  }

  // =========================================================
  // DYNAMIC PLACEMENT EXHIBITS
  // =========================================================
  const placementGroups = new Map();
  const interactiveMeshes = [];
  const exhibitTextures = new Map();
  const gltfLoader = new GLTFLoader();
  const modelVersions = new Map();
  let currentPlacements = [];
  let hoveredId = null;
  let selectedId = null;
  let curatorMode = false;
  let activeZone = 'all';

  function makeCoverTexture(imageEl) {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, 512, 512);
    const iw = imageEl.naturalWidth || 512;
    const ih = imageEl.naturalHeight || 512;
    const scale = Math.min(488 / iw, 488 / ih);
    const dw = iw * scale;
    const dh = ih * scale;
    ctx.drawImage(imageEl, (512 - dw) / 2, (512 - dh) / 2, dw, dh);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    tex.needsUpdate = true;
    return tex;
  }

  function applyCoverMaterial(mesh, item, fallbackColor) {
    const mat = new THREE.MeshStandardMaterial({ color: fallbackColor, roughness: 0.4, metalness: 0.05 });
    if (item?.imageEl && item.imageEl.complete && item.imageEl.naturalWidth > 0) {
      try {
        const tex = makeCoverTexture(item.imageEl);
        exhibitTextures.get(item.holdingId)?.dispose();
        exhibitTextures.set(item.holdingId, tex);
        mat.map = tex;
        mat.emissiveMap = tex;
        mat.emissive.setHex(0xffffff);
        mat.emissiveIntensity = 0.16;
        mat.color.setHex(0xffffff);
        mat.needsUpdate = true;
      } catch {
        // Ignore CORS fallback
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

  function removeInteractiveId(holdingId) {
    for (let i = interactiveMeshes.length - 1; i >= 0; i--) {
      if (interactiveMeshes[i].userData.holdingId === holdingId) interactiveMeshes.splice(i, 1);
    }
  }

  function normalizeModelToSurface(modelRoot, category) {
    const limits = {
      electronics: { maxW: 0.46, maxH: 0.44, maxD: 0.42, baseY: 0.025 },
      game: { maxW: 0.42, maxH: 0.5, maxD: 0.34, baseY: 0.025 },
      figure: { maxW: 0.54, maxH: 0.66, maxD: 0.48, baseY: 0.09 },
    }[category];
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

  async function loadGlbIntoPlacement(holdingId, group, item, fallbackNodes, version) {
    try {
      const response = await fetch(item.modelUrl, {
        credentials: item.modelCredentials ?? 'omit',
        referrerPolicy: 'no-referrer',
        signal: AbortSignal.timeout(20000),
      });
      if (!response.ok) throw new Error('Model fetch failed');
      const buffer = await response.arrayBuffer();
      if (modelVersions.get(holdingId) !== version) return;
      const gltf = await new Promise((resolve, reject) => gltfLoader.parse(buffer, '', resolve, reject));
      if (modelVersions.get(holdingId) !== version) {
        disposeObject(gltf.scene);
        return;
      }
      const wrapped = normalizeModelToSurface(gltf.scene, item.category);
      let hasMesh = false;
      wrapped.traverse(node => {
        if (node.isMesh) {
          hasMesh = true;
          node.castShadow = true;
          node.receiveShadow = true;
          node.userData.holdingId = holdingId;
        }
      });
      if (hasMesh) {
        for (const node of fallbackNodes) node.visible = false;
        removeInteractiveId(holdingId);
        wrapped.traverse(node => {
          if (node.isMesh) interactiveMeshes.push(node);
        });
      }
      group.add(wrapped);
      renderer.shadowMap.needsUpdate = true;
      markActive();
    } catch {
      // Keep cover art standee fallback cleanly
    }
  }

  function applyPlacementTransform(group, item) {
    const spec = SURFACES[item.surface];
    if (!spec) return;
    const parent = surfaceParents[item.surface];
    if (group.parent !== parent) {
      group.parent?.remove(group);
      parent.add(group);
    }
    const [lx, ly, lz] = surfaceNormToLocal(item.surface, item.x, item.z);
    group.position.set(lx, ly, lz);
    group.rotation.y = spec.defaultRotY + (item.rotationY || 0);
    group.scale.setScalar(item.scale || 1);
  }

  function buildPlacementNode(item) {
    const holdingId = item.holdingId;
    const version = (modelVersions.get(holdingId) ?? 0) + 1;
    modelVersions.set(holdingId, version);

    const group = new THREE.Group();
    const baseMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.35, metalness: 0.72 });
    const ringMat = new THREE.MeshStandardMaterial({
      color: 0x34d399, emissive: 0x10b981, emissiveIntensity: 0.85, roughness: 0.25,
    });
    const basePad = new THREE.Mesh(new THREE.CylinderGeometry(0.21, 0.23, 0.016, 28), baseMat);
    basePad.position.y = 0.008;
    basePad.receiveShadow = true;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.205, 0.007, 10, 32), ringMat);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.017;
    group.add(basePad, ring);
    group.userData.ring = ring;
    group.userData.holdingId = holdingId;

    let displayMesh;
    const fallbackNodes = [];
    if (item.category === 'electronics') {
      const stand = box(0.42, 0.04, 0.22, matteMetalMat, [0, 0.036, 0], { radius: 0.008 });
      const bezel = box(0.46, 0.35, 0.032, matteMetalMat, [0, 0.255, -0.016], { radius: 0.01 });
      bezel.rotation.x = -0.14;
      displayMesh = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.31), new THREE.MeshStandardMaterial({ color: 0x38bdf8 }));
      displayMesh.position.set(0, 0.255, 0.003);
      displayMesh.rotation.x = -0.14;
      group.add(stand, bezel, displayMesh);
      fallbackNodes.push(stand, bezel, displayMesh);
    } else if (item.category === 'game') {
      const easel = box(0.34, 0.036, 0.2, brassMat, [0, 0.036, 0], { radius: 0.008 });
      const caseBox = box(0.36, 0.48, 0.04, new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.28, metalness: 0.45 }), [0, 0.275, -0.01], { radius: 0.008 });
      caseBox.rotation.x = -0.12;
      displayMesh = new THREE.Mesh(new THREE.PlaneGeometry(0.33, 0.44), new THREE.MeshStandardMaterial({ color: 0xa78bfa }));
      displayMesh.position.set(0, 0.275, 0.014);
      displayMesh.rotation.x = -0.12;
      group.add(easel, caseBox, displayMesh);
      fallbackNodes.push(easel, caseBox, displayMesh);
    } else {
      const riser = new THREE.Mesh(
        new THREE.CylinderGeometry(0.21, 0.235, 0.072, 28),
        new THREE.MeshStandardMaterial({ color: 0x18212f, roughness: 0.22, metalness: 0.78 }),
      );
      riser.position.y = 0.052;
      const brassTrim = new THREE.Mesh(new THREE.TorusGeometry(0.212, 0.008, 10, 28), brassMat);
      brassTrim.rotation.x = Math.PI / 2;
      brassTrim.position.y = 0.088;
      const frame = box(0.45, 0.54, 0.03, matteMetalMat, [0, 0.385, -0.015], { radius: 0.008 });
      displayMesh = new THREE.Mesh(new THREE.PlaneGeometry(0.41, 0.5), new THREE.MeshStandardMaterial({ color: 0xfbbf24, side: THREE.DoubleSide }));
      displayMesh.position.set(0, 0.385, 0.004);
      group.add(riser, brassTrim, frame, displayMesh);
      fallbackNodes.push(frame, displayMesh);
      group.userData.turntable = true;
    }

    // Also allow clicking the pedestal base to select/drag in Curator Mode
    basePad.userData.holdingId = holdingId;
    displayMesh.userData.holdingId = holdingId;
    applyCoverMaterial(displayMesh, item, item.category === 'electronics' ? 0x38bdf8 : item.category === 'game' ? 0xa78bfa : 0xfbbf24);
    interactiveMeshes.push(displayMesh, basePad);

    applyPlacementTransform(group, item);
    if (item.modelUrl) {
      void loadGlbIntoPlacement(holdingId, group, item, fallbackNodes, version);
    }

    return group;
  }

  function setPlacements(items) {
    currentPlacements = items;
    const nextIds = new Set(items.map(i => i.holdingId));

    for (const [id, group] of placementGroups.entries()) {
      if (!nextIds.has(id)) {
        modelVersions.set(id, (modelVersions.get(id) ?? 0) + 1);
        group.parent?.remove(group);
        disposeObject(group);
        removeInteractiveId(id);
        placementGroups.delete(id);
      }
    }

    for (const item of items) {
      const existing = placementGroups.get(item.holdingId);
      if (existing && existing.userData.modelUrl === (item.modelUrl ?? null)) {
        applyPlacementTransform(existing, item);
        if (item.imageEl && !existing.userData.coverApplied) {
          const mesh = interactiveMeshes.find(m => m.userData.holdingId === item.holdingId && m.geometry?.type === 'PlaneGeometry');
          if (mesh) applyCoverMaterial(mesh, item, 0xffffff);
          existing.userData.coverApplied = true;
        }
      } else {
        if (existing) {
          existing.parent?.remove(existing);
          disposeObject(existing);
          removeInteractiveId(item.holdingId);
        }
        const node = buildPlacementNode(item);
        node.userData.modelUrl = item.modelUrl ?? null;
        node.userData.coverApplied = Boolean(item.imageEl?.complete && item.imageEl?.naturalWidth > 0);
        placementGroups.set(item.holdingId, node);
      }
    }

    renderer.shadowMap.needsUpdate = true;
    markActive();
  }

  function previewPlacementTransform(holdingId, nextTransform) {
    const item = currentPlacements.find(p => p.holdingId === holdingId);
    const group = placementGroups.get(holdingId);
    if (!item || !group) return;
    Object.assign(item, nextTransform);
    applyPlacementTransform(group, item);
    markActive();
  }

  function refreshPlacementTexture(holdingId, imageEl) {
    const item = currentPlacements.find(p => p.holdingId === holdingId);
    if (!item) return;
    item.imageEl = imageEl;
    const mesh = interactiveMeshes.find(m => m.userData.holdingId === holdingId && m.geometry?.type === 'PlaneGeometry');
    if (mesh) applyCoverMaterial(mesh, item, 0xffffff);
    const group = placementGroups.get(holdingId);
    if (group) group.userData.coverApplied = true;
    markActive();
  }

  // Camera & Focus helpers
  let camAnim = null;
  let needsRender = true;
  let isVisible = true;
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

  function focusPlacement(holdingId) {
    const group = placementGroups.get(holdingId);
    const item = currentPlacements.find(p => p.holdingId === holdingId);
    if (!group || !item) return;
    group.updateMatrixWorld(true);
    const targetPos = new THREE.Vector3();
    const quat = new THREE.Quaternion();
    group.getWorldPosition(targetPos);
    group.getWorldQuaternion(quat);
    targetPos.y += item.category === 'figure' ? 0.34 : 0.25;
    const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(quat).normalize();
    const dist = item.category === 'figure' ? 1.38 : 1.12;
    const camPos = targetPos.clone().addScaledVector(forward, dist);
    camPos.y += 0.14;
    activeZone = SURFACES[item.surface]?.zone || 'all';
    camAnim = {
      startPos: camera.position.clone(),
      endPos: camPos,
      startTarget: controls.target.clone(),
      endTarget: targetPos,
      progress: 0,
    };
    markActive();
  }

  function focusGadget(gadgetRoot) {
    if (!gadgetRoot) return;
    gadgetRoot.updateMatrixWorld(true);
    const focus = gadgetRoot.userData.gadgetFocus || {};
    const offset = new THREE.Vector3(...(focus.offset || [0, 0.12, 0]));
    const forward = new THREE.Vector3(...(focus.forward || [0, 0.15, 1])).normalize();
    const dist = focus.distance || 0.85;
    const targetPos = offset.clone().applyMatrix4(gadgetRoot.matrixWorld);
    const worldQuat = new THREE.Quaternion();
    gadgetRoot.getWorldQuaternion(worldQuat);
    const worldForward = forward.applyQuaternion(worldQuat).normalize();
    const camPos = targetPos.clone().addScaledVector(worldForward, dist);
    activeZone = 'all';
    camAnim = {
      startPos: camera.position.clone(),
      endPos: camPos,
      startTarget: controls.target.clone(),
      endTarget: targetPos,
      progress: 0,
    };
    markActive();
  }

  function setAutoOrbit(enabled) {
    controls.autoRotate = Boolean(enabled);
    onAutoOrbitChange?.(controls.autoRotate);
    markActive();
  }

  function setCuratorMode(enabled) {
    curatorMode = Boolean(enabled);
    if (!curatorMode) {
      setHighlightedCategory(null);
      hideGhost();
      selectedId = null;
    }
    markActive();
  }

  function setSelectedPlacement(id) {
    selectedId = id;
    markActive();
  }

  function setHoveredPlacement(id) {
    hoveredId = id;
    markActive();
  }

  function setTheme(name) {
    const theme = THEMES[name] || THEMES.day;
    scene.background.setHex(theme.bg);
    scene.fog.color.setHex(theme.fog);
    scene.environmentIntensity = theme.envIntensity;
    ambientLight.color.setHex(theme.ambient[0]);
    ambientLight.intensity = theme.ambient[1];
    hemiLight.color.setHex(theme.hemi[0]);
    hemiLight.groundColor.setHex(theme.hemi[1]);
    hemiLight.intensity = theme.hemi[2];
    keyLight.color.setHex(theme.key[0]);
    keyLight.intensity = theme.key[1];
    keyLight.position.set(...theme.keyPos);
    rimLight.color.setHex(theme.rim[0]);
    rimLight.intensity = theme.rim[1];
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
    moteMat.color.setHex(theme.moteColor);
    if (bloomPass) {
      bloomPass.strength = theme.bloom.strength;
      bloomPass.radius = theme.bloom.radius;
      bloomPass.threshold = theme.bloom.threshold;
    }
    exterior.setTheme(name);
    renderer.shadowMap.needsUpdate = true;
    markActive();
  }

  // Raycasting & Surface Dragging
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  const gadgetMeshes = [];
  roomGroup.traverse(node => {
    if (node.isMesh && node.userData.gadget) gadgetMeshes.push(node);
  });

  let pointerDown = null;
  let hoveredGadget = null;
  let draggingItem = null; // { holdingId, item, orig: { surface, x, z }, lastValid }

  function setRay(clientX, clientY) {
    const rect = renderer.domElement.getBoundingClientRect();
    if (!rect.width || !rect.height) return false;
    pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);
    return true;
  }

  function hitPlacement(clientX, clientY) {
    if (!setRay(clientX, clientY)) return null;
    const hits = raycaster.intersectObjects(interactiveMeshes, false);
    return hits[0]?.object?.userData?.holdingId ?? null;
  }

  function hitGadget(clientX, clientY) {
    if (!setRay(clientX, clientY)) return null;
    const hits = raycaster.intersectObjects(gadgetMeshes, false);
    const obj = hits[0]?.object;
    return obj ? { info: obj.userData.gadget, root: obj.userData.gadgetRoot } : null;
  }

  function raycastSurface(clientX, clientY, category, ignoreHoldingId = null, scale = 1) {
    if (!setRay(clientX, clientY)) return null;
    const legalMeshes = surfaceMeshes.filter(m => m.userData.category === category);
    const hits = raycaster.intersectObjects(legalMeshes, false);
    const hit = hits[0];
    if (!hit) return null;
    const surfaceId = hit.object.userData.surfaceId;
    const parent = surfaceParents[surfaceId];
    const localPoint = parent.worldToLocal(hit.point.clone());
    const { x, z } = surfaceLocalToNorm(surfaceId, localPoint.x, localPoint.z);
    const check = checkSurfacePlacement(surfaceId, x, z, currentPlacements, ignoreHoldingId, scale);
    return { surface: surfaceId, x, z, ok: check.ok };
  }

  renderer.domElement.addEventListener('pointerdown', event => {
    pointerDown = [event.clientX, event.clientY];
    camAnim = null;
    if (controls.autoRotate) setAutoOrbit(false);

    if (curatorMode) {
      const hitId = hitPlacement(event.clientX, event.clientY);
      if (hitId) {
        const item = currentPlacements.find(p => p.holdingId === hitId);
        if (item) {
          controls.enabled = false;
          selectedId = hitId;
          onSelectPlacement?.(hitId, { fromCanvas: true });
          setHighlightedCategory(item.category);
          draggingItem = {
            holdingId: hitId,
            item,
            orig: { surface: item.surface, x: item.x, z: item.z },
            lastValid: { surface: item.surface, x: item.x, z: item.z },
          };
          renderer.domElement.style.cursor = 'grabbing';
        }
      }
    }
  });

  renderer.domElement.addEventListener('pointermove', event => {
    if (draggingItem) {
      const { holdingId, item } = draggingItem;
      const hit = raycastSurface(event.clientX, event.clientY, item.category, holdingId, item.scale || 1);
      if (hit) {
        showGhost(hit.surface, hit.x, hit.z, hit.ok, item.scale || 1);
        if (hit.ok) {
          draggingItem.lastValid = { surface: hit.surface, x: hit.x, z: hit.z };
          previewPlacementTransform(holdingId, draggingItem.lastValid);
        }
      } else {
        hideGhost();
      }
      return;
    }

    const hitId = hitPlacement(event.clientX, event.clientY);
    const gadgetHit = hitId ? null : hitGadget(event.clientX, event.clientY);
    renderer.domElement.style.cursor = hitId ? (curatorMode ? 'move' : 'pointer') : gadgetHit ? 'pointer' : 'grab';
    if (hitId !== hoveredId) {
      hoveredId = hitId;
      onHoverPlacement?.(hitId);
    }
    const nextGadget = gadgetHit?.info ?? null;
    if (nextGadget !== hoveredGadget) {
      hoveredGadget = nextGadget;
      onHoverGadget?.(nextGadget);
    }
  });

  function endCanvasDrag(event) {
    if (draggingItem) {
      const { holdingId, orig, lastValid, item } = draggingItem;
      draggingItem = null;
      controls.enabled = true;
      setHighlightedCategory(null);
      hideGhost();
      renderer.domElement.style.cursor = 'grab';
      const moved = lastValid.surface !== orig.surface
        || Math.hypot(lastValid.x - orig.x, lastValid.z - orig.z) > 0.015;
      if (moved) {
        onCommitPlacement?.(holdingId, {
          surface: lastValid.surface,
          x: lastValid.x,
          z: lastValid.z,
          rotationY: item.rotationY || 0,
          scale: item.scale || 1,
        });
      }
      pointerDown = null;
      return;
    }
    if (!pointerDown) return;
    const dist = Math.hypot(event.clientX - pointerDown[0], event.clientY - pointerDown[1]);
    pointerDown = null;
    if (dist < 6) {
      const hitId = hitPlacement(event.clientX, event.clientY);
      if (hitId) {
        if (!curatorMode) focusPlacement(hitId);
        onSelectPlacement?.(hitId, { fromCanvas: true });
        return;
      }
      const gadgetHit = hitGadget(event.clientX, event.clientY);
      if (gadgetHit?.root) {
        focusGadget(gadgetHit.root);
        onSelectGadget?.(gadgetHit.info);
      }
    }
  }

  renderer.domElement.addEventListener('pointerup', endCanvasDrag);
  renderer.domElement.addEventListener('pointercancel', endCanvasDrag);

  function resize() {
    const w = Math.max(container.clientWidth, 320);
    const h = Math.max(container.clientHeight, 320);
    renderer.setSize(w, h, false);
    if (composer) {
      composer.setSize(w, h);
      bloomPass?.setSize(w, h);
    }
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    markActive();
  }
  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(container);

  let intersectionObserver = null;
  if (typeof IntersectionObserver !== 'undefined') {
    intersectionObserver = new IntersectionObserver(entries => {
      isVisible = entries.some(e => e.isIntersecting);
    });
    intersectionObserver.observe(container);
  }
  resize();

  const worldVec = new THREE.Vector3();
  const scaleVec = new THREE.Vector3();
  const clock = new THREE.Clock();
  const lastProjected = {};
  let lastRenderTime = 0;
  let rafId = 0;

  function projectMarkers() {
    if (!onProject) return;
    const w = container.clientWidth || 1;
    const h = container.clientHeight || 1;
    const rawList = [];
    for (const item of currentPlacements) {
      const group = placementGroups.get(item.holdingId);
      if (!group) continue;
      group.getWorldPosition(worldVec);
      worldVec.y += (item.category === 'figure' ? 0.68 : 0.56) * (item.scale || 1);
      worldVec.project(camera);
      const rawX = (worldVec.x * 0.5 + 0.5) * w;
      const rawY = (-worldVec.y * 0.5 + 0.5) * h;
      const px = Math.round(Math.min(w - 115, Math.max(115, rawX)));
      const py = Math.round(Math.min(h - 48, Math.max(52, rawY)));
      const vis = worldVec.z > -1 && worldVec.z < 1 && rawX >= 12 && rawX <= w - 12 && rawY >= 16 && rawY <= h - 12;
      const safeY = px > w - 190 && py < 96 ? 96 : py;
      rawList.push({ id: item.holdingId, x: px, y: safeY, visible: vis });
    }

    const visibleItems = rawList.filter(i => i.visible).sort((a, b) => a.y - b.y);
    for (let i = 1; i < visibleItems.length; i++) {
      for (let j = 0; j < i; j++) {
        const a = visibleItems[j];
        const b = visibleItems[i];
        if (Math.abs(a.x - b.x) < 145 && Math.abs(a.y - b.y) < 34) {
          b.y = Math.min(h - 48, a.y + 36);
        }
      }
    }

    const projected = {};
    let changed = false;
    for (const item of rawList) {
      const prev = lastProjected[item.id];
      if (!prev || prev.x !== item.x || prev.y !== item.y || prev.visible !== item.visible) changed = true;
      lastProjected[item.id] = projected[item.id] = { x: item.x, y: item.y, visible: item.visible };
    }
    if (changed) onProject(projected);
  }

  function tick(now = 0) {
    rafId = requestAnimationFrame(tick);
    if (document.hidden || !isVisible) return;
    const dt = Math.min(clock.getDelta(), 0.05);
    let activeMotion = Boolean(camAnim) || needsRender || controls.autoRotate;

    if (camAnim) {
      camAnim.progress = Math.min(1, camAnim.progress + dt * 2.3);
      const t = 1 - Math.pow(1 - camAnim.progress, 3);
      camera.position.lerpVectors(camAnim.startPos, camAnim.endPos, t);
      controls.target.lerpVectors(camAnim.startTarget, camAnim.endTarget, t);
      if (camAnim.progress >= 1) camAnim = null;
    }

    for (const item of currentPlacements) {
      const group = placementGroups.get(item.holdingId);
      if (!group) continue;
      const spec = SURFACES[item.surface];
      const highlight = hoveredId === item.holdingId || selectedId === item.holdingId
        || (activeZone !== 'all' && activeZone === spec?.zone);
      const baseScale = item.scale || 1;
      const targetScale = baseScale * (highlight ? 1.07 : 1.0);
      if (Math.abs(group.scale.x - targetScale) > 0.004) {
        group.scale.lerp(scaleVec.set(targetScale, targetScale, targetScale), 0.16);
        activeMotion = true;
      }
      if (group.userData.turntable && !curatorMode && selectedId !== item.holdingId) {
        group.rotation.y = (spec?.defaultRotY || 0) + (item.rotationY || 0) + Math.sin(now * 0.001) * 0.25;
      }
      if (group.userData.ring) {
        const isSelected = selectedId === item.holdingId;
        group.userData.ring.material.color.setHex(isSelected ? 0x38bdf8 : 0x34d399);
        group.userData.ring.material.emissive.setHex(isSelected ? 0x38bdf8 : 0x10b981);
        group.userData.ring.material.emissiveIntensity = highlight ? 2.2 : 0.85;
      }
    }

    if (controls.update()) activeMotion = true;
    const passiveInterval = isSoftwareGpu ? 2500 : 28;
    if (!activeMotion && now - lastRenderTime < passiveInterval) return;
    lastRenderTime = now;
    needsRender = false;

    const posAttr = moteGeo.getAttribute('position');
    for (let i = 0; i < moteCount; i++) {
      const phase = moteSeeds[i * 2];
      const speed = moteSeeds[i * 2 + 1];
      let y = posAttr.getY(i) + dt * speed * 0.22;
      if (y > 3.35) y = 0.35;
      posAttr.setY(i, y);
      posAttr.setX(i, posAttr.getX(i) + Math.sin(now * 0.0007 + phase) * dt * 0.025);
    }
    posAttr.needsUpdate = true;

    if (composer) composer.render();
    else renderer.render(scene, camera);
    projectMarkers();
  }
  rafId = requestAnimationFrame(tick);

  return {
    setPlacements,
    previewPlacementTransform,
    refreshPlacementTexture,
    setCameraPreset,
    focusPlacement,
    setCuratorMode,
    setSelectedPlacement,
    setHoveredPlacement,
    setHighlightedCategory,
    raycastSurface,
    showGhost,
    hideGhost,
    setAutoOrbit,
    isAutoOrbit: () => controls.autoRotate,
    setTheme,
    dispose() {
      cancelAnimationFrame(rafId);
      resizeObserver.disconnect();
      intersectionObserver?.disconnect();
      controls.dispose();
      for (const tex of textures) tex.dispose();
      for (const tex of exhibitTextures.values()) tex.dispose();
      activeGadgets.dispose();
      roomDecor.dispose();
      exterior.dispose();
      moteGeo.dispose();
      moteMat.dispose();
      envRT?.dispose();
      composer?.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}
