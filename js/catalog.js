// Real-size product models for the Bangladesh home, built from primitives with procedural
// textures. Each factory returns { object, dims, place, mountY, label, controls, tv? }.
// object.userData.update(t, dt) animates it; any part's userData.onTap(hit) reacts to taps.

import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/RoundedBoxGeometry.js';
import * as tx from './textures.js';
import { SmartTV } from './smarttv.js';

const std = (o) => new THREE.MeshStandardMaterial(o);
const phys = (o) => new THREE.MeshPhysicalMaterial(o);
const cm = (m) => Math.round(m * 100);
const ease = (cur, target, dt, speed = 5) => cur + (target - cur) * Math.min(1, dt * speed);

function rbox(w, h, d, mat, x = 0, y = 0, z = 0, r = 0.01) {
  const rr = Math.min(r, w / 2 - 1e-4, h / 2 - 1e-4, d / 2 - 1e-4);
  const geo = rr > 0.0005 ? new RoundedBoxGeometry(w, h, d, 3, rr) : new THREE.BoxGeometry(w, h, d);
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  return m;
}

function cyl(rt, rb, h, mat, x = 0, y = 0, z = 0, seg = 32) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat);
  m.position.set(x, y, z);
  return m;
}

// A hinged part: rotate the returned pivot's y to open it.
function hinge(x, y, z) {
  const p = new THREE.Group();
  p.position.set(x, y, z);
  return p;
}

const chrome = () => std({ color: 0xd9dde2, metalness: 1, roughness: 0.18 });
const blackGloss = () => phys({ color: 0x0b0b0d, roughness: 0.12, metalness: 0.2, clearcoat: 1, clearcoatRoughness: 0.05 });

// ---------------------------------------------------------------- Smart TV on a cabinet

function smartTV(size) {
  const inches = Number(size) || 43;
  const diag = inches * 0.0254, w = diag * 0.8716, h = diag * 0.4903;
  const g = new THREE.Group();
  const woodM = std({ map: tx.wood('#5b3b24'), roughness: 0.48 });
  const inner = std({ color: 0x2a1c12, roughness: 0.8 });
  const metal = std({ color: 0x8c8f94, metalness: 0.9, roughness: 0.3 });

  // Wooden TV cabinet: two drawers and an open centre shelf with a set-top box and Wi-Fi router.
  const cabW = Math.min(1.9, Math.max(1.2, w + 0.35)), cabH = 0.5, cabD = 0.42, legH = 0.09;
  g.add(rbox(cabW, 0.035, cabD, woodM, 0, cabH - 0.0175, 0, 0.008));
  g.add(rbox(cabW, 0.03, cabD, woodM, 0, legH + 0.015, 0, 0.006));
  for (const sx of [-1, 1]) g.add(rbox(0.03, cabH - legH - 0.035, cabD, woodM, sx * (cabW / 2 - 0.015), legH + (cabH - legH - 0.035) / 2, 0, 0.004));
  g.add(rbox(cabW - 0.04, cabH - legH - 0.05, 0.012, inner, 0, legH + (cabH - legH) / 2, -cabD / 2 + 0.01, 0));
  const third = (cabW - 0.06) / 3;
  for (const sx of [-1, 1]) {
    g.add(rbox(0.02, cabH - legH - 0.065, cabD - 0.02, woodM, sx * third / 2, legH + (cabH - legH) / 2, 0, 0.003));
    const front = rbox(third - 0.012, cabH - legH - 0.075, 0.022, woodM, sx * third, legH + (cabH - legH) / 2, cabD / 2 - 0.006, 0.006);
    g.add(front);
    g.add(rbox(0.14, 0.014, 0.02, metal, sx * third, legH + (cabH - legH) / 2 + 0.05, cabD / 2 + 0.014, 0.006));
  }
  g.add(rbox(third - 0.01, 0.018, cabD - 0.04, woodM, 0, legH + 0.2, 0, 0.003));
  const stb = rbox(0.21, 0.04, 0.15, blackGloss(), 0, legH + 0.05, 0.02, 0.008);
  const stbLed = new THREE.Mesh(new THREE.SphereGeometry(0.003, 8, 8), new THREE.MeshBasicMaterial({ color: 0x33ff77 }));
  stbLed.position.set(0.08, legH + 0.05, 0.096);
  const router = rbox(0.17, 0.03, 0.12, std({ color: 0xf2f2f0, roughness: 0.4 }), 0, legH + 0.226, 0, 0.01);
  for (const sx of [-0.06, 0.06]) {
    const ant = cyl(0.005, 0.006, 0.14, std({ color: 0xf2f2f0 }), sx, legH + 0.3, -0.05, 10);
    ant.rotation.z = sx * 2;
    g.add(ant);
  }
  g.add(stb, stbLed, router);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(cyl(0.022, 0.014, legH, woodM, sx * (cabW / 2 - 0.06), legH / 2, sz * (cabD / 2 - 0.06), 16));

  // The TV: thin glossy panel on two slim feet, thicker housing at the back.
  const feetH = 0.075, tvY = cabH + feetH + h / 2 + 0.008;
  const panel = rbox(w + 0.014, h + 0.014, 0.026, blackGloss(), 0, tvY, 0, 0.004);
  g.add(panel);
  g.add(rbox(w * 0.6, h * 0.6, 0.045, std({ color: 0x151517, roughness: 0.7 }), 0, tvY - h * 0.08, -0.03, 0.02));
  for (const sx of [-1, 1]) {
    const fx = sx * (w / 2 - Math.min(0.14, w * 0.12));
    const foot = rbox(0.022, feetH, 0.18, std({ color: 0x2b2c30, metalness: 0.7, roughness: 0.35 }), fx, cabH + feetH / 2, -0.01, 0.006);
    foot.rotation.z = sx * 0.1;
    g.add(foot);
  }
  const tv = new SmartTV();
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tv.texture, toneMapped: false }));
  screen.position.set(0, tvY, 0.0135);
  screen.userData.shadow = false;
  screen.userData.onTap = (hit) => tv.tap(hit.uv);
  g.add(screen);
  // Glossy glass layer so the panel reflects the room when off.
  const glass = new THREE.Mesh(new THREE.PlaneGeometry(w, h), phys({ color: 0x000000, transparent: true, opacity: 0.22, roughness: 0.05, metalness: 0, clearcoat: 1 }));
  glass.position.set(0, tvY, 0.0137);
  glass.userData.shadow = false;
  glass.raycast = () => {};
  g.add(glass);
  const led = new THREE.Mesh(new THREE.SphereGeometry(0.0035, 8, 8), new THREE.MeshBasicMaterial({ color: 0xff2a2a }));
  led.position.set(0, tvY - h / 2 - 0.004, 0.015);
  g.add(led);
  g.userData.update = (t) => { tv.tick(t); led.visible = !tv.on; glass.material.opacity = tv.on ? 0.06 : 0.22; };

  return {
    object: g,
    dims: { w: Math.max(cabW, w), h: tvY + h / 2 + 0.01, d: cabD },
    place: 'wall',
    label: `${inches}" 4K smart TV · screen ${cm(w)} × ${cm(h)} cm · cabinet ${cm(cabW)} cm`,
    tv,
    controls: [{ id: 'power', label: () => (tv.on ? 'Turn off' : 'Turn on'), pressed: () => tv.on, run: () => tv.power() }],
    dispose: () => tv.dispose(),
  };
}

