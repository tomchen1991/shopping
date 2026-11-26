import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

let useSimpleBoxes = false;

function rbox(w, h, d, radius, mat, pos = [0, 0, 0], rot = [0, 0, 0], { cast = true, receive = true } = {}) {
  const geo = useSimpleBoxes || radius <= 0 ? new THREE.BoxGeometry(w, h, d) : new RoundedBoxGeometry(w, h, d, 1, radius);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(...pos);
  mesh.rotation.set(...rot);
  mesh.castShadow = cast;
  mesh.receiveShadow = receive;
  return mesh;
}

export function setPropsFastMode(fast) {
  useSimpleBoxes = Boolean(fast);
}

function cyl(rt, rb, h, segs, mat, pos = [0, 0, 0], rot = [0, 0, 0], { cast = true, receive = true } = {}) {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, segs), mat);
  mesh.position.set(...pos);
  mesh.rotation.set(...rot);
  mesh.castShadow = cast;
  mesh.receiveShadow = receive;
  return mesh;
}

export function buildStudioChair(mats) {
  const chair = new THREE.Group();
  chair.position.set(-0.78, 0.02, 1.05);
  chair.rotation.y = -Math.PI * 0.44;

  const leatherMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.62, metalness: 0.08 });
  const fabricMat = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.85, metalness: 0.04 });

  // 5-star caster base
  chair.add(cyl(0.036, 0.045, 0.09, 20, mats.chrome, [0, 0.09, 0]));
  chair.add(cyl(0.028, 0.028, 0.24, 16, mats.matteMetal, [0, 0.23, 0]));
  for (let i = 0; i < 5; i++) {
    const angle = (i / 5) * Math.PI * 2;
    const arm = new THREE.Group();
    arm.rotation.y = angle;
    arm.add(rbox(0.036, 0.028, 0.3, 0.01, mats.chrome, [0, 0.055, 0.14], [0.1, 0, 0]));
    const wheel = cyl(0.028, 0.028, 0.026, 16, mats.matteMetal, [0, 0.028, 0.27], [0, 0, Math.PI / 2]);
    arm.add(wheel);
    chair.add(arm);
  }

  // Seat base & plush cushion
  chair.add(rbox(0.42, 0.045, 0.42, 0.015, mats.matteMetal, [0, 0.36, 0]));
  chair.add(rbox(0.5, 0.055, 0.48, 0.025, mats.walnut, [0, 0.4, 0]));
  chair.add(rbox(0.46, 0.085, 0.44, 0.035, fabricMat, [0, 0.455, 0.01]));

  // Curved backrest shell + cushion
  chair.add(rbox(0.06, 0.34, 0.04, 0.015, mats.matteMetal, [0, 0.56, -0.23], [-0.12, 0, 0]));
  chair.add(rbox(0.48, 0.44, 0.045, 0.02, mats.walnut, [0, 0.75, -0.25], [-0.14, 0, 0]));
  chair.add(rbox(0.44, 0.4, 0.065, 0.03, leatherMat, [0, 0.75, -0.215], [-0.14, 0, 0]));
  // Headrest pillow accent
  chair.add(rbox(0.28, 0.14, 0.05, 0.022, fabricMat, [0, 1.03, -0.27], [-0.16, 0, 0]));

  // Armrests
  for (const side of [-1, 1]) {
    chair.add(rbox(0.032, 0.2, 0.036, 0.01, mats.matteMetal, [side * 0.27, 0.5, -0.02]));
    chair.add(rbox(0.06, 0.032, 0.28, 0.014, leatherMat, [side * 0.27, 0.61, 0.01]));
  }

  return chair;
}

