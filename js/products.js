// Product viewer content: real-size sample models built from primitives, and the
// photo pipeline that turns any product photo into a cut-out at a real size.

import { THREE } from './stage.js';
import { cutoutAt } from './segment.js';

const mat = (color, roughness = 0.6, metalness = 0, extra = {}) =>
  new THREE.MeshStandardMaterial({ color, roughness, metalness, ...extra });

function box(w, h, d, material, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  m.position.set(x, y, z);
  return m;
}

function screenTexture() {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 288;
  const g = c.getContext('2d');
  const sky = g.createLinearGradient(0, 0, 0, 288);
  sky.addColorStop(0, '#1d3b6b'); sky.addColorStop(0.55, '#f08a4b'); sky.addColorStop(1, '#2a1d2e');
  g.fillStyle = sky; g.fillRect(0, 0, 512, 288);
  g.fillStyle = '#ffd59a'; g.beginPath(); g.arc(330, 150, 34, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#1a1424';
  g.beginPath(); g.moveTo(0, 210); g.lineTo(120, 150); g.lineTo(220, 200); g.lineTo(360, 140); g.lineTo(512, 205); g.lineTo(512, 288); g.lineTo(0, 288); g.fill();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function tv(inches) {
  const diag = inches * 0.0254;
  const w = diag * 0.8716, h = diag * 0.4903;
  const g = new THREE.Group();
  const cabW = Math.max(1.2, w + 0.3), cabH = 0.45;
  g.add(box(cabW, cabH, 0.4, mat(0x6b4f3a, 0.7), 0, cabH / 2, 0));
  g.add(box(0.25, 0.02, 0.18, mat(0x222222, 0.4, 0.5), 0, cabH + 0.01, 0));
  g.add(box(0.05, 0.08, 0.04, mat(0x222222, 0.4, 0.5), 0, cabH + 0.06, -0.02));
  const y = cabH + 0.1 + h / 2;
  g.add(box(w + 0.02, h + 0.02, 0.05, mat(0x0d0d0f, 0.35, 0.3), 0, y, -0.02));
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: screenTexture() }));
  screen.position.set(0, y, 0.006);
  g.add(screen);
  return { object: g, dims: { w: cabW, h: cabH + 0.11 + h, d: 0.4 }, label: `${inches}" TV · screen ${cm(w)} × ${cm(h)} cm` };
}

function sofa() {
  const g = new THREE.Group();
  const fabric = mat(0x5b6f78, 0.95), cushion = mat(0x6d8390, 0.95), legM = mat(0x2b2018, 0.6);
  g.add(box(2.0, 0.3, 0.88, fabric, 0, 0.27, 0));
  g.add(box(2.0, 0.5, 0.2, fabric, 0, 0.6, -0.34));
  for (const sx of [-1, 1]) g.add(box(0.2, 0.62, 0.88, fabric, sx * 0.9, 0.43, 0));
  for (let i = -1; i <= 1; i++) {
    g.add(box(0.52, 0.13, 0.64, cushion, i * 0.535, 0.485, 0.08));
    g.add(box(0.5, 0.38, 0.12, cushion, i * 0.535, 0.68, -0.2));
  }
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(box(0.05, 0.12, 0.05, legM, sx * 0.94, 0.06, sz * 0.38));
  return { object: g, dims: { w: 2.0, h: 0.85, d: 0.88 }, label: '3-seat sofa · 200 × 85 × 88 cm' };
}

function fridge() {
  const g = new THREE.Group();
  const body = mat(0xd5dadf, 0.3, 0.6), dark = mat(0x22262b, 0.5, 0.4);
  g.add(box(0.6, 1.75, 0.65, body, 0, 0.875, 0));
  g.add(box(0.602, 0.012, 0.652, dark, 0, 1.18, 0));
  g.add(box(0.03, 0.35, 0.04, dark, -0.24, 1.38, 0.34));
  g.add(box(0.03, 0.5, 0.04, dark, -0.24, 0.85, 0.34));
  return { object: g, dims: { w: 0.6, h: 1.75, d: 0.65 }, label: 'Double-door fridge · 60 × 175 × 65 cm' };
}

function lamp() {
  const g = new THREE.Group();
  const metal = mat(0x2a2a2e, 0.35, 0.8);
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.16, 0.03, 40), metal);
  base.position.y = 0.015;
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 1.42, 16), metal);
  pole.position.y = 0.74;
  const shade = new THREE.Mesh(
    new THREE.CylinderGeometry(0.14, 0.24, 0.3, 40, 1, true),
    mat(0xf3e3c3, 0.9, 0, { side: THREE.DoubleSide, emissive: 0xffc777, emissiveIntensity: 0.55 }),
  );
  shade.position.y = 1.5;
  const bulb = new THREE.PointLight(0xffc777, 2.2, 3);
  bulb.position.y = 1.45;
  g.add(base, pole, shade, bulb);
  return { object: g, dims: { w: 0.48, h: 1.65, d: 0.48 }, label: 'Floor lamp · 48 × 165 cm' };
}