// ---------------------------------------------------------------- Refrigerator

const FRIDGE_FINISH = {
  'Maroon floral': ['#5c1420', '#e3a6ad'],
  'Blue floral': ['#173a66', '#a7cdf0'],
  Silver: null,
};

function fridge(finish = 'Maroon floral') {
  const W = 0.6, H = 1.62, D = 0.66, T = 0.025, plinth = 0.07, freezerH = 0.44;
  const g = new THREE.Group();
  const colours = FRIDGE_FINISH[finish];
  const bodyMat = colours
    ? phys({ color: new THREE.Color(colours[0]).multiplyScalar(0.8), metalness: 0.3, roughness: 0.3, clearcoat: 0.6 })
    : std({ color: 0xc4c8cc, metalness: 0.75, roughness: 0.32 });
  const doorMat = colours
    ? phys({ map: tx.floralGlass(colours[0], colours[1]), roughness: 0.12, metalness: 0.1, clearcoat: 1, clearcoatRoughness: 0.04 })
    : std({ color: 0xcfd3d7, metalness: 0.8, roughness: 0.28 });
  const liner = std({ color: 0xf4f6f7, roughness: 0.55 });
  const shelfMat = phys({ color: 0xdff3ff, transparent: true, opacity: 0.35, roughness: 0.05 });

  const shellD = D - 0.05, zc = -0.025;  // the doors take the front 5 cm
  g.add(rbox(W, plinth, shellD - 0.04, std({ color: 0x1d1f22, roughness: 0.8 }), 0, plinth / 2, zc - 0.02, 0.005));
  for (const sx of [-1, 1]) g.add(rbox(T, H - plinth, shellD, bodyMat, sx * (W / 2 - T / 2), plinth + (H - plinth) / 2, zc, 0.008));
  g.add(rbox(W, T, shellD, bodyMat, 0, H - T / 2, zc, 0.008));
  g.add(rbox(W, T, shellD, bodyMat, 0, plinth + T / 2, zc, 0.004));
  g.add(rbox(W, H - plinth, T, bodyMat, 0, plinth + (H - plinth) / 2, zc - shellD / 2 + T / 2, 0.004));
  // White liner and the divider between freezer and fridge.
  const iw = W - 2 * T, ih = H - plinth - 2 * T, idp = shellD - T;
  g.add(rbox(iw, ih, 0.004, liner, 0, plinth + T + ih / 2, zc - shellD / 2 + T + 0.003, 0));
  for (const sx of [-1, 1]) g.add(rbox(0.004, ih, idp, liner, sx * (iw / 2 - 0.002), plinth + T + ih / 2, zc + T / 2, 0));
  const divY = H - freezerH;
  g.add(rbox(iw, 0.05, idp, liner, 0, divY, zc + T / 2, 0.01));
  for (const y of [0.42, 0.72]) g.add(rbox(iw - 0.01, 0.006, idp - 0.06, shelfMat, 0, y, zc, 0));
  g.add(rbox(iw - 0.01, 0.006, idp - 0.06, shelfMat, 0, divY + 0.2, zc, 0));
  g.add(rbox(iw - 0.04, 0.14, idp - 0.12, phys({ color: 0xe8f6ff, transparent: true, opacity: 0.5, roughness: 0.1 }), 0, plinth + T + 0.08, zc + 0.02, 0.01));

  // Food: a steel bowl of curry, bottles, tomatoes, a pack of frozen fish, ice tray.
  const steel = std({ color: 0xcfd4d8, metalness: 1, roughness: 0.25 });
  const bowl = cyl(0.09, 0.07, 0.08, steel, -0.12, 0.465, zc - 0.05);
  g.add(bowl, rbox(0.17, 0.006, 0.17, steel, -0.12, 0.508, zc - 0.05, 0.003));
  const bottleMat = phys({ color: 0x9ad7ff, transparent: true, opacity: 0.55, roughness: 0.05 });
  for (let i = 0; i < 3; i++) g.add(cyl(0.032, 0.032, 0.25, bottleMat, 0.08 + i * 0.07, 0.85, zc - 0.12, 16));
  const tomato = std({ color: 0xc2271b, roughness: 0.35 });
  for (let i = 0; i < 5; i++) {
    const s = new THREE.Mesh(new THREE.SphereGeometry(0.03, 14, 10), tomato);
    s.position.set(-0.15 + (i % 3) * 0.07, 0.18 + Math.floor(i / 3) * 0.05, zc + 0.05 + (i % 2) * 0.04);
    g.add(s);
  }
  g.add(rbox(0.26, 0.05, 0.18, std({ color: 0xe2e8ee, roughness: 0.4 }), -0.05, divY + 0.07, zc - 0.05, 0.01));
  g.add(rbox(0.12, 0.03, 0.26, std({ color: 0x8fc8ff, transparent: true, opacity: 0.7 }), 0.13, divY + 0.04, zc, 0.006));
  const lamp = new THREE.PointLight(0xf3fbff, 0, 0.9);
  lamp.position.set(0, divY - 0.1, zc + 0.1);
  g.add(lamp);

  // Two doors hinged on the right; the handle groove runs down the left edge.
  const doors = [];
  const makeDoor = (y0, hgt, label) => {
    const p = hinge(W / 2, y0 + hgt / 2, D / 2 - 0.05);
    const panel = rbox(W, hgt - 0.006, 0.05, doorMat, -W / 2, 0, 0.025, 0.012);
    p.add(panel);
    p.add(rbox(0.022, Math.min(0.32, hgt * 0.55), 0.03, std({ color: 0x2a2d31, metalness: 0.6, roughness: 0.35 }), -W + 0.03, hgt * (label === 'freezer' ? -0.2 : 0.3), 0.055, 0.008));
    p.add(rbox(W - 0.06, hgt - 0.08, 0.008, liner, -W / 2, 0, -0.002, 0));
    for (let k = 0; k < (label === 'freezer' ? 1 : 3); k++) {
      const bin = rbox(W - 0.1, 0.07, 0.07, phys({ color: 0xe8f6ff, transparent: true, opacity: 0.6 }), -W / 2, -hgt / 2 + 0.16 + k * (hgt - 0.25) / 3, -0.04, 0.006);
      p.add(bin);
    }
    if (label === 'main') for (let i = 0; i < 3; i++) p.add(cyl(0.025, 0.025, 0.2, bottleMat, -W + 0.12 + i * 0.07, -hgt / 2 + 0.24, -0.04, 12));
    const door = { pivot: p, open: false, angle: 0 };
    panel.userData.onTap = () => { door.open = !door.open; };
    doors.push(door);
    g.add(p);
  };
  makeDoor(divY - 0.02, H - divY + 0.02, 'freezer');
  makeDoor(plinth, divY - plinth - 0.02, 'main');

  g.userData.update = (t, dt) => {
    let anyOpen = false;
    for (const d of doors) {
      d.angle = ease(d.angle, d.open ? 1.9 : 0, dt, 4);
      d.pivot.rotation.y = d.angle;
      anyOpen ||= d.angle > 0.05;
    }
    lamp.intensity = ease(lamp.intensity, anyOpen ? 1.3 : 0, dt, 8);
  };

  return {
    object: g,
    dims: { w: W, h: H, d: D },
    place: 'wall',
    label: `2-door refrigerator · ${finish.toLowerCase()} · 260 L · 60 × 162 × 66 cm`,
    controls: [{
      id: 'doors',
      label: () => (doors.some((d) => d.open) ? 'Close doors' : 'Open doors'),
      pressed: () => doors.some((d) => d.open),
      run: () => { const open = !doors.some((d) => d.open); doors.forEach((d) => { d.open = open; }); },
    }],
  };
}

