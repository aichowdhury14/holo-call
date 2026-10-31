// Procedural textures drawn on canvases: no image downloads, and every surface can be recoloured.

import * as THREE from 'three';

const cache = new Map();

// Seeded random so a texture looks the same on every load.
function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

function make(key, size, draw, { repeat = null, srgb = true } = {}) {
  if (cache.has(key)) return cache.get(key);
  const c = document.createElement('canvas');
  c.width = c.height = size;
  draw(c.getContext('2d'), size);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  if (repeat) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(repeat[0], repeat[1]);
  }
  cache.set(key, t);
  return t;
}

// Clones share the canvas but keep their own repeat.
export function repeated(tex, x, y) {
  const t = tex.clone();
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(x, y);
  t.needsUpdate = true;
  return t;
}

function shade(hex, f) {
  const c = new THREE.Color(hex);
  c.offsetHSL(0, 0, f);
  return `#${c.getHexString()}`;
}

// Long-grain wood, e.g. segun (teak) or mahogany.
export function wood(tone = '#7a4a2b') {
  return make(`wood${tone}`, 512, (g, n) => {
    const r = rng(tone.length * 97 + parseInt(tone.slice(1), 16));
    g.fillStyle = tone;
    g.fillRect(0, 0, n, n);
    for (let i = 0; i < 140; i++) {
      const y0 = r() * n, amp = 2 + r() * 6, freq = 0.004 + r() * 0.01, ph = r() * 6;
      g.strokeStyle = r() < 0.6 ? shade(tone, -0.06 - r() * 0.08) : shade(tone, 0.04 + r() * 0.05);
      g.globalAlpha = 0.25 + r() * 0.35;
      g.lineWidth = 0.6 + r() * 2.2;
      g.beginPath();
      for (let x = 0; x <= n; x += 8) {
        const y = y0 + Math.sin(x * freq + ph) * amp + Math.sin(x * freq * 3.1) * amp * 0.3;
        if (x === 0) g.moveTo(x, y); else g.lineTo(x, y);
      }
      g.stroke();
    }
    g.globalAlpha = 1;
  });
}

// 60 × 60 cm glazed floor tile with soft marble clouds and grout; one canvas = one tile.
export function floorTile(tone = '#e8e0d2') {
  return make(`tile${tone}`, 512, (g, n) => {
    const r = rng(7);
    g.fillStyle = tone;
    g.fillRect(0, 0, n, n);
    for (let i = 0; i < 40; i++) {
      const x = r() * n, y = r() * n, rad = 60 + r() * 140;
      const grad = g.createRadialGradient(x, y, 0, x, y, rad);
      const col = r() < 0.5 ? shade(tone, -0.05) : shade(tone, 0.03);
      grad.addColorStop(0, col);
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      g.globalAlpha = 0.14;
      g.fillStyle = grad;
      g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
    }
    g.globalAlpha = 0.1;
    g.strokeStyle = shade(tone, -0.18);
    for (let i = 0; i < 5; i++) {
      g.lineWidth = 0.8 + r() * 1.2;
      g.beginPath();
      let x = r() * n, y = r() * n;
      g.moveTo(x, y);
      for (let k = 0; k < 12; k++) { x += (r() - 0.3) * 60; y += (r() - 0.5) * 60; g.lineTo(x, y); }
      g.stroke();
    }
    g.globalAlpha = 1;
    g.fillStyle = shade(tone, -0.22);
    g.fillRect(0, 0, n, 3); g.fillRect(0, 0, 3, n);
  });
}

// Matte emulsion paint with a faint roller texture.
export function wallPaint(tone) {
  return make(`wall${tone}`, 256, (g, n) => {
    const r = rng(3);
    g.fillStyle = tone;
    g.fillRect(0, 0, n, n);
    for (let i = 0; i < 1800; i++) {
      g.fillStyle = r() < 0.5 ? shade(tone, -0.025) : shade(tone, 0.02);
      g.globalAlpha = 0.5;
      g.fillRect(r() * n, r() * n, 2, 2);
    }
    g.globalAlpha = 1;
  });
}

