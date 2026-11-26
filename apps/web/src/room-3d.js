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
import { buildDeskAccessories, buildRoomDecor, buildStudioChair, buildStudioSpeakers, buildWindowAndExterior } from './room-props-3d.js';

const PRESETS = {
  overview: { position: [5.85, 4.65, 6.6], target: [0.05, 1.32, -0.5] },
  electronics: { position: [1.55, 2.32, 3.28], target: [-1.88, 1.18, 1.05] },
  game: { position: [-0.65, 2.02, 2.48], target: [-0.65, 1.48, -2.55] },
  figure: { position: [0.38, 2.04, 2.26], target: [2.22, 1.64, -1.65] },
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
    shelfIntensity: 2.2,
    cabinetSpot: [0xfff3d6, 2.1],
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
    shelfIntensity: 2.9,
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
    shelfIntensity: 2.5,
    cabinetSpot: [0xffffff, 3.2],
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
    // Subtle woven fibers
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
    // Center geometric medallion
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

function box(w, h, d, material, pos = [0, 0, 0], { cast = true, receive = true, radius = 0 } = {}) {
  const geo = radius > 0 ? new RoundedBoxGeometry(w, h, d, 1, radius) : new THREE.BoxGeometry(w, h, d);
  const mesh = new THREE.Mesh(geo, material);
  mesh.position.set(...pos);
  mesh.castShadow = cast;
  mesh.receiveShadow = receive;
  return mesh;
}

export function createRoomStage(container, { onSelectSlot, onHoverSlot, onHoverGadget, onProject, onAutoOrbitChange } = {}) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  const gl = renderer.getContext();
  const debugInfo = gl?.getExtension?.('WEBGL_debug_renderer_info');
  const gpuName = debugInfo ? gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) : gl?.getParameter?.(gl.RENDERER) || '';
  const isSoftwareGpu = /swiftshader|llvmpipe|software/i.test(String(gpuName));

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

  // Subtle PMREM environment for realistic reflections on hardware GPUs
  let envRT = null;
  if (!isSoftwareGpu) {
    try {
      const pmrem = new THREE.PMREMGenerator(renderer);
      envRT = pmrem.fromScene(new RoomEnvironment(), 0.04);
      scene.environment = envRT.texture;
      scene.environmentIntensity = THEMES.day.envIntensity;
      pmrem.dispose();
    } catch {
      // Continue gracefully without PMREM if WebGL context lacks float textures
    }
  }

  const camera = new THREE.PerspectiveCamera(37, 16 / 10, 0.1, 60);
  camera.position.set(...PRESETS.overview.position);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.07;
  controls.target.set(...PRESETS.overview.target);
  controls.minDistance = 2.4;
  controls.maxDistance = 12.2;
  controls.minPolarAngle = 0.25;
  controls.maxPolarAngle = Math.PI * 0.47;
  controls.autoRotate = false;
  controls.autoRotateSpeed = 0.6;
  controls.update();

  // Post-processing Composer with gentle UnrealBloomPass + OutputPass (enabled on hardware GPUs)
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
  keyLight.shadow.camera.left = -5.4;
  keyLight.shadow.camera.right = 5.4;
  keyLight.shadow.camera.top = 5.4;
  keyLight.shadow.camera.bottom = -5.4;
  keyLight.shadow.bias = -0.00035;
  keyLight.shadow.normalBias = 0.02;

  const rimLight = new THREE.DirectionalLight(...THEMES.day.rim);
  rimLight.position.set(5.8, 4.2, 5.2);

  const deskLampLight = new THREE.PointLight(0xffb86b, 2.8, 5.8, 1.5);
  deskLampLight.position.set(-2.22, 1.48, -0.05);

  const cabinetSpotA = new THREE.PointLight(0xfff3d6, 2.1, 3.4, 2.0);
  const cabinetSpotB = new THREE.PointLight(0xfff3d6, 1.4, 2.8, 2.0);
  const shelfLight = new THREE.PointLight(0xf59e0b, 1.6, 6.2, 1.4);
  shelfLight.position.set(-0.65, 1.95, -1.75);

  scene.add(ambientLight, hemiLight, keyLight, rimLight, deskLampLight, shelfLight);

  // Materials
  const woodTex = createWoodTexture();
  const wallTex = createWallTexture();
  const rugTex = createRugTexture();
  const monitorTex = createMonitorTexture();
  const moteTex = createParticleTexture();
  const textures = [woodTex, wallTex, rugTex, monitorTex, moteTex];

  const floorMat = new THREE.MeshStandardMaterial({ map: woodTex, roughness: 0.64, metalness: 0.06 });
  const plinthMat = new THREE.MeshStandardMaterial({ color: 0x151a22, roughness: 0.78, metalness: 0.25 });
  const wallMat = new THREE.MeshStandardMaterial({ map: wallTex, roughness: 0.88, metalness: 0.05 });
  const trimMat = new THREE.MeshStandardMaterial({ color: 0x11161f, roughness: 0.55, metalness: 0.35 });
  const walnutMat = new THREE.MeshStandardMaterial({ color: 0x5f3c25, roughness: 0.48, metalness: 0.08 });
  const darkOakMat = new THREE.MeshStandardMaterial({ color: 0x2a1f19, roughness: 0.58, metalness: 0.1 });
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
    color: 0xcbe7ff, transparent: true, opacity: 0.038, roughness: 0.08, metalness: 0.1,
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

  // Architectural Room Shell
  const roomGroup = new THREE.Group();
  roomGroup.add(box(7.52, 0.28, 6.72, plinthMat, [0, -0.15, 0], { cast: false, radius: 0.03 }));
  roomGroup.add(box(7.56, 0.025, 6.76, brassMat, [0, -0.025, 0], { cast: false, radius: 0.008 }));
  roomGroup.add(box(7.2, 0.04, 6.4, floorMat, [0, -0.005, 0], { cast: false }));

  // Layered woven rug with subtle raised border
  const rugGroup = new THREE.Group();
  rugGroup.position.set(0.2, 0.015, 0.65);
  rugGroup.add(box(3.05, 0.02, 3.35, new THREE.MeshStandardMaterial({ map: rugTex, roughness: 0.95 }), [0, 0, 0], { cast: false, radius: 0.008 }));
  roomGroup.add(rugGroup);

  // Back Wall (z = -3.2) & Acoustic Slats + Cove Lighting
  roomGroup.add(box(7.38, 3.88, 0.18, wallMat, [0, 1.94, -3.29]));
  roomGroup.add(box(7.2, 0.14, 0.05, trimMat, [0, 0.07, -3.18]));
  for (let i = 0; i < 16; i++) {
    roomGroup.add(box(0.075, 3.62, 0.055, walnutMat, [1.22 + i * 0.14, 1.9, -3.17], { radius: 0.008 }));
  }
  roomGroup.add(box(6.9, 0.035, 0.035, ledStripMat, [0, 3.76, -3.18], { cast: false }));

  // Left Wall (x = -3.6) with Cutout Panoramic Window
  roomGroup.add(box(0.18, 3.88, 1.5, wallMat, [-3.69, 1.94, -2.55]));
  roomGroup.add(box(0.18, 3.88, 2.2, wallMat, [-3.69, 1.94, 2.1]));
  roomGroup.add(box(0.18, 1.1, 2.8, wallMat, [-3.69, 0.55, -0.4]));
  roomGroup.add(box(0.18, 0.82, 2.8, wallMat, [-3.69, 3.47, -0.4]));
  roomGroup.add(box(0.18, 0.14, 6.4, trimMat, [-3.58, 0.07, 0]));

  const exterior = buildWindowAndExterior(roomGroup, propMats);

  // =========================================================
  // ZONE 1: STUDIO ELECTRONICS DESK (desk-1, desk-2)
  // =========================================================
  const deskGroup = new THREE.Group();
  deskGroup.position.set(-2.05, 0, 1.05);
  deskGroup.add(box(1.38, 0.08, 3.48, walnutMat, [0, 0.86, 0], { radius: 0.018 }));
  for (const [lx, lz] of [[-0.56, -1.55], [0.56, -1.55], [-0.56, 1.55], [0.56, 1.55]]) {
    deskGroup.add(box(0.065, 0.84, 0.065, matteMetalMat, [lx, 0.42, lz], { radius: 0.01 }));
  }
  // Crossbars & brass foot caps
  deskGroup.add(box(0.04, 0.04, 3.08, matteMetalMat, [-0.56, 0.24, 0], { radius: 0.008 }));
  deskGroup.add(box(0.04, 0.03, 3.22, accentLedMat, [-0.64, 0.81, 0], { cast: false }));
  // Wool felt desk mat
  deskGroup.add(box(0.58, 0.014, 1.28, new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.92 }), [0.16, 0.905, 0], { radius: 0.005 }));
  // Studio Monitor on aluminum arm stand
  deskGroup.add(box(0.18, 0.025, 0.28, chromeMat, [-0.45, 0.912, 0.22], { radius: 0.006 }));
  deskGroup.add(box(0.055, 0.48, 0.075, matteMetalMat, [-0.49, 1.14, 0.22], { radius: 0.01 }));
  deskGroup.add(box(0.055, 0.56, 1.14, matteMetalMat, [-0.39, 1.46, 0.22], { radius: 0.012 }));
  const screenMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(1.06, 0.49),
    new THREE.MeshBasicMaterial({ map: monitorTex }),
  );
  screenMesh.rotation.y = Math.PI / 2;
  screenMesh.position.set(-0.358, 1.46, 0.22);
  deskGroup.add(screenMesh);

  // Architect Brass & Matte Desk Lamp
  deskGroup.add(box(0.18, 0.03, 0.18, matteMetalMat, [-0.35, 0.915, -1.45], { radius: 0.01 }));
  deskGroup.add(box(0.03, 0.56, 0.03, brassMat, [-0.35, 1.18, -1.45], { radius: 0.008 }));
  deskGroup.add(box(0.25, 0.06, 0.12, matteMetalMat, [-0.22, 1.48, -1.43], { radius: 0.014 }));
  deskGroup.add(box(0.18, 0.02, 0.08, ledStripMat, [-0.22, 1.445, -1.43], { cast: false }));

  buildStudioSpeakers(deskGroup, propMats);
  buildDeskAccessories(deskGroup, propMats);
  roomGroup.add(deskGroup);
  roomGroup.add(buildStudioChair(propMats));

  // =========================================================
  // ZONE 2: ILLUMINATED MEDIA SHELF (shelf-1, shelf-2)
  // =========================================================
  const shelfGroup = new THREE.Group();
  shelfGroup.position.set(-0.65, 0, -2.58);
  shelfGroup.add(box(2.96, 3.08, 0.06, darkOakMat, [0, 1.54, -0.3]));
  for (const sx of [-1.45, 0, 1.45]) {
    shelfGroup.add(box(0.07, 3.08, 0.64, walnutMat, [sx, 1.54, 0], { radius: 0.01 }));
  }
  for (const sy of [0.08, 0.88, 1.72, 2.58, 3.06]) {
    shelfGroup.add(box(2.96, 0.06, 0.64, walnutMat, [0, sy, 0], { radius: 0.01 }));
  }
  for (const ly of [0.84, 1.68, 2.54, 3.02]) {
    shelfGroup.add(box(1.32, 0.018, 0.035, ledStripMat, [-0.72, ly, 0.18], { cast: false }));
    shelfGroup.add(box(1.32, 0.018, 0.035, ledStripMat, [0.72, ly, 0.18], { cast: false }));
  }
  const activeGadgets = buildActiveGadgets(deskGroup, shelfGroup);
  const roomDecor = buildRoomDecor(roomGroup, shelfGroup, propMats);
  roomGroup.add(shelfGroup);

  // =========================================================
  // ZONE 3: MUSEUM GLASS DISPLAY CABINET (cabinet-1, cabinet-2)
  // =========================================================
  const cabinetGroup = new THREE.Group();
  cabinetGroup.position.set(2.25, 0, -1.65);
  cabinetGroup.rotation.y = -0.34;
  cabinetGroup.add(box(1.66, 0.44, 1.12, matteMetalMat, [0, 0.22, 0], { radius: 0.02 }));
  cabinetGroup.add(box(1.7, 0.04, 1.16, brassMat, [0, 0.45, 0], { radius: 0.01 }));
  // Brass museum plaque on lower cabinet plinth
  cabinetGroup.add(box(0.46, 0.1, 0.02, brassMat, [0, 0.24, 0.562], { radius: 0.005 }));
  cabinetGroup.add(box(1.66, 0.16, 1.12, matteMetalMat, [0, 2.98, 0], { radius: 0.02 }));
  cabinetGroup.add(box(1.2, 0.03, 0.72, ledStripMat, [0, 2.89, 0], { cast: false }));
  for (const [cx, cz] of [[-0.79, -0.52], [0.79, -0.52], [-0.79, 0.52], [0.79, 0.52]]) {
    cabinetGroup.add(box(0.055, 2.46, 0.055, matteMetalMat, [cx, 1.69, cz], { radius: 0.01 }));
  }
  for (const sy of [1.22, 2.06]) {
    const shelfPane = box(1.52, 0.03, 0.98, shelfGlassMat, [0, sy, 0], { cast: false, receive: false });
    shelfPane.renderOrder = 3;
    cabinetGroup.add(shelfPane);
  }
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
  cabinetSpotA.position.set(0, 2.82, 0);
  cabinetSpotB.position.set(0, 1.98, 0);
  cabinetGroup.add(cabinetSpotA, cabinetSpotB);
  roomGroup.add(cabinetGroup);

  // Floating Ambient Dust Motes
  const moteCount = 64;
  const motePositions = new Float32Array(moteCount * 3);
  const moteSeeds = new Float32Array(moteCount * 2);
  for (let i = 0; i < moteCount; i++) {
    motePositions[i * 3] = ((i * 37) % 100) / 100 * 6.4 - 3.2;
    motePositions[i * 3 + 1] = 0.4 + ((i * 53) % 100) / 100 * 2.8;
    motePositions[i * 3 + 2] = ((i * 71) % 100) / 100 * 5.6 - 2.8;
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
    opacity: 0.42,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const motes = new THREE.Points(moteGeo, moteMat);
  roomGroup.add(motes);

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

  function applyCoverMaterial(mesh, exhibit, fallbackColor) {
    const mat = new THREE.MeshStandardMaterial({ color: fallbackColor, roughness: 0.4, metalness: 0.05 });
    if (exhibit?.imageEl && exhibit.imageEl.complete && exhibit.imageEl.naturalWidth > 0) {
      try {
        const tex = makeCoverTexture(exhibit.imageEl);
        exhibitTextures.get(mesh.userData.slotId)?.dispose();
        exhibitTextures.set(mesh.userData.slotId, tex);
        mat.map = tex;
        mat.emissiveMap = tex;
        mat.emissive.setHex(0xffffff);
        mat.emissiveIntensity = 0.16;
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
      electronics: { maxW: 0.5, maxH: 0.48, maxD: 0.44, baseY: 0.045 },
      game: { maxW: 0.46, maxH: 0.54, maxD: 0.36, baseY: 0.045 },
      figure: { maxW: 0.58, maxH: 0.68, maxD: 0.52, baseY: 0.11 },
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

    // Refined museum coaster / recessed glowing hairline ring
    const baseMat = new THREE.MeshStandardMaterial({
      color: exhibit ? 0x1e293b : 0x334155,
      roughness: 0.35,
      metalness: 0.72,
    });
    const ringMat = new THREE.MeshStandardMaterial({
      color: exhibit ? 0x34d399 : 0x64748b,
      emissive: exhibit ? 0x10b981 : 0x334155,
      emissiveIntensity: exhibit ? 0.85 : 0.18,
      roughness: 0.25,
    });
    const baseRadius = exhibit ? 0.23 : 0.16;
    const basePad = new THREE.Mesh(new THREE.CylinderGeometry(baseRadius, baseRadius + 0.018, 0.018, 32), baseMat);
    basePad.position.y = 0.009;
    basePad.receiveShadow = true;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(baseRadius - 0.008, 0.007, 10, 36), ringMat);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.019;
    group.add(basePad, ring);
    group.userData.ring = ring;

    if (exhibit) {
      let displayMesh;
      const fallbackNodes = [];
      if (spec.kind === 'electronics') {
        const stand = box(0.46, 0.045, 0.25, matteMetalMat, [0, 0.04, 0], { radius: 0.01 });
        const bezel = box(0.5, 0.38, 0.036, matteMetalMat, [0, 0.275, -0.018], { radius: 0.012 });
        bezel.rotation.x = -0.14;
        displayMesh = new THREE.Mesh(new THREE.PlaneGeometry(0.46, 0.34), new THREE.MeshStandardMaterial({ color: 0x38bdf8 }));
        displayMesh.position.set(0, 0.275, 0.003);
        displayMesh.rotation.x = -0.14;
        group.add(stand, bezel, displayMesh);
        fallbackNodes.push(stand, bezel, displayMesh);
      } else if (spec.kind === 'game') {
        const easel = box(0.36, 0.04, 0.22, brassMat, [0, 0.04, 0], { radius: 0.01 });
        const caseBox = box(0.38, 0.5, 0.045, new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.28, metalness: 0.45 }), [0, 0.29, -0.01], { radius: 0.01 });
        caseBox.rotation.x = -0.12;
        displayMesh = new THREE.Mesh(new THREE.PlaneGeometry(0.35, 0.46), new THREE.MeshStandardMaterial({ color: 0xa78bfa }));
        displayMesh.position.set(0, 0.29, 0.016);
        displayMesh.rotation.x = -0.12;
        group.add(easel, caseBox, displayMesh);
        fallbackNodes.push(easel, caseBox, displayMesh);
      } else {
        const riser = new THREE.Mesh(
          new THREE.CylinderGeometry(0.22, 0.25, 0.08, 32),
          new THREE.MeshStandardMaterial({ color: 0x18212f, roughness: 0.22, metalness: 0.78 }),
        );
        riser.position.y = 0.058;
        const brassTrim = new THREE.Mesh(new THREE.TorusGeometry(0.222, 0.008, 10, 32), brassMat);
        brassTrim.rotation.x = Math.PI / 2;
        brassTrim.position.y = 0.098;
        const frame = box(0.48, 0.58, 0.032, matteMetalMat, [0, 0.41, -0.015], { radius: 0.01 });
        displayMesh = new THREE.Mesh(new THREE.PlaneGeometry(0.44, 0.54), new THREE.MeshStandardMaterial({ color: 0xfbbf24, side: THREE.DoubleSide }));
        displayMesh.position.set(0, 0.41, 0.005);
        group.add(riser, brassTrim, frame, displayMesh);
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

  function setAutoOrbit(enabled) {
    controls.autoRotate = Boolean(enabled);
    onAutoOrbitChange?.(controls.autoRotate);
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
    if (controls.autoRotate) setAutoOrbit(false);
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
    for (const [id, anchor] of slotAnchors.entries()) {
      const occupied = Boolean(currentExhibits.get(id));
      anchor.getWorldPosition(worldVec);
      worldVec.y += occupied ? 0.66 : 0.1;
      worldVec.project(camera);
      const rawX = (worldVec.x * 0.5 + 0.5) * w;
      const rawY = (-worldVec.y * 0.5 + 0.5) * h;
      const px = Math.round(Math.min(w - 86, Math.max(86, rawX)));
      const py = Math.round(Math.min(h - 46, Math.max(46, rawY)));
      const vis = worldVec.z > -1 && worldVec.z < 1 && rawX >= -30 && rawX <= w + 30 && rawY >= -20 && rawY <= h + 30;
      rawList.push({ id, x: px, y: py, visible: vis, occupied });
    }

    // Lightweight collision nudge so occupied pills never stack directly over each other
    const visibleItems = rawList.filter(item => item.visible && item.occupied).sort((a, b) => a.y - b.y);
    for (let i = 1; i < visibleItems.length; i++) {
      for (let j = 0; j < i; j++) {
        const a = visibleItems[j];
        const b = visibleItems[i];
        if (Math.abs(a.x - b.x) < 138 && Math.abs(a.y - b.y) < 34) {
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

    for (const [id, group] of slotGroups.entries()) {
      const spec = slotSpecs[id];
      const highlight = hoveredSlot === id || (activeZone !== 'all' && activeZone === spec.kind);
      const targetScale = highlight ? 1.07 : 1.0;
      if (Math.abs(group.scale.x - targetScale) > 0.004) {
        group.scale.lerp(scaleVec.set(targetScale, targetScale, targetScale), 0.16);
        activeMotion = true;
      }
      if (group.userData.turntable && currentExhibits.get(id)) {
        group.rotation.y = Math.sin(now * 0.001) * 0.34;
      }
      if (group.userData.ring) {
        group.userData.ring.material.emissiveIntensity = highlight
          ? 2.2
          : currentExhibits.get(id)
            ? 0.9 + Math.sin(now * 0.002) * 0.15
            : 0.18;
      }
    }

    if (controls.update()) activeMotion = true;
    const passiveInterval = isSoftwareGpu ? 600 : 28;
    if (!activeMotion && now - lastRenderTime < passiveInterval) return;
    lastRenderTime = now;
    needsRender = false;

    // Gentle drifting ambient dust motes
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
  tick();

  return {
    setExhibits,
    refreshSlotTexture,
    setCameraPreset,
    setAutoOrbit,
    isAutoOrbit: () => controls.autoRotate,
    setZoneFocus,
    setHoveredSlot,
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