// ---------------------------------------------------------------- Ceiling fan

const FAN_FINISH = { Brown: ['#6b4a2f', '#5a3b25'], White: ['#f1efe9', '#ece9e1'], Ivory: ['#e6dbc3', '#d9cdb2'] };

function ceilingFan(finish = 'Brown') {
  const [bodyC, bladeC] = FAN_FINISH[finish] || FAN_FINISH.Brown;
  const g = new THREE.Group();  // origin = ceiling
  const body = std({ color: bodyC, metalness: 0.35, roughness: 0.4 });
  const gold = std({ color: 0xc9a25a, metalness: 1, roughness: 0.3 });
  g.add(cyl(0.07, 0.085, 0.07, body, 0, -0.035, 0));
  g.add(cyl(0.012, 0.012, 0.3, std({ color: bodyC, metalness: 0.6, roughness: 0.3 }), 0, -0.22, 0, 12));
  const motorY = -0.42;
  g.add(cyl(0.1, 0.14, 0.06, body, 0, motorY + 0.03, 0, 48));
  g.add(cyl(0.142, 0.142, 0.012, gold, 0, motorY - 0.003, 0, 48));
  g.add(cyl(0.14, 0.1, 0.06, body, 0, motorY - 0.04, 0, 48));
  g.add(cyl(0.035, 0.025, 0.04, gold, 0, motorY - 0.09, 0, 24));

  const rotor = new THREE.Group();
  rotor.position.y = motorY;
  const bladeMat = finish === 'Brown'
    ? std({ map: tx.wood(bladeC), roughness: 0.5, transparent: true })
    : std({ color: bladeC, roughness: 0.45, transparent: true });
  const R = 0.71;  // 56-inch sweep
  for (let i = 0; i < 3; i++) {
    const arm = new THREE.Group();
    arm.rotation.y = (i / 3) * Math.PI * 2;
    arm.add(rbox(0.13, 0.01, 0.045, std({ color: 0x9a9da3, metalness: 0.9, roughness: 0.3 }), 0.17, 0, 0, 0.003));
    const blade = rbox(R - 0.2, 0.007, 0.115, bladeMat, 0.2 + (R - 0.2) / 2, 0.004, 0, 0.003);
    blade.rotation.x = 0.16;
    arm.add(blade);
    rotor.add(arm);
  }
  const blur = new THREE.Mesh(new THREE.RingGeometry(0.22, R, 64).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({
    color: bladeC, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide,
  }));
  blur.position.y = motorY;
  blur.userData.shadow = false;
  g.add(rotor, blur);

  const SPEEDS = [0, 2.2, 4.5, 7.5, 11, 15];  // rad/s on screen, spaced like a regulator
  const state = { speed: 0, spin: 0 };
  g.children.forEach((c) => { if (c !== rotor && c !== blur) c.userData.onTap = () => { state.speed = (state.speed + 1) % 6; }; });
  g.userData.update = (t, dt) => {
    state.spin = ease(state.spin, SPEEDS[state.speed], dt, 0.8);  // motors spin up and down slowly
    rotor.rotation.y -= state.spin * dt;
    const blurK = Math.max(0, Math.min(1, (state.spin - 4) / 9));
    blur.material.opacity = blurK * 0.45;
    bladeMat.opacity = 1 - blurK * 0.75;
  };

  return {
    object: g,
    dims: { w: 2 * R, h: 0.52, d: 2 * R },
    place: 'ceiling',
    label: `56" ceiling fan · ${finish.toLowerCase()} · 142 cm sweep`,
    controls: [
      { id: 'slower', label: () => 'Slower', run: () => { state.speed = Math.max(0, state.speed - 1); } },
      { id: 'speed', label: () => (state.speed ? `Speed ${state.speed} of 5` : 'Fan off'), pressed: () => state.speed > 0, run: () => { state.speed = state.speed ? 0 : 3; } },
      { id: 'faster', label: () => 'Faster', run: () => { state.speed = Math.min(5, state.speed + 1); } },
    ],
  };
}

