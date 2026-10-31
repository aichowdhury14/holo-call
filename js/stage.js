// The 3D stage: renderer, virtual room, holo projector, product display, and the
// Room / Camera AR / WebXR / Glasses views. Units are metres so WebXR is life-size.

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/OrbitControls.js';
import { StereoEffect } from 'three/addons/StereoEffect.js';

export const REDUCED_MOTION = matchMedia('(prefers-reduced-motion: reduce)').matches;
const TINT = new THREE.Color(0x6fe7ff);
const BG = new THREE.Color(0x070b14);
const STAGE_BG = new THREE.Color(0x040509);
const BLACK = new THREE.Color(0x000000);
const BEAM_TOP = 0.62;   // a person floats above the projector at roughly head height
const TABLE_H = 0.74;    // small products sit on a table in the virtual room
const LOBBY_TARGET = new THREE.Vector3(0.45, 0.7, 0);

const $ = (id) => document.getElementById(id);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

export const subjectVideo = $('subjectVideo');
const arVideo = $('arVideo');

const st = {
  lobby: true, view: 'room', holo: true, glasses: false, tilt: false, size: 1,
  mount: 'projector',      // projector | stage | floor
  kind: null,              // video | image | model | null
  dims: { w: 0.6, h: 0.8, d: 0.4 },
};

// ---------------------------------------------------------------- renderer & scene

const canvas = $('stage');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setClearColor(0x000000, 0);

const scene = new THREE.Scene();
const fog = new THREE.Fog(BG, 4, 11);

const camera = new THREE.PerspectiveCamera(50, 1, 0.05, 60);
camera.position.set(0, 1.45, 2.4);

const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.enablePan = false;
controls.minAzimuthAngle = -1.05;
controls.maxAzimuthAngle = 1.05;
controls.minPolarAngle = 0.6;
controls.maxPolarAngle = 1.62;

const stereo = new StereoEffect(renderer);
stereo.setEyeSeparation(0.064);

scene.add(new THREE.HemisphereLight(0xcfe9ff, 0x0a0f1c, 1.2));
const sun = new THREE.DirectionalLight(0xffffff, 1.6);
sun.position.set(1.5, 3, 2.5);
scene.add(sun);
const keyLight = new THREE.PointLight(0x6fe7ff, 6, 6);
keyLight.position.set(0, 0.6, 0.8);
scene.add(keyLight);

// Virtual room: floor, grid, floating dust. Hidden in AR views.
const room = new THREE.Group();
scene.add(room);
{
  const floor = new THREE.Mesh(new THREE.CircleGeometry(14, 64), new THREE.MeshStandardMaterial({ color: 0x0b1426, roughness: 0.95 }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -0.002;
  room.add(floor);
  const grid = new THREE.GridHelper(28, 56, 0x1f6f8b, 0x14324a);
  grid.material.transparent = true;
  grid.material.opacity = 0.5;
  room.add(grid);
  const n = 320, pos = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    pos[i * 3] = (Math.random() - 0.5) * 8;
    pos[i * 3 + 1] = Math.random() * 3;
    pos[i * 3 + 2] = (Math.random() - 0.5) * 6 - 1;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const dust = new THREE.Points(g, new THREE.PointsMaterial({ color: TINT, size: 0.014, transparent: true, opacity: 0.45, depthWrite: false }));
  dust.name = 'dust';
  room.add(dust);
}
const dust = room.getObjectByName('dust');

// Stage spotlight for events: a soft cone of light from above.
const spot = new THREE.Mesh(
  new THREE.CylinderGeometry(0.25, 1.1, 4, 48, 1, true).translate(0, 2, 0),
  new THREE.ShaderMaterial({
    uniforms: { uTint: { value: new THREE.Color(0xfff1d6) } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: 'uniform vec3 uTint; varying vec2 vUv; void main(){ gl_FragColor = vec4(uTint, pow(vUv.y, 1.6) * 0.09); }',
    transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
  }),
);
spot.visible = false;
room.add(spot);

// Everything that gets placed in WebXR lives in the rig.
const rig = new THREE.Group();
scene.add(rig);

const pedestal = new THREE.Mesh(
  new THREE.CylinderGeometry(0.24, 0.28, 0.07, 48),
  new THREE.MeshStandardMaterial({ color: 0x1a2433, metalness: 0.6, roughness: 0.35 }),
);
pedestal.position.y = 0.035;
rig.add(pedestal);

const lens = new THREE.Mesh(
  new THREE.CircleGeometry(0.19, 48),
  new THREE.MeshBasicMaterial({ color: TINT, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false }),
);
lens.rotation.x = -Math.PI / 2;
lens.position.y = 0.0705;
rig.add(lens);

const glow = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.6), new THREE.MeshBasicMaterial({
  map: radialTexture('111,231,255', [0.9, 0.25, 0]), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.55,
}));
glow.rotation.x = -Math.PI / 2;
glow.position.y = 0.003;
rig.add(glow);

const shadow = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({
  map: radialTexture('0,0,0', [0.7, 0.35, 0]), transparent: true, depthWrite: false,
}));
shadow.rotation.x = -Math.PI / 2;
shadow.visible = false;
rig.add(shadow);