function plant() {
  const g = new THREE.Group();
  const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.13, 0.32, 36), mat(0xb4673f, 0.85));
  pot.position.y = 0.16;
  const soil = new THREE.Mesh(new THREE.CircleGeometry(0.16, 32), mat(0x2f2219, 1));
  soil.rotation.x = -Math.PI / 2;
  soil.position.y = 0.3;
  g.add(pot, soil);
  const leaf = mat(0x3f7d4a, 0.7, 0, { side: THREE.DoubleSide });
  const leafGeo = new THREE.SphereGeometry(0.5, 16, 10);
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2 + (i % 2) * 0.3;
    const tiltA = 0.25 + (i % 3) * 0.18;
    const len = 0.55 + (i % 4) * 0.07;
    const l = new THREE.Mesh(leafGeo, leaf);
    l.scale.set(0.14, len, 0.02);
    l.position.set(Math.sin(a) * Math.sin(tiltA) * len * 0.5, 0.3 + Math.cos(tiltA) * len * 0.5, Math.cos(a) * Math.sin(tiltA) * len * 0.5);
    l.rotation.set(Math.cos(a) * tiltA, a, -Math.sin(a) * tiltA);
    g.add(l);
  }
  return { object: g, dims: { w: 0.7, h: 1.1, d: 0.7 }, label: 'Potted plant · 70 × 110 cm' };
}

export const SAMPLES = {
  tv: { name: 'Television', make: (opt) => tv(Number(opt) || 43), options: [32, 43, 55, 65] },
  sofa: { name: 'Sofa', make: sofa },
  fridge: { name: 'Fridge', make: fridge },
  lamp: { name: 'Floor lamp', make: lamp },
  plant: { name: 'Plant', make: plant },
};

const cm = (m) => Math.round(m * 100);

// ---------------------------------------------------------------- your own photo

const MAX_SIDE = 1024;

export async function loadPhoto(file) {
  if (!file.type.startsWith('image/')) throw new Error('That file is not an image. Choose a JPG, PNG or WebP photo.');
  let bmp;
  try { bmp = await createImageBitmap(file, { imageOrientation: 'from-image' }); } catch {
    throw new Error('Could not read that photo. Try a JPG or PNG.');
  }
  const s = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * s);
  c.height = Math.round(bmp.height * s);
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
  bmp.close?.();
  return c;
}

// Cuts out the object at (x, y) (0..1) and crops to it. Returns null when nothing was found.
export async function cutPhoto(photo, x, y) {
  const m = await cutoutAt(photo, x, y);
  return crop(photo, (px, py) => m.data[Math.min(m.h - 1, Math.floor(py * m.h / photo.height)) * m.w + Math.min(m.w - 1, Math.floor(px * m.w / photo.width))]);
}

// Uses the whole photo. A PNG with transparency keeps its own cutout.
export function wholePhoto(photo) {
  const px = photo.getContext('2d').getImageData(0, 0, photo.width, photo.height).data;
  return crop(photo, (x, y) => px[(y * photo.width + x) * 4 + 3] / 255);
}

function crop(photo, maskAt) {
  const W = photo.width, H = photo.height;
  const mask = new Float32Array(W * H);
  let x0 = W, y0 = H, x1 = -1, y1 = -1;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const v = maskAt(x, y);
    mask[y * W + x] = v;
    if (v > 0.5) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  }
  if (x1 < 0 || (x1 - x0) * (y1 - y0) < 400) return null;
  const pad = Math.round(Math.max(x1 - x0, y1 - y0) * 0.02);
  x0 = Math.max(0, x0 - pad); y0 = Math.max(0, y0 - pad);
  x1 = Math.min(W - 1, x1 + pad); y1 = Math.min(H - 1, y1 + pad);
  const w = x1 - x0 + 1, h = y1 - y0 + 1;
  // The colour canvas stays opaque (the 3D shader takes transparency from the mask, and
  // transparent canvas pixels would lose their colour and darken the edges); the preview bakes it in.
  const out = document.createElement('canvas');
  out.width = w; out.height = h;
  out.getContext('2d').drawImage(photo, x0, y0, w, h, 0, 0, w, h);
  const preview = document.createElement('canvas');
  preview.width = w; preview.height = h;
  const pctx = preview.getContext('2d');
  pctx.drawImage(out, 0, 0);
  const img = pctx.getImageData(0, 0, w, h);
  const alpha = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const a = mask[(y + y0) * W + x + x0];
    alpha[y * w + x] = a;
    img.data[(y * w + x) * 4 + 3] = Math.round(Math.min(1, Math.max(0, (a - 0.3) / 0.4)) * 255);
  }
  pctx.putImageData(img, 0, 0);
  return { canvas: out, preview, alpha, w, h, aspect: w / h };
}
