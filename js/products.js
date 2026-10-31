// The photo pipeline that turns any product photo into a cut-out at a real size.

import { cutoutAt } from './segment.js';

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