// ---------------------------------------------------------------- Split AC

function splitAC() {
  const W = 0.98, H = 0.32, D = 0.24;
  const g = new THREE.Group();  // origin = bottom of the unit, against the wall
  const white = phys({ color: 0xf7f7f5, roughness: 0.3, clearcoat: 0.5 });
  g.add(rbox(W, H, D, white, 0, H / 2, 0, 0.05));
  g.add(rbox(W - 0.04, H * 0.55, 0.006, phys({ color: 0xfafafa, roughness: 0.15, clearcoat: 1 }), 0, H * 0.62, D / 2 - 0.004, 0.003));
  g.add(rbox(W - 0.12, 0.03, 0.02, std({ color: 0x2b2e33 }), 0, 0.04, D / 2 - 0.02, 0));
  // Display with the set temperature.
  const dc = document.createElement('canvas');
  dc.width = 128; dc.height = 64;
  const dtex = new THREE.CanvasTexture(dc);
  dtex.colorSpace = THREE.SRGBColorSpace;
  const display = new THREE.Mesh(new THREE.PlaneGeometry(0.08, 0.04), new THREE.MeshBasicMaterial({ map: dtex, toneMapped: false }));
  display.position.set(W * 0.32, H * 0.42, D / 2 + 0.001);
  display.userData.shadow = false;
  g.add(display);
  // The louver flap swings open when cooling.
  const flapPivot = hinge(0, 0.06, D / 2 - 0.01);
  flapPivot.add(rbox(W - 0.1, 0.01, 0.075, white, 0, 0, -0.037, 0.004));
  g.add(flapPivot);
  g.add(rbox(0.06, 0.06, 0.12, std({ color: 0xeeeeea, roughness: 0.6 }), W / 2 + 0.04, 0.05, -D / 2 + 0.06, 0.01));
  // Cool air drifting down and out.
  const N = 140, pos = new Float32Array(N * 3), life = new Float32Array(N);
  for (let i = 0; i < N; i++) life[i] = Math.random();
  const airGeo = new THREE.BufferGeometry();
  airGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const air = new THREE.Points(airGeo, new THREE.PointsMaterial({ color: 0xd8f2ff, size: 0.035, transparent: true, opacity: 0, depthWrite: false }));
  air.userData.shadow = false;
  g.add(air);

  const state = { on: false, temp: 24, flap: 0 };
  const drawDisplay = () => {
    const c = dc.getContext('2d');
    c.fillStyle = '#0c1014'; c.fillRect(0, 0, 128, 64);
    if (state.on) {
      c.fillStyle = '#6fd3ff'; c.font = '700 40px "Instrument Sans", system-ui, sans-serif'; c.textAlign = 'center';
      c.fillText(`${state.temp}°`, 64, 47);
    }
    dtex.needsUpdate = true;
  };
  drawDisplay();
  g.children[0].userData.onTap = () => { state.on = !state.on; drawDisplay(); };
  g.userData.update = (t, dt) => {
    state.flap = ease(state.flap, state.on ? 1 : 0, dt, 2);
    flapPivot.rotation.x = state.flap * 0.95;
    air.material.opacity = state.flap * 0.38;
    for (let i = 0; i < N; i++) {
      life[i] += dt * 0.45;
      if (life[i] > 1) life[i] -= 1;
      const k = life[i], lane = (i / N - 0.5) * (W - 0.15);
      pos[i * 3] = lane + Math.sin(i * 12.9 + t) * 0.02;
      pos[i * 3 + 1] = 0.04 - k * 1.1;
      pos[i * 3 + 2] = D / 2 + 0.02 + k * 0.9;
    }
    airGeo.attributes.position.needsUpdate = true;
  };
  const setTemp = (d) => { state.temp = Math.max(16, Math.min(30, state.temp + d)); if (!state.on) state.on = true; drawDisplay(); };

  return {
    object: g,
    dims: { w: W, h: H, d: D },
    place: 'wallHigh',
    mountY: 2.15,
    label: '1.5 ton split AC · indoor unit 98 × 32 × 24 cm · mounted at 7 ft',
    controls: [
      { id: 'power', label: () => (state.on ? 'Turn off' : 'Turn on'), pressed: () => state.on, run: () => { state.on = !state.on; drawDisplay(); } },
      { id: 'cooler', label: () => '−', aria: 'Lower temperature', run: () => setTemp(-1) },
      { id: 'temp', label: () => `${state.temp} °C`, run: () => {} },
      { id: 'warmer', label: () => '+', aria: 'Raise temperature', run: () => setTemp(1) },
    ],
  };
}