export function buildStudioSpeakers(deskGroup, mats) {
  const speakerConeMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.45, metalness: 0.25 });
  const copperRingMat = new THREE.MeshStandardMaterial({ color: 0xd97706, roughness: 0.28, metalness: 0.85 });
  const greenLed = new THREE.MeshStandardMaterial({ color: 0x34d399, emissive: 0x10b981, emissiveIntensity: 1.6 });

  for (const [sz, yaw] of [[-0.45, 0.16], [0.89, -0.16]]) {
    const spk = new THREE.Group();
    spk.position.set(-0.38, 0.9, sz);
    spk.rotation.y = Math.PI / 2 + yaw;

    // Isolation pad
    spk.add(rbox(0.19, 0.03, 0.2, 0.008, mats.matteMetal, [0, 0.015, 0]));
    // Cabinet
    spk.add(rbox(0.18, 0.27, 0.19, 0.02, mats.walnut, [0, 0.165, 0]));
    spk.add(rbox(0.165, 0.255, 0.02, 0.012, mats.matteMetal, [0, 0.165, 0.09]));

    // Woofer + copper accent ring
    spk.add(cyl(0.056, 0.056, 0.012, 24, copperRingMat, [0, 0.125, 0.102], [Math.PI / 2, 0, 0]));
    spk.add(cyl(0.048, 0.036, 0.014, 24, speakerConeMat, [0, 0.125, 0.105], [Math.PI / 2, 0, 0]));
    // Tweeter
    spk.add(cyl(0.024, 0.024, 0.01, 20, mats.chrome, [0, 0.23, 0.102], [Math.PI / 2, 0, 0]));
    spk.add(cyl(0.016, 0.016, 0.012, 16, speakerConeMat, [0, 0.23, 0.104], [Math.PI / 2, 0, 0]));
    // Power LED
    spk.add(rbox(0.012, 0.006, 0.006, 0.002, greenLed, [0.058, 0.06, 0.103], [0, 0, 0], { cast: false }));

    deskGroup.add(spk);
  }
}

export function buildDeskAccessories(deskGroup, mats) {
  // Custom mechanical keyboard with keycap rows & coiled cable
  const kbGroup = new THREE.Group();
  kbGroup.position.set(0.18, 0.913, 0.05);
  const keycapLight = new THREE.MeshStandardMaterial({ color: 0xe2e8f0, roughness: 0.45, metalness: 0.05 });
  const keycapDark = new THREE.MeshStandardMaterial({ color: 0x475569, roughness: 0.45, metalness: 0.08 });
  const keycapAccent = new THREE.MeshStandardMaterial({ color: 0xf59e0b, roughness: 0.35, metalness: 0.15 });

  kbGroup.add(rbox(0.17, 0.022, 0.44, 0.008, mats.matteMetal, [0, 0.011, 0], [0, 0, -0.04]));
  for (let row = 0; row < 4; row++) {
    const rx = -0.052 + row * 0.034;
    const isBottom = row === 3;
    const keyMat = row === 0 ? keycapDark : keycapLight;
    kbGroup.add(rbox(0.026, 0.012, isBottom ? 0.22 : 0.39, 0.004, keyMat, [rx, 0.024, 0], [0, 0, -0.04]));
  }
  kbGroup.add(rbox(0.026, 0.013, 0.042, 0.004, keycapAccent, [-0.052, 0.025, -0.175], [0, 0, -0.04]));
  // Coiled aviator cable
  const coil = new THREE.Mesh(
    new THREE.TorusGeometry(0.016, 0.005, 8, 18),
    mats.chrome,
  );
  coil.scale.set(1, 1, 2.4);
  coil.rotation.y = Math.PI / 2;
  coil.position.set(-0.14, 0.014, -0.08);
  kbGroup.add(coil);
  deskGroup.add(kbGroup);

  // Sculpted wireless mouse
  deskGroup.add(rbox(0.11, 0.032, 0.068, 0.015, mats.matteMetal, [0.18, 0.922, -0.32]));
  deskGroup.add(rbox(0.022, 0.01, 0.008, 0.003, mats.brass, [0.145, 0.935, -0.32]));

  // Ceramic coffee mug on cork coaster
  const corkMat = new THREE.MeshStandardMaterial({ color: 0x926239, roughness: 0.9 });
  const ceramicMat = new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.22, metalness: 0.06 });
  const coffeeMat = new THREE.MeshStandardMaterial({ color: 0x3b2112, roughness: 0.15, metalness: 0.08 });
  const mug = new THREE.Group();
  mug.position.set(0.36, 0.902, -0.78);
  mug.add(cyl(0.062, 0.062, 0.008, 22, corkMat, [0, 0.004, 0]));
  mug.add(cyl(0.046, 0.042, 0.1, 24, ceramicMat, [0, 0.058, 0]));
  mug.add(cyl(0.038, 0.038, 0.006, 20, coffeeMat, [0, 0.105, 0]));
  const handle = new THREE.Mesh(new THREE.TorusGeometry(0.028, 0.007, 10, 20, Math.PI), ceramicMat);
  handle.position.set(0.044, 0.06, 0);
  handle.rotation.z = -Math.PI / 2;
  mug.add(handle);
  deskGroup.add(mug);

  // Minimal desk succulent pot near lamp
  const terracotta = new THREE.MeshStandardMaterial({ color: 0xc26d4a, roughness: 0.78 });
  const leafMat = new THREE.MeshStandardMaterial({ color: 0x2e7d5b, roughness: 0.55 });
  const miniPlant = new THREE.Group();
  miniPlant.position.set(-0.32, 0.9, -1.12);
  miniPlant.add(cyl(0.055, 0.042, 0.08, 18, terracotta, [0, 0.04, 0]));
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.025, 0.075, 8), leafMat);
    leaf.position.set(Math.cos(a) * 0.022, 0.095, Math.sin(a) * 0.022);
    leaf.rotation.z = -Math.cos(a) * 0.55;
    leaf.rotation.x = Math.sin(a) * 0.55;
    leaf.castShadow = true;
    miniPlant.add(leaf);
  }
  deskGroup.add(miniPlant);
}