// Woven upholstery fabric.
export function fabric(tone) {
  return make(`fabric${tone}`, 256, (g, n) => {
    g.fillStyle = tone;
    g.fillRect(0, 0, n, n);
    g.globalAlpha = 0.18;
    for (let i = 0; i < n; i += 3) {
      g.fillStyle = shade(tone, -0.12);
      g.fillRect(i, 0, 1, n);
      g.fillStyle = shade(tone, 0.08);
      g.fillRect(0, i + 1, n, 1);
    }
    g.globalAlpha = 1;
  });
}

// Glossy coloured-glass fridge door with a printed flower pattern, as sold widely in Bangladesh.
export function floralGlass(base, petal) {
  return make(`glass${base}${petal}`, 512, (g, n) => {
    const r = rng(11);
    const grad = g.createLinearGradient(0, 0, n, n);
    grad.addColorStop(0, shade(base, 0.08));
    grad.addColorStop(1, shade(base, -0.08));
    g.fillStyle = grad;
    g.fillRect(0, 0, n, n);
    const flower = (x, y, s) => {
      g.fillStyle = petal;
      for (let k = 0; k < 6; k++) {
        const a = (k / 6) * Math.PI * 2;
        g.beginPath();
        g.ellipse(x + Math.cos(a) * s * 0.55, y + Math.sin(a) * s * 0.55, s * 0.5, s * 0.22, a, 0, Math.PI * 2);
        g.fill();
      }
      g.fillStyle = shade(petal, 0.25);
      g.beginPath(); g.arc(x, y, s * 0.22, 0, Math.PI * 2); g.fill();
    };
    g.globalAlpha = 0.85;
    g.strokeStyle = shade(petal, -0.15);
    g.lineWidth = 3;
    g.beginPath();
    g.moveTo(n * 0.15, n);
    g.bezierCurveTo(n * 0.4, n * 0.7, n * 0.1, n * 0.45, n * 0.45, n * 0.2);
    g.stroke();
    for (let i = 0; i < 7; i++) flower(n * (0.15 + r() * 0.4), n * (0.15 + r() * 0.75), 24 + r() * 26);
    g.globalAlpha = 1;
  });
}

// Simple vertical gradient, e.g. the sky outside a window.
export function gradient(key, stops) {
  return make(`grad${key}`, 256, (g, n) => {
    const grad = g.createLinearGradient(0, 0, 0, n);
    stops.forEach(([p, c]) => grad.addColorStop(p, c));
    g.fillStyle = grad;
    g.fillRect(0, 0, n, n);
  });
}

// Mosquito-net mesh: fine white threads on a transparent background.
export function netting() {
  return make('net', 128, (g, n) => {
    g.clearRect(0, 0, n, n);
    g.strokeStyle = 'rgba(255,255,255,0.9)';
    g.lineWidth = 1;
    for (let i = 0; i <= n; i += 8) {
      g.beginPath(); g.moveTo(i + 0.5, 0); g.lineTo(i + 0.5, n); g.stroke();
      g.beginPath(); g.moveTo(0, i + 0.5); g.lineTo(n, i + 0.5); g.stroke();
    }
  });
}

// Polished black granite kitchen slab.
export function granite() {
  return make('granite', 512, (g, n) => {
    const r = rng(5);
    g.fillStyle = '#1b1b1d';
    g.fillRect(0, 0, n, n);
    for (let i = 0; i < 6000; i++) {
      const v = r();
      g.fillStyle = v < 0.7 ? 'rgba(80,80,86,0.6)' : v < 0.93 ? 'rgba(140,140,150,0.6)' : 'rgba(200,190,170,0.7)';
      const s = 1 + r() * 2.5;
      g.fillRect(r() * n, r() * n, s, s);
    }
  });
}

// Glossy white 30 × 30 cm kitchen wall tiles; one canvas = 2 × 2 tiles.
export function kitchenTile() {
  return make('ktile', 256, (g, n) => {
    g.fillStyle = '#f4f4f1';
    g.fillRect(0, 0, n, n);
    g.fillStyle = '#c9c7bf';
    for (const p of [0, n / 2]) { g.fillRect(p, 0, 2, n); g.fillRect(0, p, n, 2); }
  });
}