// ---------------------------------------------------------------- Steel almirah

const ALMIRAH_FINISH = { Coffee: '#5a3d2b', Olive: '#56603f', Grey: '#7a8087', Cream: '#d9cdb2' };

function almirah(finish = 'Coffee') {
  const W = 0.91, H = 1.98, D = 0.51, T = 0.02, base = 0.08;
  const g = new THREE.Group();
  const paint = phys({ color: ALMIRAH_FINISH[finish] || ALMIRAH_FINISH.Coffee, metalness: 0.35, roughness: 0.28, clearcoat: 0.8, clearcoatRoughness: 0.1 });
  const insideMat = phys({ color: new THREE.Color(ALMIRAH_FINISH[finish] || ALMIRAH_FINISH.Coffee).offsetHSL(0, -0.05, 0.12), metalness: 0.3, roughness: 0.4 });
  const shellD = D - 0.025, zc = -0.0125;
  g.add(rbox(W - 0.02, base, shellD - 0.03, std({ color: 0x1b1b1d, roughness: 0.7 }), 0, base / 2, zc, 0.004));
  for (const sx of [-1, 1]) g.add(rbox(T, H - base, shellD, paint, sx * (W / 2 - T / 2), base + (H - base) / 2, zc, 0.006));
  g.add(rbox(W + 0.02, 0.035, shellD + 0.02, paint, 0, H - 0.0175, zc, 0.008));
  g.add(rbox(W, T, shellD, insideMat, 0, base + T / 2, zc, 0));
  g.add(rbox(W, H - base, T, insideMat, 0, base + (H - base) / 2, zc - shellD / 2 + T / 2, 0));
  const shelves = [0.62, 1.08, 1.5];
  for (const y of shelves) g.add(rbox(W - 2 * T, 0.012, shellD - T, insideMat, 0, y, zc + T / 2, 0));
  // Inner locker box with its own small door and keyhole.
  g.add(rbox(0.36, 0.2, shellD - 0.06, paint, -0.2, shelves[1] + 0.106, zc, 0.006));
  g.add(cyl(0.009, 0.009, 0.01, chrome(), -0.06, shelves[1] + 0.11, zc + shellD / 2 - 0.025, 12).rotateX(Math.PI / 2));
  // Folded clothes: sarees, shirts and lungis in stacks.
  const colours = [0xb22234, 0x1f7a4c, 0x2a4d8f, 0xe0a526, 0x7b2d6b, 0xf2efe6, 0x3a3a3a, 0xd4553a];
  let k = 0;
  for (const [y, xs] of [[base + T, [-0.25, 0, 0.25]], [shelves[0] + 0.006, [-0.25, 0.05, 0.27]], [shelves[1] + 0.006, [0.16, 0.32]], [shelves[2] + 0.006, [-0.25, 0.1]]]) {
    for (const x of xs) {
      let yy = y;
      const n = 3 + (k % 3);
      for (let i = 0; i < n; i++) {
        const th = 0.035 + ((k + i) % 3) * 0.01;
        g.add(rbox(0.22, th, 0.3, std({ map: tx.fabric(`#${new THREE.Color(colours[(k + i) % colours.length]).getHexString()}`), roughness: 0.95 }), x, yy + th / 2, zc + 0.02, 0.012));
        yy += th;
      }
      k++;
    }
  }
  // Two doors: mirror on the left, handle and lock on the right.
  const doors = [];
  for (const side of [-1, 1]) {
    const p = hinge(side * W / 2, base + (H - base - 0.035) / 2, D / 2 - 0.025);
    const dw = W / 2 - 0.004, dh = H - base - 0.045;
    const panel = rbox(dw, dh, 0.022, paint, -side * dw / 2, 0, 0.011, 0.006);
    p.add(panel);
    p.add(rbox(dw - 0.08, dh - 0.12, 0.006, paint, -side * dw / 2, 0, 0.024, 0.01));
    if (side === -1) {
      p.add(rbox(dw - 0.14, dh * 0.55, 0.004, phys({ color: 0xdfe6ea, metalness: 1, roughness: 0.03 }), dw / 2, 0.12, 0.029, 0.004));
    } else {
      p.add(rbox(0.024, 0.2, 0.03, chrome(), -dw + 0.05, 0.02, 0.04, 0.008));
      p.add(cyl(0.012, 0.012, 0.012, chrome(), -dw + 0.05, 0.16, 0.03, 16).rotateX(Math.PI / 2));
    }
    const door = { pivot: p, side, open: false, angle: 0 };
    panel.userData.onTap = () => { door.open = !door.open; };
    doors.push(door);
    g.add(p);
  }
  g.userData.update = (t, dt) => {
    // Left door (side -1) hinges on the left and swings with negative y rotation, the right one positive.
    for (const d of doors) { d.angle = ease(d.angle, d.open ? 1.75 : 0, dt, 4); d.pivot.rotation.y = d.side * d.angle; }
  };
  return {
    object: g,
    dims: { w: W, h: H, d: D },
    place: 'wall',
    label: `Steel almirah · ${finish.toLowerCase()} · 3 × 6.5 ft (91 × 198 × 51 cm)`,
    controls: [{
      id: 'doors',
      label: () => (doors.some((d) => d.open) ? 'Close doors' : 'Open doors'),
      pressed: () => doors.some((d) => d.open),
      run: () => { const open = !doors.some((d) => d.open); doors.forEach((d) => { d.open = open; }); },
    }],
  };
}