export function buildWindowAndExterior(roomGroup, mats) {
  const exteriorTexCanvas = document.createElement('canvas');
  exteriorTexCanvas.width = 512;
  exteriorTexCanvas.height = 384;
  const skyTex = new THREE.CanvasTexture(exteriorTexCanvas);
  skyTex.colorSpace = THREE.SRGBColorSpace;
  skyTex.anisotropy = 4;

  function drawExterior(themeName) {
    const ctx = exteriorTexCanvas.getContext('2d');
    const w = 512;
    const h = 384;
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    if (themeName === 'night') {
      grad.addColorStop(0, '#050816');
      grad.addColorStop(0.55, '#131836');
      grad.addColorStop(1, '#261c46');
    } else if (themeName === 'gallery') {
      grad.addColorStop(0, '#0f172a');
      grad.addColorStop(0.65, '#1e293b');
      grad.addColorStop(1, '#334155');
    } else {
      grad.addColorStop(0, '#3b74b8');
      grad.addColorStop(0.55, '#7cb3df');
      grad.addColorStop(0.85, '#f6c38d');
      grad.addColorStop(1, '#f8a575');
    }
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    if (themeName === 'night') {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
      for (let i = 0; i < 65; i++) {
        const sx = (i * 89 + 17) % w;
        const sy = (i * 53 + 11) % (h * 0.62);
        const r = (i % 3 === 0) ? 1.8 : 1.0;
        ctx.beginPath();
        ctx.arc(sx, sy, r, 0, Math.PI * 2);
        ctx.fill();
      }
      // Crescent moon glow
      const moonGlow = ctx.createRadialGradient(w * 0.72, h * 0.25, 6, w * 0.72, h * 0.25, 58);
      moonGlow.addColorStop(0, 'rgba(254, 240, 138, 0.95)');
      moonGlow.addColorStop(0.35, 'rgba(254, 240, 138, 0.25)');
      moonGlow.addColorStop(1, 'rgba(254, 240, 138, 0)');
      ctx.fillStyle = moonGlow;
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#fef9c3';
      ctx.beginPath();
      ctx.arc(w * 0.72, h * 0.25, 18, 0, Math.PI * 2);
      ctx.fill();
    } else if (themeName === 'day') {
      // Golden sun glow + soft clouds
      const sunGlow = ctx.createRadialGradient(w * 0.34, h * 0.42, 10, w * 0.34, h * 0.42, 145);
      sunGlow.addColorStop(0, 'rgba(255, 247, 220, 0.95)');
      sunGlow.addColorStop(0.35, 'rgba(253, 224, 150, 0.45)');
      sunGlow.addColorStop(1, 'rgba(253, 224, 150, 0)');
      ctx.fillStyle = sunGlow;
      ctx.fillRect(0, 0, w, h);

      ctx.fillStyle = 'rgba(255, 255, 255, 0.32)';
      for (const [cx, cy, rx, ry] of [[120, 105, 58, 16], [360, 90, 74, 18], [410, 155, 50, 12]]) {
        ctx.beginPath();
        ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Distant skyline silhouettes
    const buildings = [
      [0, 72, 118], [66, 56, 156], [116, 44, 108], [156, 68, 174],
      [218, 52, 132], [266, 62, 188], [322, 48, 126], [366, 70, 164], [430, 82, 140],
    ];
    for (const [bx, bw, bh] of buildings) {
      ctx.fillStyle = themeName === 'night' ? '#0b1022' : themeName === 'gallery' ? '#0f172a' : '#2d3b55';
      ctx.fillRect(bx, h - bh, bw - 3, bh);
      if (themeName === 'night') {
        for (let wy = h - bh + 12; wy < h - 14; wy += 16) {
          for (let wx = bx + 8; wx < bx + bw - 14; wx += 14) {
            if (((wx * 7 + wy * 13) % 5) === 0) {
              ctx.fillStyle = ((wx + wy) % 3 === 0) ? 'rgba(56, 189, 248, 0.65)' : 'rgba(251, 191, 36, 0.72)';
              ctx.fillRect(wx, wy, 5, 8);
            }
          }
        }
      }
    }
    skyTex.needsUpdate = true;
  }

  drawExterior('day');

  const skyMat = new THREE.MeshBasicMaterial({ map: skyTex });
  const skyPlane = new THREE.Mesh(new THREE.PlaneGeometry(3.0, 2.15), skyMat);
  skyPlane.rotation.y = Math.PI / 2;
  skyPlane.position.set(-3.92, 2.08, -0.4);
  roomGroup.add(skyPlane);

  // Window mullions & wooden interior sill
  roomGroup.add(rbox(0.28, 0.08, 2.94, 0.015, mats.walnut, [-3.58, 1.09, -0.4]));
  roomGroup.add(rbox(0.24, 0.06, 2.9, 0.01, mats.trim, [-3.63, 3.06, -0.4]));
  roomGroup.add(rbox(0.2, 1.98, 0.05, 0.008, mats.trim, [-3.65, 2.08, -0.4]));
  roomGroup.add(rbox(0.2, 0.03, 2.82, 0.005, mats.trim, [-3.65, 2.26, -0.4]));
  // Top venetian blind valance
  roomGroup.add(rbox(0.14, 0.14, 2.76, 0.015, mats.darkOak, [-3.54, 2.98, -0.4]));

  // Small book stack + glass bottle on window sill
  roomGroup.add(rbox(0.16, 0.032, 0.22, 0.005, new THREE.MeshStandardMaterial({ color: 0x3b82f6, roughness: 0.7 }), [-3.55, 1.145, -1.2]));
  roomGroup.add(rbox(0.15, 0.028, 0.2, 0.005, new THREE.MeshStandardMaterial({ color: 0xf59e0b, roughness: 0.7 }), [-3.55, 1.175, -1.2]));

  // Window glass pane
  const windowPane = new THREE.Mesh(new THREE.PlaneGeometry(2.74, 1.92), mats.glass);
  windowPane.rotation.y = Math.PI / 2;
  windowPane.position.set(-3.64, 2.08, -0.4);
  windowPane.renderOrder = 4;
  roomGroup.add(windowPane);

  // Soft feathered volumetric sunbeams streaming diagonally from window (visible in day mode)
  const beamCanvas = document.createElement('canvas');
  beamCanvas.width = 256;
  beamCanvas.height = 256;
  const bCtx = beamCanvas.getContext('2d');
  const bGradX = bCtx.createLinearGradient(0, 0, 256, 0);
  bGradX.addColorStop(0, 'rgba(255, 232, 185, 0.55)');
  bGradX.addColorStop(0.45, 'rgba(255, 232, 185, 0.22)');
  bGradX.addColorStop(1, 'rgba(255, 232, 185, 0)');
  bCtx.fillStyle = bGradX;
  bCtx.fillRect(0, 0, 256, 256);
  // Soft vertical edge mask so top/bottom of beam feather to zero
  bCtx.globalCompositeOperation = 'destination-in';
  const bGradY = bCtx.createLinearGradient(0, 0, 0, 256);
  bGradY.addColorStop(0, 'rgba(0,0,0,0)');
  bGradY.addColorStop(0.28, 'rgba(0,0,0,1)');
  bGradY.addColorStop(0.72, 'rgba(0,0,0,1)');
  bGradY.addColorStop(1, 'rgba(0,0,0,0)');
  bCtx.fillStyle = bGradY;
  bCtx.fillRect(0, 0, 256, 256);
  const beamTex = new THREE.CanvasTexture(beamCanvas);
  beamTex.colorSpace = THREE.SRGBColorSpace;

  const sunbeamGroup = new THREE.Group();
  const beamMat = new THREE.MeshBasicMaterial({
    map: beamTex,
    transparent: true,
    opacity: 0.2,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
  });
  for (const bz of [-1.05, 0.25]) {
    const beam = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 1.35), beamMat);
    beam.position.set(-2.05, 1.48, bz);
    beam.rotation.y = -0.18;
    beam.rotation.z = -0.44;
    beam.rotation.x = 0.28;
    beam.renderOrder = 6;
    sunbeamGroup.add(beam);
  }
  roomGroup.add(sunbeamGroup);

  return {
    setTheme(themeName) {
      drawExterior(themeName);
      sunbeamGroup.visible = themeName === 'day';
    },
    dispose() {
      skyTex.dispose();
      beamTex.dispose();
    },
  };
}