let table = null;

function radialTexture(rgb, stops) {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, `rgba(${rgb},${stops[0]})`);
  g.addColorStop(0.4, `rgba(${rgb},${stops[1]})`);
  g.addColorStop(1, `rgba(${rgb},${stops[2]})`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}

function buildTable(w, d) {
  if (table) { rig.remove(table); table.traverse((o) => o.geometry?.dispose()); }
  table = new THREE.Group();
  const wood = new THREE.MeshStandardMaterial({ color: 0x3b2f2a, roughness: 0.6 });
  const top = new THREE.Mesh(new THREE.BoxGeometry(w, 0.04, d), wood);
  top.position.y = TABLE_H - 0.02;
  table.add(top);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, TABLE_H - 0.04, 12), wood);
    leg.position.set(sx * (w / 2 - 0.05), (TABLE_H - 0.04) / 2, sz * (d / 2 - 0.05));
    table.add(leg);
  }
  rig.add(table);
}

const beamMat = new THREE.ShaderMaterial({
  uniforms: { uTime: { value: 0 }, uIntensity: { value: 1 }, uTint: { value: TINT } },
  vertexShader: /* glsl */`
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */`
    uniform float uTime, uIntensity; uniform vec3 uTint; varying vec2 vUv;
    void main() {
      float fade = pow(1.0 - vUv.y, 1.3);
      float streak = 0.6 + 0.4 * sin(vUv.x * 80.0 + uTime * 1.5) * sin(vUv.x * 23.0 - uTime * 0.7);
      gl_FragColor = vec4(uTint, fade * streak * 0.22 * uIntensity);
    }`,
  transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
});
const beam = new THREE.Mesh(new THREE.BufferGeometry(), beamMat);
beam.position.y = 0.07;
rig.add(beam);

// The cutout plane: colour from a video or photo, alpha from an AI mask, and vertices
// pushed forward by a blurred copy of the mask so it has some volume (2.5D).
const videoTex = new THREE.VideoTexture(subjectVideo);
videoTex.minFilter = THREE.LinearFilter;
videoTex.generateMipmaps = false;
let imageTex = null;
let maskTex = makeDataTex(1, 1);
let depthTex = makeDataTex(1, 1);

const cutMat = new THREE.ShaderMaterial({
  uniforms: {
    uVideo: { value: videoTex }, uMask: { value: maskTex }, uDepth: { value: depthTex },
    uTime: { value: 0 }, uHolo: { value: 1 }, uMirror: { value: 0 }, uBulge: { value: 0.13 },
    uEdgeFade: { value: 0.14 }, uMotion: { value: REDUCED_MOTION ? 0 : 1 }, uTint: { value: TINT },
  },
  vertexShader: /* glsl */`
    uniform sampler2D uDepth; uniform float uBulge, uMirror; varying vec2 vUv;
    void main() {
      vUv = uv;
      vec2 suv = uv; if (uMirror > 0.5) suv.x = 1.0 - suv.x;
      float d = texture2D(uDepth, vec2(suv.x, 1.0 - suv.y)).r;
      vec3 p = position; p.z += d * d * uBulge;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
    }`,
  fragmentShader: /* glsl */`
    uniform sampler2D uVideo, uMask; uniform float uTime, uHolo, uMirror, uMotion, uEdgeFade; uniform vec3 uTint;
    varying vec2 vUv;
    void main() {
      vec2 uv = vUv; if (uMirror > 0.5) uv.x = 1.0 - uv.x;
      float raw = texture2D(uMask, vec2(uv.x, 1.0 - uv.y)).r;
      // uEdgeFade dissolves the bottom of a video frame into the beam; photos keep a hard base.
      float a = smoothstep(0.3, 0.7, raw) * smoothstep(0.0, uEdgeFade + 0.0001, vUv.y);
      if (a < 0.02) discard;
      vec3 c = texture2D(uVideo, uv).rgb;
      float lum = dot(c, vec3(0.299, 0.587, 0.114));
      float t = uTime * uMotion;
      float scan = 0.8 + 0.2 * sin(vUv.y * 420.0 - t * 5.0);
      float band = 1.0 - smoothstep(0.0, 0.05, abs(fract(vUv.y * 0.6 - t * 0.18) - 0.5));
      float rim = smoothstep(0.15, 0.5, raw) - smoothstep(0.5, 0.85, raw);
      vec3 holo = mix(c * 0.6, uTint * (lum * 1.5 + 0.1), 0.6) * scan + uTint * (rim * 1.3 + band * 0.25);
      float flicker = 0.93 + 0.07 * sin(t * 37.0) * sin(t * 11.0);
      gl_FragColor = vec4(mix(c, holo, uHolo), a * mix(1.0, 0.82 * flicker, uHolo));
    }`,
  transparent: true, depthWrite: false, side: THREE.DoubleSide,
});
const cutout = new THREE.Mesh(new THREE.PlaneGeometry(1, 1, 96, 96), cutMat);
cutout.visible = false;
rig.add(cutout);

const modelHolder = new THREE.Group();
rig.add(modelHolder);

// WebXR floor reticle.
const reticle = new THREE.Mesh(
  new THREE.RingGeometry(0.16, 0.2, 40).rotateX(-Math.PI / 2),
  new THREE.MeshBasicMaterial({ color: TINT, transparent: true, opacity: 0.85 }),
);
reticle.matrixAutoUpdate = false;
reticle.visible = false;
scene.add(reticle);

let cutoutBaseY = 1;

function makeDataTex(w, h) {
  const t = new THREE.DataTexture(new Uint8Array(w * h), w, h, THREE.RedFormat, THREE.UnsignedByteType);
  t.unpackAlignment = 1;
  t.minFilter = THREE.LinearFilter;
  t.magFilter = THREE.LinearFilter;
  t.needsUpdate = true;
  return t;
}

// ---------------------------------------------------------------- masks

let smooth = null, tmpA = null, tmpB = null;
let polarity = 0;  // >0: mask = person, <0: mask = background; settles over the first frames

// blend < 1 smooths a live mask over time; invertAuto checks which way round the mask is.
export function writeMask(f, w, h, { blend = 0.65, invertAuto = true } = {}) {
  const n = w * h;
  if (!smooth || smooth.length !== n || maskTex.image.width !== w) {
    smooth = new Float32Array(n); tmpA = new Float32Array(n); tmpB = new Float32Array(n);
    maskTex.dispose(); depthTex.dispose();
    maskTex = makeDataTex(w, h); depthTex = makeDataTex(w, h);
    cutMat.uniforms.uMask.value = maskTex;
    cutMat.uniforms.uDepth.value = depthTex;
  }
  if (invertAuto && Math.abs(polarity) < 12) votePolarity(f, w, h);
  const inv = invertAuto && polarity < 0;
  const maskBytes = maskTex.image.data, depthBytes = depthTex.image.data;
  const keep = 1 - blend;
  for (let i = 0; i < n; i++) {
    const val = inv ? 1 - f[i] : f[i];
    smooth[i] = smooth[i] * keep + val * blend;
    maskBytes[i] = smooth[i] * 255;
  }
  const r = Math.max(2, Math.round(Math.max(w, h) * 9 / 256));
  blurH(smooth, tmpA, w, h, r); blurV(tmpA, tmpB, w, h, r);
  blurH(tmpB, tmpA, w, h, r); blurV(tmpA, tmpB, w, h, r);
  for (let i = 0; i < n; i++) depthBytes[i] = tmpB[i] * 255;
  maskTex.needsUpdate = true;
  depthTex.needsUpdate = true;
}

// Compare the frame's side edges (usually background) with its centre (usually the person).
function votePolarity(f, w, h) {
  let side = 0, sideN = 0, mid = 0, midN = 0;
  for (let y = 0; y < h * 0.7; y += 4) {
    for (let x = 0; x < 6; x++) { side += f[y * w + x] + f[y * w + w - 1 - x]; sideN += 2; }
  }
  for (let y = Math.floor(h * 0.4); y < h * 0.85; y += 4) {
    for (let x = Math.floor(w * 0.4); x < w * 0.6; x += 4) { mid += f[y * w + x]; midN++; }
  }
  const diff = mid / midN - side / sideN;
  if (Math.abs(diff) > 0.3) polarity += Math.sign(diff);
}

function blurH(src, dst, w, h, r) {
  const k = 1 / (2 * r + 1);
  for (let y = 0; y < h; y++) {
    const row = y * w;
    let acc = 0;
    for (let x = -r; x <= r; x++) acc += src[row + clamp(x, 0, w - 1)];
    for (let x = 0; x < w; x++) {
      dst[row + x] = acc * k;
      acc += src[row + Math.min(w - 1, x + r + 1)] - src[row + Math.max(0, x - r)];
    }
  }
}

function blurV(src, dst, w, h, r) {
  const k = 1 / (2 * r + 1);
  for (let x = 0; x < w; x++) {
    let acc = 0;
    for (let y = -r; y <= r; y++) acc += src[clamp(y, 0, h - 1) * w + x];
    for (let y = 0; y < h; y++) {
      dst[y * w + x] = acc * k;
      acc += src[Math.min(h - 1, y + r + 1) * w + x] - src[Math.max(0, y - r) * w + x];
    }
  }
}

// ---------------------------------------------------------------- subjects

function clearModel() {
  for (const c of [...modelHolder.children]) {
    modelHolder.remove(c);
    c.traverse((o) => { o.geometry?.dispose(); });
  }
}

export function showVideo(stream, { mirror = false, muted = true } = {}) {
  clearModel();
  // WebRTC can deliver the same stream twice (audio, then video); re-assigning it would
  // interrupt play() mid-way.
  if (subjectVideo.srcObject !== stream) subjectVideo.srcObject = stream;
  subjectVideo.muted = muted;
  cutMat.uniforms.uVideo.value = videoTex;
  cutMat.uniforms.uMirror.value = mirror ? 1 : 0;
  cutMat.uniforms.uEdgeFade.value = 0.14;
  if (smooth) smooth.fill(0);
  st.kind = stream ? 'video' : null;
  cutout.visible = !!stream;
  layout();
  if (!stream) return Promise.resolve(true);
  return subjectVideo.play().then(() => true, (e) => {
    // Only an autoplay block should silence the call; an interrupted play() is harmless.
    if (e?.name !== 'NotAllowedError') return true;
    subjectVideo.muted = true;
    subjectVideo.play().catch(() => {});
    return muted;  // false: autoplay blocked the sound, the page should offer a button
  });
}

// canvas: the cut-out photo; alpha: Float32Array mask (w*h); dims in metres.
export function showImage(canvasEl, alpha, aw, ah, dims) {
  clearModel();
  subjectVideo.srcObject = null;
  imageTex?.dispose();
  imageTex = new THREE.CanvasTexture(canvasEl);
  imageTex.minFilter = THREE.LinearFilter;
  imageTex.generateMipmaps = false;
  cutMat.uniforms.uVideo.value = imageTex;
  cutMat.uniforms.uMirror.value = 0;
  cutMat.uniforms.uEdgeFade.value = 0;
  writeMask(alpha, aw, ah, { blend: 1, invertAuto: false });
  st.kind = 'image';
  st.dims = { ...dims };
  cutout.visible = true;
  layout();
}

export function showModel(object, dims) {
  clearModel();
  subjectVideo.srcObject = null;
  modelHolder.add(object);
  st.kind = 'model';
  st.dims = { ...dims };
  cutout.visible = false;
  layout();
}

export function clearSubject() {
  clearModel();
  subjectVideo.srcObject = null;
  cutout.visible = false;
  st.kind = null;
  layout();
}

// Cutout off shows the whole video frame, e.g. when the back camera points at a product
// (the person model would erase anything that isn't a person).
let cutoutOn = true;
export function setCutout(on) {
  cutoutOn = on;
  if (!on) writeMask(new Float32Array(64 * 64).fill(1), 64, 64, { blend: 1, invertAuto: false });
  else if (smooth) smooth.fill(0);
}
export function cutoutEnabled() { return cutoutOn; }
export function setMirror(on) { cutMat.uniforms.uMirror.value = on ? 1 : 0; }

export function subjectKind() { return st.kind; }
export function unmuteSubject() { subjectVideo.muted = false; return subjectVideo.play(); }

// ---------------------------------------------------------------- layout & framing

export function setMount(mount) { st.mount = mount; layout(); }
export function setSize(size) { st.size = size; layout(); }

function layout() {
  const xr = renderer.xr.isPresenting;
  const projector = st.mount !== 'floor';
  for (const o of [pedestal, lens, beam, glow]) o.visible = projector;
  keyLight.visible = projector;
  spot.visible = st.mount === 'stage';
  shadow.visible = !projector && !!st.kind;
  let target, dist;
  if (projector) {
    const v = subjectVideo;
    const aspect = v.videoWidth && v.videoHeight ? v.videoWidth / v.videoHeight : 4 / 3;
    const H = 0.8 * st.size, W = H * aspect;
    cutout.scale.set(W, H, 1);
    cutoutBaseY = BEAM_TOP - 0.05 + H / 2;
    cutout.position.set(0, cutoutBaseY, 0);
    cutMat.uniforms.uBulge.value = 0.13 * st.size;
    const beamH = BEAM_TOP - 0.07;
    beam.geometry.dispose();
    beam.geometry = new THREE.CylinderGeometry(Math.min(W, H) * 0.42, 0.19, beamH, 48, 1, true).translate(0, beamH / 2, 0);
    if (table) table.visible = false;
    target = new THREE.Vector3(0, BEAM_TOP + H * 0.35, 0);
    dist = 2.4 * Math.max(1, st.size * 0.9);
  } else {
    const { w, h, d } = st.dims;
    const onTable = h < 0.6 && !xr && !!st.kind;
    const base = onTable ? TABLE_H : 0;
    if (onTable) buildTable(Math.max(0.6, w + 0.3), Math.max(0.45, Math.min(0.9, (d || w * 0.6) + 0.25)));
    else if (table) table.visible = false;
    cutout.scale.set(w, h, 1);
    cutoutBaseY = base + h / 2;
    cutout.position.set(0, cutoutBaseY, 0);
    cutMat.uniforms.uBulge.value = Math.min(0.25, Math.min(w, h) * 0.25);
    modelHolder.position.y = base;
    shadow.position.y = base + 0.002;
    shadow.scale.set(w * 1.3 + 0.1, (d || w * 0.6) * 1.3 + 0.1, 1);
    target = new THREE.Vector3(0, onTable ? base + h * 0.4 : Math.max(0.35, h * 0.5), 0);
    dist = onTable ? clamp(Math.max(h, w) * 2.2 + 0.75, 0.9, 3) : clamp(Math.max(h, w * 0.9) * 1.9 + 0.5, 1.1, 7);
  }
  if (!xr && !st.lobby) frameCamera(target, dist);
}

function frameCamera(target, dist) {
  const s = new THREE.Spherical().setFromVector3(camera.position.clone().sub(controls.target));
  controls.target.copy(target);
  s.radius = dist;
  s.phi = clamp(s.phi, 1.2, 1.5);
  camera.position.setFromSpherical(s).add(target);
  controls.minDistance = dist * 0.4;
  controls.maxDistance = dist * 2.2;
  controls.update();
  if (st.tilt) startTiltFromCamera();
}

subjectVideo.addEventListener('loadedmetadata', layout);
subjectVideo.addEventListener('resize', layout);

export function setLobby(on) {
  st.lobby = on;
  if (on) { st.size = 1; setMount('projector'); clearSubject(); }
  else layout();
}

// ---------------------------------------------------------------- views

let arStream = null;
const viewListeners = new Set();
export function onViewChange(fn) { viewListeners.add(fn); }

export async function setView(view) {
  if (view === 'xr') return startXR();
  if (view === 'camera') {
    try {
      if (!arStream) {
        arStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
        arVideo.srcObject = arStream;
      }
      await arVideo.play();
      arVideo.hidden = false;
    } catch (e) {
      throw new Error('Could not open the back camera for Camera AR.');
    }
  } else {
    arStream?.getTracks().forEach((t) => t.stop());
    arStream = null;
    arVideo.srcObject = null;
    arVideo.hidden = true;
  }
  st.view = view;
  applyBackdrop();
  viewListeners.forEach((fn) => fn(view));
}

// Room view draws the virtual room. Camera AR clears the canvas so the camera shows through.
// Glasses mode goes pure black, which optical see-through glasses (Xreal, Rokid) show as clear.
function applyBackdrop() {
  const xr = renderer.xr.isPresenting;
  const virtual = st.view === 'room' && !st.glasses && !xr;
  room.visible = virtual;
  scene.fog = virtual ? fog : null;
  if (st.view === 'camera' || xr) scene.background = null;
  else if (!virtual) scene.background = BLACK;
  else scene.background = st.mount === 'stage' ? STAGE_BG : BG;
  if (st.mount === 'stage') fog.color.copy(STAGE_BG); else fog.color.copy(BG);
}

export function setHolo(on) { st.holo = on; }

export function setGlasses(on) {
  st.glasses = on;
  applyBackdrop();
  resize();
}

// ---------------------------------------------------------------- tilt to look

const tilt = { base: null, now: null, radius: 2.4, polar0: 1.45, az0: 0, az: 0, pol: 1.45 };

function screenAngle() { return screen.orientation?.angle ?? window.orientation ?? 0; }

function onOrient(e) {
  if (e.beta == null || e.gamma == null) return;
  const a = screenAngle();
  let x = e.gamma, y = e.beta;
  if (a === 90) { x = e.beta; y = -e.gamma; } else if (a === 270 || a === -90) { x = -e.beta; y = e.gamma; }
  tilt.now = { x, y };
  if (!tilt.base) tilt.base = { x, y };
}

function startTiltFromCamera() {
  const s = new THREE.Spherical().setFromVector3(camera.position.clone().sub(controls.target));
  Object.assign(tilt, { base: null, radius: s.radius, polar0: s.phi, az0: s.theta, az: s.theta, pol: s.phi });
}

// Resolves to true when motion data arrives, false when there is no sensor or no permission.
export async function setTilt(on) {
  if (!on) {
    removeEventListener('deviceorientation', onOrient);
    st.tilt = false;
    return false;
  }
  if (typeof DeviceOrientationEvent === 'undefined') return false;
  if (typeof DeviceOrientationEvent.requestPermission === 'function') {
    try { if (await DeviceOrientationEvent.requestPermission() !== 'granted') return false; } catch { return false; }
  }
  tilt.now = null;
  startTiltFromCamera();
  addEventListener('deviceorientation', onOrient);
  st.tilt = true;
  await new Promise((r) => setTimeout(r, 1200));
  if (!tilt.now) { removeEventListener('deviceorientation', onOrient); st.tilt = false; return false; }
  return true;
}

function applyTilt() {
  if (!tilt.now || !tilt.base) return;
  const dx = clamp(tilt.now.x - tilt.base.x, -45, 45);
  const dy = clamp(tilt.now.y - tilt.base.y, -40, 40);
  const az = clamp(tilt.az0 + dx * 0.025, -1.05, 1.05);
  const pol = clamp(tilt.polar0 - dy * 0.012, 0.6, 1.62);
  tilt.az += (az - tilt.az) * 0.15;
  tilt.pol += (pol - tilt.pol) * 0.15;
  camera.position.setFromSpherical(new THREE.Spherical(tilt.radius, tilt.pol, tilt.az)).add(controls.target);
  camera.lookAt(controls.target);
}

// ---------------------------------------------------------------- WebXR: place in your real room

let hitSource = null;
const xrListeners = { start: null, end: null, placed: null };
export function onXR(handlers) { Object.assign(xrListeners, handlers); }

export async function xrSupported() {
  try { return !!(navigator.xr && await navigator.xr.isSessionSupported('immersive-ar')); } catch { return false; }
}

async function startXR() {
  const session = await navigator.xr.requestSession('immersive-ar', {
    requiredFeatures: ['hit-test'], optionalFeatures: ['dom-overlay'], domOverlay: { root: $('hud') },
  }).catch(() => { throw new Error('Could not start AR. It needs Chrome on an ARCore-supported Android phone.'); });
  if (st.glasses) setGlasses(false);
  if (st.tilt) setTilt(false);
  renderer.xr.enabled = true;
  renderer.xr.setReferenceSpaceType('local');
  await renderer.xr.setSession(session);
  rig.visible = false;
  applyBackdrop();
  layout();
  xrListeners.start?.();
  const viewer = await session.requestReferenceSpace('viewer');
  hitSource = await session.requestHitTestSource({ space: viewer });
  session.addEventListener('select', placeRig);
  session.addEventListener('end', () => {
    hitSource = null;
    renderer.xr.enabled = false;
    reticle.visible = false;
    rig.visible = true;
    rig.position.set(0, 0, 0);
    rig.rotation.set(0, 0, 0);
    applyBackdrop();
    layout();
    resize();
    xrListeners.end?.();
  });
}

export function endXR() { renderer.xr.getSession()?.end(); }
export function inXR() { return renderer.xr.isPresenting; }

function placeRig() {
  if (!reticle.visible) return;
  rig.position.setFromMatrixPosition(reticle.matrix);
  const eye = new THREE.Vector3().setFromMatrixPosition(renderer.xr.getCamera().matrixWorld);
  rig.rotation.set(0, Math.atan2(eye.x - rig.position.x, eye.z - rig.position.z), 0);
  rig.visible = true;
  xrListeners.placed?.();
}

function handleXRFrame(frame) {
  if (!hitSource) return;
  const hits = frame.getHitTestResults(hitSource);
  const pose = hits.length ? hits[0].getPose(renderer.xr.getReferenceSpace()) : null;
  reticle.visible = !!pose;
  if (pose) reticle.matrix.fromArray(pose.transform.matrix);
}

// ---------------------------------------------------------------- loop

const frameHooks = new Set();
export function onFrame(fn) { frameHooks.add(fn); }

let holoMix = 1;

renderer.setAnimationLoop((ms, frame) => {
  const t = ms / 1000;
  frameHooks.forEach((fn) => fn(t));

  holoMix += ((st.holo ? 1 : 0) - holoMix) * 0.12;
  cutMat.uniforms.uHolo.value = holoMix;
  cutMat.uniforms.uTime.value = t;
  beamMat.uniforms.uTime.value = t;
  beamMat.uniforms.uIntensity.value = (cutout.visible ? 1 : 0.45) * (0.25 + 0.75 * holoMix);
  lens.material.opacity = 0.35 + 0.5 * holoMix;
  const bob = st.mount !== 'floor' && !REDUCED_MOTION ? Math.sin(t * 1.3) * 0.008 * holoMix : 0;
  cutout.position.y = cutoutBaseY + bob;
  if (!REDUCED_MOTION) dust.rotation.y = t * 0.01;

  if (frame) {
    handleXRFrame(frame);
    renderer.render(scene, camera);
    return;
  }
  if (st.lobby) {
    const s = new THREE.Spherical(2.6, 1.38, REDUCED_MOTION ? 0.35 : Math.sin(t * 0.15) * 0.55);
    camera.position.setFromSpherical(s).add(LOBBY_TARGET);
    camera.lookAt(LOBBY_TARGET);
  } else if (st.tilt) {
    applyTilt();
  } else {
    controls.update();
  }
  if (st.glasses) stereo.render(scene, camera);
  else renderer.render(scene, camera);
});

function resize() {
  if (renderer.xr.isPresenting) return;
  const w = innerWidth, h = innerHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h, false);
  stereo.setSize(w, h);
}
addEventListener('resize', resize);
resize();
applyBackdrop();
layout();

export { THREE };