// ---------------------------------------------------------------- Wooden sofa

const SOFA_FABRIC = { Maroon: '#6e1f2b', Olive: '#5d6b3a', Navy: '#24344f', Beige: '#b9a789' };

function sofa(fabricName = 'Maroon') {
  const W = 2.0, H = 0.88, D = 0.82;
  const g = new THREE.Group();
  const wood = std({ map: tx.wood('#7a4a26'), roughness: 0.42 });
  const cloth = std({ map: tx.fabric(SOFA_FABRIC[fabricName] || SOFA_FABRIC.Maroon), roughness: 0.95 });
  const accent = std({ map: tx.fabric('#d8b36a'), roughness: 0.9 });
  // Segun frame: turned legs, front rail, arms with posts, back frame.
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(cyl(0.03, 0.022, 0.16, wood, sx * (W / 2 - 0.05), 0.08, sz * (D / 2 - 0.05), 16));
  g.add(rbox(W, 0.09, 0.06, wood, 0, 0.21, D / 2 - 0.03, 0.015));
  g.add(rbox(W - 0.12, 0.06, D - 0.1, std({ color: 0x2a1a10 }), 0, 0.22, 0, 0.01));
  for (const sx of [-1, 1]) {
    const x = sx * (W / 2 - 0.045);
    g.add(rbox(0.07, 0.48, 0.07, wood, x, 0.4, D / 2 - 0.05, 0.02));
    g.add(rbox(0.07, H - 0.16, 0.07, wood, x, 0.16 + (H - 0.16) / 2, -D / 2 + 0.05, 0.02));
    g.add(rbox(0.11, 0.05, D, wood, x, 0.64, 0, 0.022));
    for (let i = 0; i < 3; i++) g.add(rbox(0.025, 0.36, 0.04, wood, x, 0.42, -0.2 + i * 0.2, 0.008));
  }
  g.add(rbox(W - 0.1, 0.08, 0.06, wood, 0, H - 0.04, -D / 2 + 0.05, 0.02));
  for (let i = -3; i <= 3; i++) g.add(rbox(0.04, 0.5, 0.025, wood, i * 0.27, 0.56, -D / 2 + 0.04, 0.008));
  // Cushions.
  const seatW = (W - 0.26) / 3;
  for (let i = -1; i <= 1; i++) {
    g.add(rbox(seatW - 0.01, 0.15, D - 0.18, cloth, i * seatW, 0.33, 0.04, 0.05));
    const back = rbox(seatW - 0.02, 0.44, 0.13, cloth, i * seatW, 0.62, -D / 2 + 0.14, 0.05);
    back.rotation.x = -0.12;
    g.add(back);
  }
  for (const sx of [-1, 1]) {
    const pillow = rbox(0.36, 0.34, 0.11, accent, sx * (W / 2 - 0.32), 0.55, -D / 2 + 0.26, 0.05);
    pillow.rotation.set(-0.2, sx * 0.25, sx * 0.12);
    g.add(pillow);
  }
  return {
    object: g,
    dims: { w: W, h: H, d: D },
    place: 'wall',
    label: `Wooden sofa, 3-seater · segun frame · ${fabricName.toLowerCase()} fabric · 200 × 88 × 82 cm`,
    controls: [],
  };
}

// ---------------------------------------------------------------- Khat (double bed)