export function buildRoomDecor(roomGroup, shelfGroup, mats) {
  const textures = [];

  // 1. Tall corner potted Monstera plant tucked beside the display cabinet
  const planterGroup = new THREE.Group();
  planterGroup.position.set(2.96, 0, 0.52);
  const stonewarePot = new THREE.MeshStandardMaterial({ color: 0x475569, roughness: 0.65, metalness: 0.08 });
  const soilMat = new THREE.MeshStandardMaterial({ color: 0x271c15, roughness: 0.95 });
  const leafMat = new THREE.MeshStandardMaterial({ color: 0x1f6e4c, roughness: 0.5, side: THREE.DoubleSide });

  planterGroup.add(cyl(0.22, 0.16, 0.44, 24, stonewarePot, [0, 0.26, 0]));
  planterGroup.add(cyl(0.2, 0.2, 0.04, 20, soilMat, [0, 0.45, 0]));
  // Wooden planter stand
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    planterGroup.add(cyl(0.016, 0.012, 0.18, 10, mats.walnut, [Math.cos(a) * 0.16, 0.09, Math.sin(a) * 0.16]));
  }
  // Sculpted stems & fan leaves
  const leafConfigs = [
    [0, 0.88, 0, 0.35, 0.2, 0.26],
    [0.14, 0.78, 0.12, 0.55, 1.1, 0.22],
    [-0.16, 0.82, 0.08, 0.5, -1.2, 0.23],
    [0.08, 0.96, -0.14, 0.42, 2.5, 0.24],
    [-0.1, 0.7, -0.15, 0.62, -2.6, 0.2],
  ];
  for (const [lx, ly, lz, tilt, yaw, rad] of leafConfigs) {
    const stem = cyl(0.01, 0.014, ly - 0.42, 8, leafMat, [lx * 0.45, 0.45 + (ly - 0.45) * 0.5, lz * 0.45], [lz * 0.9, 0, -lx * 0.9]);
    const leaf = new THREE.Mesh(new THREE.CircleGeometry(rad, 12), leafMat);
    leaf.scale.set(0.82, 1.28, 1);
    leaf.position.set(lx, ly, lz);
    leaf.rotation.set(-Math.PI * 0.36 + tilt * 0.4, yaw, 0);
    leaf.castShadow = true;
    planterGroup.add(stem, leaf);
  }
  roomGroup.add(planterGroup);

  // 2. Framed Gallery Poster + Second Minimalist Print on Left Wall
  const posterCanvas = document.createElement('canvas');
  posterCanvas.width = 256;
  posterCanvas.height = 340;
  const pCtx = posterCanvas.getContext('2d');
  pCtx.fillStyle = '#0f172a';
  pCtx.fillRect(0, 0, 256, 340);
  const glow = pCtx.createRadialGradient(128, 145, 12, 128, 145, 120);
  glow.addColorStop(0, '#fbbf24');
  glow.addColorStop(0.42, '#ea580c');
  glow.addColorStop(1, 'rgba(15, 23, 42, 0)');
  pCtx.fillStyle = glow;
  pCtx.fillRect(0, 0, 256, 340);
  pCtx.strokeStyle = 'rgba(248, 250, 252, 0.8)';
  pCtx.lineWidth = 2;
  pCtx.strokeRect(20, 20, 216, 300);
  pCtx.beginPath();
  pCtx.arc(128, 145, 56, 0, Math.PI * 2);
  pCtx.stroke();
  pCtx.fillStyle = 'rgba(248,250,252,0.85)';
  pCtx.font = '600 13px system-ui';
  pCtx.textAlign = 'center';
  pCtx.fillText('SOLSTICE ARCHIVE · 01', 128, 286);

  const posterTex = new THREE.CanvasTexture(posterCanvas);
  posterTex.colorSpace = THREE.SRGBColorSpace;
  textures.push(posterTex);

  roomGroup.add(rbox(0.06, 1.22, 0.92, 0.012, mats.matteMetal, [-3.58, 2.15, 2.08]));
  roomGroup.add(rbox(0.02, 1.12, 0.82, 0.005, new THREE.MeshStandardMaterial({ color: 0xe2e8f0, roughness: 0.8 }), [-3.555, 2.15, 2.08]));
  const posterMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(0.7, 0.98),
    new THREE.MeshStandardMaterial({ map: posterTex, roughness: 0.25 }),
  );
  posterMesh.rotation.y = Math.PI / 2;
  posterMesh.position.set(-3.543, 2.15, 2.08);
  roomGroup.add(posterMesh);

  // 3. Floating wall shelf above acoustic slats / right-back wall with art vinyl & clock
  roomGroup.add(rbox(1.3, 0.045, 0.26, 0.01, mats.walnut, [2.25, 3.18, -3.05]));
  // Mini framed vinyl record + stacked design monographs
  roomGroup.add(rbox(0.32, 0.32, 0.028, 0.006, new THREE.MeshStandardMaterial({ color: 0x0ea5e9, roughness: 0.4 }), [1.95, 3.36, -3.08], [-0.1, 0.14, 0]));
  roomGroup.add(rbox(0.24, 0.04, 0.18, 0.006, new THREE.MeshStandardMaterial({ color: 0xf43f5e, roughness: 0.6 }), [2.42, 3.22, -3.05]));
  roomGroup.add(rbox(0.22, 0.036, 0.17, 0.006, new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.6 }), [2.42, 3.258, -3.05]));

  // 4. Media shelf collector books & physical game cases (non-slot bays)
  const bookColors = [0xef4444, 0x3b82f6, 0x10b981, 0xf59e0b, 0x8b5cf6, 0xe2e8f0, 0x06b6d4];
  // Bottom-left beside Xbox (shelf bay x=-1.45..0, y=0.91) -> place books on middle-right bay (x=0.72, y=1.75)
  for (let i = 0; i < 6; i++) {
    const h = 0.28 + ((i * 7) % 5) * 0.025;
    const mat = new THREE.MeshStandardMaterial({ color: bookColors[i % bookColors.length], roughness: 0.55 });
    shelfGroup.add(rbox(0.042, h, 0.24, 0.006, mat, [0.36 + i * 0.048, 1.75 + h / 2, -0.04]));
  }
  // Leaning collector artbook on middle-right bay
  shelfGroup.add(rbox(0.24, 0.31, 0.032, 0.006, new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.35, metalness: 0.2 }), [1.02, 1.9, -0.06], [-0.14, -0.22, 0]));
  // Stacked Switch/PS5 cases in top-left beside Switch 2
  for (let i = 0; i < 4; i++) {
    const mat = new THREE.MeshStandardMaterial({ color: i % 2 === 0 ? 0xe11d48 : 0x2563eb, roughness: 0.4 });
    shelfGroup.add(rbox(0.026, 0.22, 0.16, 0.004, mat, [-1.22 + i * 0.032, 2.72, -0.04]));
  }

  return {
    dispose() {
      for (const tex of textures) tex.dispose();
    },
  };
}