function khat() {
  const W = 1.83, L = 2.13;  // 6 × 7 ft
  const g = new THREE.Group();
  const wood = std({ map: tx.wood('#5b3a21'), roughness: 0.45 });
  const z0 = -L / 2;  // headboard end, against the wall
  for (const sx of [-1, 1]) {
    g.add(rbox(0.06, 0.2, L, wood, sx * (W / 2 + 0.03), 0.3, 0, 0.012));
    g.add(rbox(0.08, 1.18, 0.08, wood, sx * (W / 2 + 0.03), 0.59, z0 + 0.04, 0.02));
    g.add(rbox(0.08, 0.6, 0.08, wood, sx * (W / 2 + 0.03), 0.3, L / 2 - 0.04, 0.02));
    g.add(cyl(0.05, 0.03, 0.06, wood, sx * (W / 2 + 0.03), 1.21, z0 + 0.04, 16));
  }
  g.add(rbox(W, 0.2, 0.06, wood, 0, 0.3, L / 2 - 0.03, 0.012));
  g.add(rbox(W, 0.62, 0.05, wood, 0, 0.82, z0 + 0.03, 0.012));
  g.add(rbox(W + 0.12, 0.09, 0.08, wood, 0, 1.15, z0 + 0.04, 0.03));
  const insetMat = std({ map: tx.wood('#6d4628'), roughness: 0.4 });
  for (const sx of [-1, 1]) g.add(rbox(W / 2 - 0.16, 0.42, 0.012, insetMat, sx * (W / 4), 0.84, z0 + 0.06, 0.02));
  g.add(rbox(W, 0.36, 0.05, wood, 0, 0.42, L / 2 - 0.03, 0.012));
  g.add(rbox(W - 0.04, 0.03, L - 0.1, std({ color: 0x3a2616 }), 0, 0.38, 0, 0));
  const sheet = std({ map: tx.repeated(tx.floralGlass('#f1ece2', '#c98a96'), 2, 2), roughness: 0.9 });
  g.add(rbox(W - 0.04, 0.2, L - 0.12, sheet, 0, 0.49, 0.02, 0.06));
  const pillowMat = std({ map: tx.fabric('#f6f3ec'), roughness: 0.95 });
  for (const sx of [-1, 1]) g.add(rbox(0.66, 0.13, 0.4, pillowMat, sx * 0.42, 0.65, z0 + 0.32, 0.06));
  g.add(rbox(W - 0.1, 0.05, 0.5, std({ map: tx.fabric('#8c2f39'), roughness: 0.95 }), 0, 0.615, L / 2 - 0.38, 0.02));
  // Mosquito net (moshari) hung from four strings.
  const net = new THREE.Group();
  const netMat = new THREE.MeshStandardMaterial({ map: tx.repeated(tx.netting(), 18, 10), transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false, roughness: 1 });
  const nh = 1.3, ny = 0.6 + nh / 2;
  const nw = W - 0.06, nl = L - 0.16;
  for (const [w, x, z, ry] of [[nl, -nw / 2, 0, Math.PI / 2], [nl, nw / 2, 0, Math.PI / 2], [nw, 0, -nl / 2, 0], [nw, 0, nl / 2, 0]]) {
    const side = new THREE.Mesh(new THREE.PlaneGeometry(w, nh), netMat);
    side.position.set(x, ny, z + 0.02);
    side.rotation.y = ry;
    side.userData.shadow = false;
    net.add(side);
  }
  const top = new THREE.Mesh(new THREE.PlaneGeometry(nw, nl), netMat);
  top.rotation.x = Math.PI / 2;
  top.position.set(0, 0.6 + nh, 0.02);
  top.userData.shadow = false;
  net.add(top);
  net.visible = false;
  g.add(net);
  return {
    object: g,
    dims: { w: W + 0.14, h: 1.25, d: L },
    place: 'wall',
    label: 'Khat (double bed) · 6 × 7 ft · segun wood with headboard',
    controls: [{ id: 'net', label: () => (net.visible ? 'Take down net' : 'Hang mosquito net'), pressed: () => net.visible, run: () => { net.visible = !net.visible; } }],
  };
}

// ---------------------------------------------------------------- Gas stove on a kitchen counter

function gasStove() {
  const CW = 1.2, CH = 0.86, CD = 0.6;
  const g = new THREE.Group();
  const tileMat = std({ map: tx.repeated(tx.kitchenTile(), CW / 0.6, CH / 0.6), roughness: 0.2 });
  const slab = std({ map: tx.granite(), roughness: 0.18, metalness: 0.1 });
  // Brick-and-tile counter with an open space for the LPG cylinder.
  g.add(rbox(0.5, CH - 0.03, 0.04, tileMat, -CW / 2 + 0.25, (CH - 0.03) / 2, CD / 2 - 0.02, 0));
  g.add(rbox(0.04, CH - 0.03, CD, tileMat, CW / 2 - 0.02, (CH - 0.03) / 2, 0, 0));
  g.add(rbox(0.04, CH - 0.03, CD, tileMat, -CW / 2 + 0.02, (CH - 0.03) / 2, 0, 0));
  g.add(rbox(CW, CH - 0.03, 0.03, std({ color: 0x9a9890, roughness: 0.9 }), 0, (CH - 0.03) / 2, -CD / 2 + 0.015, 0));
  g.add(rbox(CW + 0.03, 0.03, CD + 0.03, slab, 0, CH - 0.015, 0, 0.004));
  // LPG cylinder with regulator and an orange hose up to the stove.
  const cylMat = phys({ color: 0x1f7a3d, metalness: 0.3, roughness: 0.35, clearcoat: 0.6 });
  const tank = cyl(0.155, 0.155, 0.56, cylMat, 0.3, 0.32, 0, 40);
  g.add(tank, cyl(0.12, 0.155, 0.06, cylMat, 0.3, 0.63, 0, 40), cyl(0.15, 0.15, 0.04, cylMat, 0.3, 0.02, 0, 40));
  g.add(cyl(0.035, 0.035, 0.05, chrome(), 0.3, 0.68, 0, 16), rbox(0.08, 0.05, 0.06, std({ color: 0xd9a520, metalness: 0.6, roughness: 0.35 }), 0.3, 0.72, 0, 0.01));
  const hosePath = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0.3, 0.74, 0), new THREE.Vector3(0.2, 0.8, -0.12), new THREE.Vector3(0.05, 0.7, -0.22), new THREE.Vector3(-0.02, 0.86, -0.27), new THREE.Vector3(-0.02, 0.93, -0.18),
  ]);
  g.add(new THREE.Mesh(new THREE.TubeGeometry(hosePath, 40, 0.008, 8), std({ color: 0xe86a1a, roughness: 0.6 })));

  // Glass-top stove: two brass burners with pan supports and knobs.
  const sx = 0, sy = CH + 0.01;
  g.add(rbox(0.7, 0.065, 0.36, std({ color: 0x9fa3a8, metalness: 0.8, roughness: 0.3 }), sx, sy + 0.035, 0.02, 0.01));
  g.add(rbox(0.72, 0.012, 0.38, blackGloss(), sx, sy + 0.072, 0.02, 0.006));
  const brass = std({ color: 0xc8a14a, metalness: 1, roughness: 0.28 });
  const iron = std({ color: 0x151515, roughness: 0.6, metalness: 0.4 });
  const burners = [];
  for (const bx of [-0.18, 0.18]) {
    const by = sy + 0.078;
    g.add(cyl(0.06, 0.065, 0.012, iron, sx + bx, by + 0.006, 0.02, 32));
    g.add(cyl(0.045, 0.05, 0.022, brass, sx + bx, by + 0.02, 0.02, 32));
    for (let k = 0; k < 4; k++) {
      const arm = rbox(0.1, 0.012, 0.014, iron, 0, 0, 0, 0.003);
      const holder = new THREE.Group();
      holder.position.set(sx + bx, by + 0.045, 0.02);
      holder.rotation.y = (k / 4) * Math.PI * 2 + Math.PI / 4;
      arm.position.x = 0.075;
      holder.add(arm);
      g.add(holder);
    }
    // Blue flame ring.
    const flames = new THREE.Group();
    flames.position.set(sx + bx, by + 0.035, 0.02);
    const flameMat = new THREE.MeshBasicMaterial({ color: 0x3f8cff, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false });
    for (let k = 0; k < 18; k++) {
      const a = (k / 18) * Math.PI * 2;
      const f = new THREE.Mesh(new THREE.ConeGeometry(0.007, 0.04, 8), flameMat);
      f.position.set(Math.cos(a) * 0.05, 0.015, Math.sin(a) * 0.05);
      f.rotation.set(Math.sin(a) * 0.5, 0, -Math.cos(a) * 0.5);
      f.userData.shadow = false;
      flames.add(f);
    }
    const glowL = new THREE.PointLight(0x5aa0ff, 0, 0.6);
    glowL.position.y = 0.05;
    flames.add(glowL);
    flames.visible = false;
    g.add(flames);
    const knob = cyl(0.022, 0.024, 0.025, std({ color: 0x1a1a1a, roughness: 0.4 }), sx + bx, sy + 0.035, 0.215, 24);
    knob.rotation.x = Math.PI / 2;
    g.add(knob);
    const burner = { flames, glowL, knob, on: false };
    knob.userData.onTap = () => { burner.on = !burner.on; };
    burners.push(burner);
  }
  // A kadai (wok) on the right burner.
  const kadai = new THREE.Mesh(new THREE.LatheGeometry([
    new THREE.Vector2(0.0, 0), new THREE.Vector2(0.06, 0.004), new THREE.Vector2(0.11, 0.03), new THREE.Vector2(0.14, 0.075), new THREE.Vector2(0.145, 0.08),
  ], 40), std({ color: 0x232325, metalness: 0.6, roughness: 0.45, side: THREE.DoubleSide }));
  kadai.position.set(sx + 0.18, sy + 0.124, 0.02);
  g.add(kadai);

  g.userData.update = (t) => {
    for (const b of burners) {
      b.flames.visible = b.on;
      b.glowL.intensity = b.on ? 0.6 : 0;
      b.knob.rotation.z = b.on ? -1.2 : 0;
      if (b.on) b.flames.children.forEach((f, i) => { if (f.isMesh) f.scale.y = 0.8 + 0.35 * Math.sin(t * 22 + i * 1.7); });
    }
  };
  return {
    object: g,
    dims: { w: CW, h: CH + 0.13, d: CD },
    place: 'wall',
    label: 'Glass-top gas stove, double burner · 72 × 38 cm · on a granite counter with LPG cylinder',
    controls: burners.map((b, i) => ({
      id: `burner${i}`,
      label: () => `${i ? 'Right' : 'Left'} burner ${b.on ? 'on' : 'off'}`,
      pressed: () => b.on,
      run: () => { b.on = !b.on; },
    })),
  };
}

// ---------------------------------------------------------------- catalogue

export const CATALOG = {
  tv: { name: 'Smart TV', bn: 'স্মার্ট টিভি', blurb: 'Open Netflix, YouTube, Live TV, or play your own video', options: ['32', '43', '50', '55', '65'], optionLabel: (o) => `${o}"`, defaultOption: '43', make: smartTV },
  fridge: { name: 'Refrigerator', bn: 'ফ্রিজ', blurb: 'Open the doors, look inside', options: Object.keys(FRIDGE_FINISH), make: fridge },
  fan: { name: 'Ceiling fan', bn: 'সিলিং ফ্যান', blurb: '56", five speeds', options: Object.keys(FAN_FINISH), make: ceilingFan },
  ac: { name: 'Split AC', bn: 'এসি', blurb: '1.5 ton, on the wall', make: splitAC },
  almirah: { name: 'Steel almirah', bn: 'স্টিলের আলমারি', blurb: '3 × 6.5 ft, with mirror', options: Object.keys(ALMIRAH_FINISH), make: almirah },
  sofa: { name: 'Wooden sofa', bn: 'কাঠের সোফা', blurb: '3-seater, segun frame', options: Object.keys(SOFA_FABRIC), make: sofa },
  khat: { name: 'Khat (bed)', bn: 'খাট', blurb: '6 × 7 ft, with mosquito net', make: khat },
  stove: { name: 'Gas stove', bn: 'গ্যাসের চুলা', blurb: 'Glass top, double burner', make: gasStove },
};
