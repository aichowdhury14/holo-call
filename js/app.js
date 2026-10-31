import * as stage from './stage.js';
import * as media from './media.js';
import { loadPersonSegmenter, segmentVideo, resetVideo } from './segment.js';
import { loadPhoto, cutPhoto, wholePhoto } from './products.js';
import { CATALOG } from './catalog.js';
import { WALL_COLOURS } from './home.js';
import * as net from './net.js';

const $ = (id) => document.getElementById(id);
const TABS = ['call', 'shop', 'live', 'class', 'stage', 'about'];

const PRESETS = {
  live: {
    label: 'Live selling', mount: 'projector', size: 1, studio: 'studioLive', viewerBtns: ['heartBtn'],
    inviteLabel: 'Your live code', note: 'Viewers open the link to watch. They don\'t need a camera. Switch to the back camera to show a product up close.',
  },
  class: {
    label: 'Class', mount: 'projector', size: 1, studio: 'studioClass', viewerBtns: ['handBtn'],
    inviteLabel: 'Your class code', note: 'Students open the link and type their name to join.',
  },
  stage: {
    label: 'Stage', mount: 'stage', size: 1.6, studio: 'studioStage', viewerBtns: ['clapBtn', 'displayBtn'],
    inviteLabel: 'Your stage code', note: 'Open the link on the venue screen, then press Display mode.',
  },
};

const session = {
  kind: null,        // solo | call | shop | host | viewer
  preset: null,      // live | class | stage for host/viewer
  link: null,        // the active net connection
  code: null,
  cast: { card: null, board: '', title: null },
  hands: new Map(),
  reactAt: new Map(),
  hearts: 0,
  claps: 0,
  product: null,     // the catalogue product on show: { id, option, ...made }
};

// Live video subjects get a fresh AI mask every frame (unless showing the full frame).
stage.onFrame(() => {
  if (stage.subjectKind() === 'video' && stage.cutoutEnabled()) {
    segmentVideo(stage.subjectVideo, (f, w, h) => stage.writeMask(f, w, h));
  }
});

// ---------------------------------------------------------------- helpers

let toastTimer;
function toast(msg, ms = 3800) {
  const el = $('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), ms);
}

function setStatus(text, tone = 'idle') {
  $('statusText').textContent = text;
  $('status').dataset.tone = tone;
}

function setBusy(busy) {
  document.querySelectorAll('[data-start]').forEach((b) => { b.disabled = busy; });
}

const cleanCode = (v) => v.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');

// av: show mic/camera buttons; cutout: show the "cut out person / full video" choice.
function configureToolbar({ style = true, size = true, cutout = true, av = false, extras = [] } = {}) {
  $('styleRow').hidden = !style;
  $('sizeWrap').hidden = !size;
  $('cutoutRow').hidden = !cutout;
  $('avBtns').hidden = !av;
  $('flipBtn').hidden = !av || media.local.cameras < 2;
  $('productBtns').hidden = $('productBtns').childElementCount === 0;
  for (const b of $('extraBtns').children) b.hidden = !extras.includes(b.id);
  $('extraBtns').hidden = extras.length === 0;
}

function setStyle(holo) {
  stage.setHolo(holo);
  document.querySelectorAll('[data-style]').forEach((b) => b.setAttribute('aria-pressed', String((b.dataset.style === 'holo') === holo)));
}

function setSize(size) {
  $('sizeRange').value = String(size);
  stage.setSize(size);
}

// Shared start-up: camera and/or AI model, then swap the lobby for the toolbar.
async function begin({ camera = false, segmenter = false } = {}) {
  setBusy(true);
  try {
    const seg = segmenter ? loadPersonSegmenter() : null;
    if (camera) {
      setStatus('Opening camera and microphone…', 'busy');
      await media.openCamera();
      $('localVideo').srcObject = media.local.stream;
      setAvButtons();
      media.startMeter((lvl) => $('micBtn').style.setProperty('--lvl', lvl.toFixed(2)));
      if (!media.local.hasAudio) toast('No microphone available, so the other side won\'t hear you. Check the microphone permission.', 7000);
    }
    if (seg) { setStatus('Loading the AI cutout…', 'busy'); await seg; }
  } catch (e) {
    console.error(e);
    media.stopCamera();
    setStatus('Could not start', 'bad');
    toast(e.message || 'Could not start the camera or the AI model. Check your connection and try again.', 7000);
    return false;
  } finally {
    setBusy(false);
  }
  $('lobby').hidden = true;
  $('toolbar').hidden = false;
  stage.setLobby(false);
  keepAwake(true);
  firstTimeHint();
  return true;
}

// Phones dim and lock during long calls or while watching the TV; ask them not to.
let wakeLock = null;
async function keepAwake(on) {
  try {
    if (on && !wakeLock && document.visibilityState === 'visible') {
      wakeLock = await navigator.wakeLock?.request('screen');
      wakeLock?.addEventListener('release', () => { wakeLock = null; });
    } else if (!on) {
      await wakeLock?.release();
      wakeLock = null;
    }
  } catch { /* not supported or refused; harmless */ }
}
document.addEventListener('visibilitychange', () => { if (session.kind && document.visibilityState === 'visible') keepAwake(true); });

function firstTimeHint() {
  let seen = false;
  try { seen = localStorage.getItem('holocall.hint') === '1'; localStorage.setItem('holocall.hint', '1'); } catch { /* private mode */ }
  if (!seen) setTimeout(() => toast('Drag to look around · pinch or scroll to zoom · tap parts of a product to use them', 6000), 900);
}

async function showRemote(stream) {
  resetVideo();
  const soundOk = await stage.showVideo(stream, { mirror: false, muted: false });
  $('soundBtn').hidden = soundOk;
  if (!stream.getAudioTracks().length) toast('No sound is coming from their side. Their microphone may be blocked.', 6000);
}

// ---------------------------------------------------------------- your mic & camera

function setAvButtons() {
  const { mic, cam, hasAudio, facing } = media.local;
  const micBtn = $('micBtn'), camBtn = $('camBtn'), flipBtn = $('flipBtn');
  micBtn.disabled = !hasAudio;
  micBtn.setAttribute('aria-pressed', String(mic && hasAudio));
  micBtn.setAttribute('aria-label', !hasAudio ? 'No microphone' : mic ? 'Microphone on' : 'Microphone muted');
  micBtn.title = mic ? 'Mute microphone' : 'Unmute microphone';
  camBtn.setAttribute('aria-pressed', String(cam));
  camBtn.setAttribute('aria-label', cam ? 'Camera on' : 'Camera off');
  camBtn.title = cam ? 'Turn camera off' : 'Turn camera on';
  flipBtn.setAttribute('aria-label', facing === 'user' ? 'Switch to back camera' : 'Switch to front camera');
  $('localVideo').classList.toggle('back', facing !== 'user');
}

function sendAv() {
  session.link?.send({ t: 'av', mic: media.local.mic && media.local.hasAudio, cam: media.local.cam });
}

$('micBtn').addEventListener('click', () => {
  media.setMic(!media.local.mic);
  setAvButtons();
  sendAv();
  toast(media.local.mic ? 'Microphone on.' : 'Microphone muted. They can\'t hear you.', 2200);
});

document.addEventListener('keydown', (e) => {
  if (e.key.toLowerCase() !== 'm' || $('avBtns').hidden || $('toolbar').hidden || e.target.closest?.('input, textarea, select')) return;
  $('micBtn').click();
});

$('camBtn').addEventListener('click', () => {
  media.setCam(!media.local.cam);
  setAvButtons();
  sendAv();
});

$('flipBtn').addEventListener('click', async () => {
  $('flipBtn').disabled = true;
  try {
    const facing = await media.flipCamera((track) => session.link?.replaceVideoTrack?.(track) ?? Promise.resolve());
    const front = facing === 'user';
    $('localVideo').srcObject = media.local.stream;
    // Our own preview (solo, presenters) follows the camera; the person model can't cut out products.
    if (session.kind === 'solo' || session.kind === 'host') {
      resetVideo();
      stage.showVideo(media.local.stream, { mirror: front, muted: true });
      setCutout(front);
    }
    session.link?.send({ t: 'cutout', on: front });
    toast(front ? 'Front camera.' : 'Back camera. They now see your full video, so products show up too.', 4000);
  } catch (e) {
    toast(e.message, 4000);
  } finally {
    setAvButtons();
    $('flipBtn').disabled = false;
  }
});

function setCutout(on) {
  stage.setCutout(on);
  $('cutOn').setAttribute('aria-pressed', String(on));
  $('cutOff').setAttribute('aria-pressed', String(!on));
}
$('cutOn').addEventListener('click', () => setCutout(true));
$('cutOff').addEventListener('click', () => setCutout(false));

// What the other side tells us about their mic, camera and framing.
function handleRemoteAv(msg) {
  if (msg.t === 'av') {
    const notes = [];
    if (msg.mic === false) notes.push('mic muted');
    if (msg.cam === false) notes.push('camera off');
    const who = session.kind === 'viewer' ? 'Presenter' : 'They';
    $('remoteState').textContent = notes.length ? `${who}: ${notes.join(' · ')}` : '';
    $('remoteState').hidden = !notes.length;
    return true;
  }
  if (msg.t === 'cutout') {
    setCutout(msg.on !== false);
    if (msg.on === false) toast('They switched to their back camera. Showing their full video.', 4000);
    return true;
  }
  return false;
}

// ---------------------------------------------------------------- tabs

function selectTab(tab, focus = false) {
  if (!TABS.includes(tab)) tab = 'call';
  for (const t of TABS) {
    const btn = $(`tab-${t}`), on = t === tab;
    btn.setAttribute('aria-selected', String(on));
    btn.tabIndex = on ? 0 : -1;
    $(`p-${t}`).hidden = !on;
  }
  if (focus) $(`tab-${tab}`).focus();
  history.replaceState(null, '', `${location.pathname}${location.search}#${tab}`);
}

document.querySelectorAll('[data-tab]').forEach((b) => b.addEventListener('click', () => selectTab(b.dataset.tab)));
document.querySelector('.tabs').addEventListener('keydown', (e) => {
  const i = TABS.indexOf(document.activeElement?.dataset?.tab);
  if (i < 0) return;
  if (e.key === 'ArrowRight') { selectTab(TABS[(i + 1) % TABS.length], true); e.preventDefault(); }
  if (e.key === 'ArrowLeft') { selectTab(TABS[(i + TABS.length - 1) % TABS.length], true); e.preventDefault(); }
});

// ---------------------------------------------------------------- invite / side panel

function inviteUrl(code, tab) { return `${location.origin}${location.pathname}?join=${code}#${tab}`; }

function showInvite(code, tab, { label, note }) {
  session.code = code;
  $('invite').dataset.tab = tab;
  $('inviteLabel').textContent = label;
  $('inviteCode').textContent = code;
  $('inviteNote').textContent = note;
  $('invite').hidden = false;
}

$('copyLink').addEventListener('click', async () => {
  const url = inviteUrl(session.code, $('invite').dataset.tab);
  try { await navigator.clipboard.writeText(url); toast('Invite link copied. Send it on WhatsApp, Messenger or SMS.'); }
  catch { toast(url, 9000); }
});
if (navigator.share) {
  $('shareLink').hidden = false;
  $('shareLink').addEventListener('click', () => {
    navigator.share({ title: 'HoloCall', text: `Join me on HoloCall. Code ${session.code}`, url: inviteUrl(session.code, $('invite').dataset.tab) }).catch(() => {});
  });
}
$('inviteClose').addEventListener('click', () => { $('invite').hidden = true; });
$('inviteCode').addEventListener('click', () => $('copyLink').click());
$('panelBtn').addEventListener('click', () => { $('invite').hidden = !$('invite').hidden; });

// ---------------------------------------------------------------- Call tab

$('btnSolo').addEventListener('click', async () => {
  if (!await begin({ camera: true, segmenter: true })) return;
  session.kind = 'solo';
  stage.setMount('projector');
  resetVideo();
  stage.showVideo(media.local.stream, { mirror: true, muted: true });
  configureToolbar({ av: true });
  setStatus('Solo preview · this is how you would appear', 'live');
});

function callHandlers(extra) {
  return {
    onMessage: handleRemoteAv,
    onDataOpen() { sendAv(); session.link?.send({ t: 'cutout', on: media.local.facing === 'user' }); },
    onError(err) { setStatus('Connection problem', 'bad'); toast(net.friendlyError(err), 6000); },
    ...extra,
  };
}

$('btnCall').addEventListener('click', async () => {
  if (!await begin({ camera: true, segmenter: true })) return;
  session.kind = 'call';
  stage.setMount('projector');
  configureToolbar({ av: true, extras: ['panelBtn'] });
  $('localVideo').hidden = false;
  setStatus('Opening a call line…', 'busy');
  session.link = net.callHost(media.local.stream, callHandlers({
    onCode(code) {
      showInvite(code, 'call', { label: 'Your call code', note: 'Open the link on another phone or laptop. When they join, they appear on the projector.' });
      setStatus(`Waiting for someone to join · ${code}`, 'busy');
    },
    onRemote(s) { showRemote(s); $('invite').hidden = true; setStatus('Live · drag to look around', 'live'); },
    onRemoteGone() {
      stage.clearSubject();
      $('remoteState').hidden = true;
      setStatus(`They left · code ${session.code} is still open`, 'idle');
      toast('The other person left the call.');
    },
  }));
});

$('callJoin').addEventListener('submit', async (e) => {
  e.preventDefault();
  const code = cleanCode($('callCode').value);
  if (code.length !== 6) { toast('Call codes are 6 letters and numbers, like K7Q2MX.'); $('callCode').focus(); return; }
  if (!await begin({ camera: true, segmenter: true })) return;
  session.kind = 'call';
  stage.setMount('projector');
  configureToolbar({ av: true });
  $('localVideo').hidden = false;
  setStatus(`Calling ${code}…`, 'busy');
  session.link = net.callJoin(code, media.local.stream, callHandlers({
    onRemote(s) { showRemote(s); setStatus('Live · drag to look around', 'live'); },
    onRemoteGone() { stage.clearSubject(); $('remoteState').hidden = true; setStatus('Call ended', 'idle'); toast('The other person left the call.'); },
    onNotFound() { setStatus('No call with that code', 'bad'); toast(`No call is waiting on code ${code}. Check the code, or ask them to start the call again.`, 6500); },
    onNoAnswer() { setStatus('No answer', 'bad'); toast('They didn\'t pick up. They may already be in a call.', 6000); },
  }));
});

// ---------------------------------------------------------------- Shop tab

// The catalogue grid: one card per product, with its options (size, colour) as a picker.
for (const [id, p] of Object.entries(CATALOG)) {
  const card = document.createElement('div');
  card.className = 'pcard';
  const btn = document.createElement('button');
  btn.className = 'sbtn';
  btn.dataset.product = id;
  btn.dataset.start = '';
  for (const [tag, cls, text] of [['b', '', p.name], ['span', 'bn', p.bn], ['span', '', p.blurb]]) {
    const el = document.createElement(tag);
    if (cls) el.className = cls;
    el.textContent = text;
    btn.appendChild(el);
  }
  card.appendChild(btn);
  let select = null;
  if (p.options) {
    select = document.createElement('select');
    select.id = `opt-${id}`;
    select.setAttribute('aria-label', `${p.name} option`);
    for (const o of p.options) {
      const op = document.createElement('option');
      op.value = o;
      op.textContent = p.optionLabel ? p.optionLabel(o) : o;
      select.appendChild(op);
    }
    select.value = p.defaultOption || p.options[0];
    card.appendChild(select);
  }
  btn.addEventListener('click', () => openProduct(id, select?.value));
  $('samples').appendChild(card);
}

async function openProduct(id, option) {
  if (!await begin()) return;
  session.kind = 'shop';
  stage.setMount('floor');
  loadProduct(id, option);
  configureToolbar({ style: false, size: false, cutout: false });
  $('wallRow').hidden = false;
  setStatus('Real size · tap parts to use them', 'live');
}

// Shows a catalogue product; also used to switch its size or colour in place.
function loadProduct(id, option) {
  const def = CATALOG[id];
  const opt = option ?? def.defaultOption ?? def.options?.[0];
  session.product?.dispose?.();
  const made = def.make(opt);
  session.product = { id, option: opt, ...made };
  stage.showModel(made.object, made.dims, { place: made.place, mountY: made.mountY });
  $('productTag').textContent = made.label;
  $('productTag').hidden = false;
  if (made.tv) made.tv.onNeedVideo = () => $('tvFile').click();
  // Phones start with the remote closed so it doesn't cover the TV; the screen itself is tappable.
  $('tvRemote').hidden = !made.tv || innerWidth < 640;
  if (made.tv && innerWidth < 640) toast('Tap the TV screen to use it, or open the Remote.', 4500);
  renderProductControls();
  history.replaceState(null, '', `${location.pathname}?item=${id}${opt ? `&opt=${encodeURIComponent(opt)}` : ''}#shop`);
}

function renderProductControls() {
  const box = $('productBtns');
  box.textContent = '';
  const p = session.product;
  if (!p) { box.hidden = true; return; }
  const def = CATALOG[p.id];
  for (const c of p.controls) {
    const b = document.createElement('button');
    b.textContent = c.label();
    if (c.aria) b.setAttribute('aria-label', c.aria);
    if (c.pressed) b.setAttribute('aria-pressed', String(c.pressed()));
    b.addEventListener('click', () => { c.run(); renderProductControls(); });
    box.appendChild(b);
  }
  if (def.options) {
    const b = document.createElement('button');
    const label = def.optionLabel ? def.optionLabel(p.option) : p.option;
    b.textContent = `${def.optionLabel ? 'Size' : 'Colour'}: ${label}`;
    b.title = 'Switch to the next option';
    b.addEventListener('click', () => {
      const i = def.options.indexOf(p.option);
      loadProduct(p.id, def.options[(i + 1) % def.options.length]);
    });
    box.appendChild(b);
  }
  const share = document.createElement('button');
  share.textContent = 'Share';
  share.title = 'Copy a link that opens this product';
  share.addEventListener('click', async () => {
    const url = location.href;
    if (navigator.share) { navigator.share({ title: `${def.name} on HoloCall`, url }).catch(() => {}); return; }
    try { await navigator.clipboard.writeText(url); toast('Link copied. It opens this product at real size.'); } catch { toast(url, 9000); }
  });
  box.appendChild(share);
  if (p.tv) {
    const b = document.createElement('button');
    b.textContent = 'Remote';
    b.setAttribute('aria-pressed', String(!$('tvRemote').hidden));
    b.addEventListener('click', () => { $('tvRemote').hidden = !$('tvRemote').hidden; renderProductControls(); });
    box.appendChild(b);
  }
  box.hidden = box.childElementCount === 0;
}

// TV remote: on-screen buttons and the keyboard.
document.querySelectorAll('#tvRemote [data-key]').forEach((b) => b.addEventListener('click', () => {
  session.product?.tv?.press(b.dataset.key);
  renderProductControls();
}));
$('tvFileBtn').addEventListener('click', () => $('tvFile').click());
$('tvFile').addEventListener('change', (e) => {
  const file = e.target.files?.[0];
  e.target.value = '';
  if (!file || !session.product?.tv) return;
  session.product.tv.playFile(file).catch(() => toast('This video can\'t play in the browser. Try an MP4 file.', 5000));
  renderProductControls();
});
document.addEventListener('keydown', (e) => {
  const tv = session.product?.tv;
  if (!tv || $('tvRemote').hidden || e.target.closest?.('input, textarea, select')) return;
  const key = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', Enter: 'ok', Backspace: 'back', h: 'home', '+': 'volUp', '=': 'volUp', '-': 'volDown' }[e.key];
  if (!key) return;
  e.preventDefault();
  tv.press(key);
  renderProductControls();
});

// Wall colour, to picture the product against your own walls.
for (const [name, hex] of Object.entries(WALL_COLOURS)) {
  const b = document.createElement('button');
  b.style.background = hex;
  b.title = name;
  b.setAttribute('aria-label', `${name} walls`);
  b.setAttribute('aria-pressed', String(name === 'Cream'));
  b.addEventListener('click', () => {
    stage.setWallColour(hex);
    for (const o of $('wallSwatches').children) o.setAttribute('aria-pressed', String(o === b));
  });
  $('wallSwatches').appendChild(b);
}

let photo = null, cut = null, tapAt = null;

function drawPhoto() {
  const c = $('photoCanvas');
  c.width = photo.width;
  c.height = photo.height;
  const g = c.getContext('2d');
  g.drawImage(photo, 0, 0);
  if (tapAt) {
    const r = Math.max(10, photo.width * 0.02);
    g.lineWidth = r * 0.35;
    g.strokeStyle = '#6fe7ff';
    g.beginPath(); g.arc(tapAt.x * photo.width, tapAt.y * photo.height, r, 0, Math.PI * 2); g.stroke();
  }
}

function setCut(result) {
  cut = result;
  const pv = $('cutPreview');
  if (!cut) {
    pv.width = pv.height = 1;
    $('viewOwn').disabled = true;
    return;
  }
  pv.width = cut.preview.width;
  pv.height = cut.preview.height;
  pv.getContext('2d').drawImage(cut.preview, 0, 0);
  if (!$('prodH').value || !$('prodW').value) {
    $('prodH').value = 30;
    $('prodW').value = Math.round(30 * cut.aspect * 2) / 2;
  } else {
    $('prodW').value = Math.round(Number($('prodH').value) * cut.aspect * 2) / 2;
  }
  $('viewOwn').disabled = false;
}

async function runCut(x, y) {
  tapAt = { x, y };
  drawPhoto();
  $('cutHint').textContent = 'Cutting out…';
  try {
    const result = await cutPhoto(photo, x, y);
    if (!result) {
      $('cutHint').textContent = 'Nothing found there. Tap the middle of the product.';
      return;
    }
    setCut(result);
    $('cutHint').textContent = 'Not quite right? Tap another part of the product.';
  } catch (e) {
    console.error(e);
    $('cutHint').textContent = 'The cutout model could not load. Check your connection, or use the whole photo.';
  }
}

$('photoBtn').addEventListener('click', () => $('photoInput').click());
$('photoInput').addEventListener('change', async (e) => {
  const file = e.target.files?.[0];
  e.target.value = '';
  if (!file) return;
  try {
    photo = await loadPhoto(file);
  } catch (err) { toast(err.message, 5000); return; }
  tapAt = null;
  setCut(null);
  $('prodW').value = ''; $('prodH').value = '';
  $('cutEditor').hidden = false;
  drawPhoto();
  runCut(0.5, 0.5);  // first guess: the product is usually in the middle
});

$('photoCanvas').addEventListener('click', (e) => {
  if (!photo) return;
  const r = e.currentTarget.getBoundingClientRect();
  runCut((e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height);
});

$('wholePhoto').addEventListener('click', () => {
  if (!photo) return;
  tapAt = null;
  drawPhoto();
  setCut(wholePhoto(photo));
  $('cutHint').textContent = 'Using the whole photo. Tap the product to cut it out instead.';
});

$('prodW').addEventListener('input', () => {
  if (cut && $('prodW').value) $('prodH').value = Math.round(Number($('prodW').value) / cut.aspect * 2) / 2;
});
$('prodH').addEventListener('input', () => {
  if (cut && $('prodH').value) $('prodW').value = Math.round(Number($('prodH').value) * cut.aspect * 2) / 2;
});

$('viewOwn').addEventListener('click', async () => {
  const w = Number($('prodW').value), h = Number($('prodH').value);
  if (!cut || !(w >= 1 && w <= 2000 && h >= 1 && h <= 2000)) {
    toast('Enter the real width and height in centimetres (1 to 2000).');
    return;
  }
  if (!await begin()) return;
  session.kind = 'shop';
  stage.setMount('floor');
  stage.showImage(cut.canvas, cut.alpha, cut.w, cut.h, { w: w / 100, h: h / 100, d: Math.min(w, h) / 200 });
  setStyle(false);
  configureToolbar({ style: true, size: false, cutout: false });
  $('wallRow').hidden = false;
  const name = $('prodName').value.trim() || 'Your product';
  $('productTag').textContent = `${name} · ${w} × ${h} cm`;
  $('productTag').hidden = false;
  setStatus('Real size · drag to look around', 'live');
});

// ---------------------------------------------------------------- Live / Class / Stage

function applyPreset(preset, role) {
  const p = PRESETS[preset];
  session.preset = preset;
  stage.setMount(p.mount);
  setSize(p.size);
  configureToolbar({ av: role === 'host', extras: role === 'host' ? ['panelBtn'] : p.viewerBtns });
}

function renderCast() {
  const { card, board, title } = session.cast;
  $('castCard').hidden = !card;
  if (card) {
    $('ccName').textContent = card.name || '';
    $('ccPrice').textContent = card.price || '';
    $('ccPrice').hidden = !card.price;
    const contact = String(card.contact || '').trim();
    const digits = contact.replace(/[\s()+-]/g, '');
    const order = $('ccOrder'), info = $('ccContact');
    order.hidden = true; info.hidden = true;
    if (/^\d{7,15}$/.test(digits)) {
      order.href = `https://wa.me/${digits}?text=${encodeURIComponent(`I'd like to order: ${card.name || ''}`)}`;
      order.textContent = 'Order on WhatsApp';
      order.hidden = false;
    } else if (/^https:\/\/[^\s]+$/i.test(contact)) {
      order.href = contact;
      order.textContent = 'Order here';
      order.hidden = false;
    } else if (contact) {
      info.textContent = `Order: ${contact}`;
      info.hidden = false;
    }
  }
  $('castBoard').hidden = !board;
  $('boardOut').textContent = board || '';
  $('castTitle').hidden = !title;
  if (title) { $('ltName').textContent = title.name || ''; $('ltRole').textContent = title.role || ''; }
}

function spawnReaction(kind) {
  const layer = $('reactions');
  if (layer.childElementCount > 40) return;
  const s = document.createElement('span');
  s.textContent = kind === 'clap' ? '👏' : '❤️';
  s.style.left = `${Math.random() * 50}px`;
  s.style.setProperty('--dx', `${(Math.random() - 0.5) * 50}px`);
  s.addEventListener('animationend', () => s.remove());
  layer.appendChild(s);
}

function renderHands() {
  const list = $('handList');
  list.textContent = '';
  if (!session.hands.size) {
    const li = document.createElement('li');
    li.className = 'empty';
    li.textContent = 'No hands up.';
    list.appendChild(li);
    return;
  }
  for (const [id, name] of session.hands) {
    const li = document.createElement('li');
    const n = document.createElement('span');
    n.textContent = `✋ ${name}`;
    const b = document.createElement('button');
    b.textContent = 'Done';
    b.addEventListener('click', () => { session.hands.delete(id); renderHands(); });
    li.append(n, b);
    list.appendChild(li);
  }
}

async function startHost(preset) {
  if (!await begin({ camera: true, segmenter: true })) return;
  const p = PRESETS[preset];
  session.kind = 'host';
  session.cast = { card: null, board: '', title: null };
  session.hands.clear();
  session.hearts = session.claps = 0;
  $('heartCount').textContent = '0';
  $('clapCount').textContent = '0';
  applyPreset(preset, 'host');
  resetVideo();
  stage.showVideo(media.local.stream, { mirror: true, muted: true });  // presenters preview themselves
  for (const id of ['studioLive', 'studioClass', 'studioStage']) $(id).hidden = id !== p.studio;
  $('studio').hidden = false;
  renderHands();
  renderCast();
  setStatus('Opening…', 'busy');
  const snapshot = () => ({
    preset, ...session.cast,
    av: { mic: media.local.mic && media.local.hasAudio, cam: media.local.cam },
    cutout: media.local.facing === 'user',
  });
  session.link = net.castHost(media.local.stream, snapshot, {
    onCode(code) {
      showInvite(code, preset, { label: p.inviteLabel, note: p.note });
      setStatus(`${p.label} · on air · 0 watching`, 'live');
    },
    onViewers(n) { setStatus(`${p.label} · on air · ${n} watching`, 'live'); },
    onMessage(msg, id, name) {
      if (msg.t === 'react' && (msg.k === 'heart' || msg.k === 'clap')) {
        const last = session.reactAt.get(id) || 0;
        if (performance.now() - last < 250) return;  // one per viewer per quarter-second
        session.reactAt.set(id, performance.now());
        if (msg.k === 'heart') $('heartCount').textContent = String(++session.hearts);
        else $('clapCount').textContent = String(++session.claps);
        spawnReaction(msg.k);
        session.link.send({ t: 'react', k: msg.k });
      } else if (msg.t === 'hand') {
        if (msg.up) {
          session.hands.set(id, name || 'A student');
          toast(`${name || 'A student'} raised a hand.`);
        } else session.hands.delete(id);
        renderHands();
      }
    },
    onError(err) { setStatus('Connection problem', 'bad'); toast(net.friendlyError(err), 6000); },
  });
}

function pushCast(patch) {
  Object.assign(session.cast, patch);
  renderCast();
  session.link?.send({ t: 'cast', ...session.cast });
}

$('btnLive').addEventListener('click', () => startHost('live'));
$('btnClass').addEventListener('click', () => startHost('class'));
$('btnStage').addEventListener('click', () => startHost('stage'));

$('cardShow').addEventListener('click', () => {
  const name = $('cardName').value.trim();
  if (!name) { toast('Type the product name first.'); $('cardName').focus(); return; }
  pushCast({ card: { name, price: $('cardPrice').value.trim(), contact: $('cardContact').value.trim() } });
  toast('Viewers can see the product card now.');
});
$('cardHide').addEventListener('click', () => pushCast({ card: null }));
$('boardShow').addEventListener('click', () => {
  const text = $('boardText').value.trim();
  if (!text) { toast('Write something on the board first.'); return; }
  pushCast({ board: text });
});
$('boardHide').addEventListener('click', () => { $('boardText').value = ''; pushCast({ board: '' }); });
$('titleShow').addEventListener('click', () => {
  const name = $('titleName').value.trim();
  if (!name) { toast('Type the speaker\'s name first.'); $('titleName').focus(); return; }
  pushCast({ title: { name, role: $('titleRole').value.trim() } });
});
$('titleHide').addEventListener('click', () => pushCast({ title: null }));

async function startViewer(preset, code, name) {
  if (!await begin({ segmenter: true })) return;
  session.kind = 'viewer';
  session.cast = { card: null, board: '', title: null };
  applyPreset(preset, 'viewer');
  setStatus(`Joining ${code}…`, 'busy');
  let watching = 0;
  const label = () => `${PRESETS[session.preset].label} · ${watching} watching`;
  session.link = net.castJoin(code, name, {
    onStream(s) { showRemote(s); setStatus(label(), 'live'); },
    onMessage(msg) {
      if (handleRemoteAv(msg)) return;
      if (msg.t === 'state' || msg.t === 'cast') {
        if (msg.t === 'state') {
          if (PRESETS[msg.preset] && msg.preset !== session.preset) applyPreset(msg.preset, 'viewer');
          if (msg.av) handleRemoteAv({ t: 'av', ...msg.av });
          if (msg.cutout === false) setCutout(false);
        }
        session.cast = {
          card: msg.card && typeof msg.card === 'object' ? msg.card : null,
          board: typeof msg.board === 'string' ? msg.board.slice(0, 400) : '',
          title: msg.title && typeof msg.title === 'object' ? msg.title : null,
        };
        renderCast();
      } else if (msg.t === 'count') {
        watching = Number(msg.n) || 0;
        if (stage.subjectKind()) setStatus(label(), 'live');
      } else if (msg.t === 'react' && (msg.k === 'heart' || msg.k === 'clap')) {
        spawnReaction(msg.k);
      }
    },
    onEnded(reason) {
      stage.clearSubject();
      $('remoteState').hidden = true;
      if (reason === 'full') { setStatus('This broadcast is full', 'bad'); toast(`This prototype allows ${net.MAX_VIEWERS} viewers per broadcast, and it's full.`, 6000); }
      else { setStatus('The broadcast has ended', 'idle'); toast('The presenter ended the broadcast.'); }
    },
    onNotFound() { setStatus('Nothing live on that code', 'bad'); toast(`Nothing is live on code ${code}. Check the code, or ask the presenter to start again.`, 6500); },
    onNoAnswer() { setStatus('No video yet', 'bad'); toast('Connected, but no video arrived. Ask the presenter to check their connection.', 6000); },
    onError(err) { setStatus('Connection problem', 'bad'); toast(net.friendlyError(err), 6000); },
  });
}

document.querySelectorAll('.castjoin').forEach((form) => form.addEventListener('submit', (e) => {
  e.preventDefault();
  const preset = form.dataset.preset;
  const input = form.querySelector('.codein');
  const code = cleanCode(input.value);
  if (code.length !== 6) { toast('Codes are 6 letters and numbers, like K7Q2MX.'); input.focus(); return; }
  const name = form.querySelector('.namein')?.value.trim().slice(0, 30) || '';
  if (name) try { localStorage.setItem('holocall.name', name); } catch { /* private mode */ }
  if (preset === 'class' && !name) { toast('Type your name so the teacher knows who you are.'); form.querySelector('.namein').focus(); return; }
  startViewer(preset, code, name);
}));

$('heartBtn').addEventListener('click', () => session.link?.send({ t: 'react', k: 'heart' }));
$('clapBtn').addEventListener('click', () => session.link?.send({ t: 'react', k: 'clap' }));
$('handBtn').addEventListener('click', () => {
  const up = $('handBtn').getAttribute('aria-pressed') !== 'true';
  $('handBtn').setAttribute('aria-pressed', String(up));
  $('handBtn').textContent = up ? '✋ Lower hand' : '✋ Raise hand';
  session.link?.send({ t: 'hand', up });
  if (up) toast('Your hand is up. The teacher can see it.');
});

// ---------------------------------------------------------------- views & modes

let glasses = false, display = false;

function setMorePanel(open) {
  $('morePanel').hidden = !open;
  $('moreBtn').setAttribute('aria-expanded', String(open));
  $('moreBtn').textContent = open ? 'View ▾' : 'View ▴';
}
$('moreBtn').addEventListener('click', () => setMorePanel($('morePanel').hidden));
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('morePanel').hidden) setMorePanel(false); });
$('stage').addEventListener('pointerdown', () => setMorePanel(false));
// Tapping a product part (a door, a burner) changes its state, so refresh the buttons.
$('stage').addEventListener('pointerup', () => { if (session.product) setTimeout(renderProductControls, 0); });

document.querySelectorAll('[data-view]').forEach((b) => b.addEventListener('click', async () => {
  try {
    await stage.setView(b.dataset.view);
    const camEnded = media.local.stream?.getVideoTracks().some((t) => t.readyState === 'ended');
    if (b.dataset.view === 'camera' && camEnded) {
      toast('This phone can\'t run both cameras at once, so the other side may not see you in Camera AR.', 6000);
    }
  } catch (e) { toast(e.message, 5500); }
}));
stage.onViewChange((view) => {
  document.querySelectorAll('[data-view]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.view === view)));
});

stage.onXR({
  start() {
    setMorePanel(false);
    document.body.classList.add('in-xr');
    $('xrHint').textContent = session.kind === 'shop'
      ? 'Point at the floor or a table, then tap to place it at real size.'
      : 'Point at the floor, then tap to place the projector.';
    $('xrHint').hidden = false;
    $('exitMode').hidden = false;
  },
  placed() { $('xrHint').textContent = 'Walk around it. Tap another spot to move it.'; },
  end() {
    document.body.classList.remove('in-xr');
    $('xrHint').hidden = true;
    $('exitMode').hidden = !(glasses || display);
  },
});
// Taps on page controls in AR must not also move the placed object.
['exitMode', 'soundBtn', 'castCard', 'toolbar'].forEach((id) => $(id).addEventListener('beforexrselect', (e) => e.preventDefault()));

async function enterFullscreen() {
  try { await document.documentElement.requestFullscreen?.(); } catch { /* optional */ }
}

async function setGlasses(on) {
  glasses = on;
  $('glassesBtn').setAttribute('aria-pressed', String(on));
  document.body.classList.toggle('glasses', on);
  $('exitMode').hidden = !(on || display);
  stage.setGlasses(on);
  if (on) {
    setMorePanel(false);
    await enterFullscreen();
    try { await screen.orientation?.lock?.('landscape'); } catch { /* optional */ }
    toast('Side-by-side 3D. Put the phone in a Cardboard viewer, or set your display glasses to 3D (SBS) mode.', 6000);
  } else if (document.fullscreenElement && !display) {
    document.exitFullscreen().catch(() => {});
  }
}

async function setDisplay(on) {
  display = on;
  document.body.classList.toggle('display', on);
  $('exitMode').hidden = !(on || glasses);
  if (on) {
    setMorePanel(false);
    await enterFullscreen();
    toast('Display mode. Controls are hidden; the Exit button stays faint at the top.', 4000);
  } else if (document.fullscreenElement && !glasses) {
    document.exitFullscreen().catch(() => {});
  }
}

$('glassesBtn').addEventListener('click', () => setGlasses(!glasses));
$('displayBtn').addEventListener('click', () => setDisplay(true));
$('exitMode').addEventListener('click', () => {
  if (stage.inXR()) stage.endXR();
  else if (display) setDisplay(false);
  else setGlasses(false);
});
document.addEventListener('fullscreenchange', () => {
  if (document.fullscreenElement) return;
  if (glasses) setGlasses(false);
  if (display) setDisplay(false);
});

$('tiltBtn').addEventListener('click', async () => {
  const on = $('tiltBtn').getAttribute('aria-pressed') !== 'true';
  const ok = await stage.setTilt(on);
  $('tiltBtn').setAttribute('aria-pressed', String(on && ok));
  if (on && !ok) toast('No motion sensor found, or motion access was declined. Drag to look around instead.');
});

document.querySelectorAll('[data-style]').forEach((b) => b.addEventListener('click', () => setStyle(b.dataset.style === 'holo')));
$('sizeRange').addEventListener('input', (e) => stage.setSize(Number(e.target.value)));
$('soundBtn').addEventListener('click', () => { stage.unmuteSubject().catch(() => {}); $('soundBtn').hidden = true; });

// ---------------------------------------------------------------- end

function endSession() {
  keepAwake(false);
  session.link?.close();
  session.link = null;
  if (stage.inXR()) stage.endXR();
  stage.setView('room').catch(() => {});
  if (glasses) setGlasses(false);
  if (display) setDisplay(false);
  stage.setTilt(false);
  $('tiltBtn').setAttribute('aria-pressed', 'false');
  media.stopCamera();
  $('localVideo').srcObject = null;
  $('localVideo').hidden = true;
  for (const id of ['invite', 'studio', 'castCard', 'castBoard', 'castTitle', 'productTag', 'soundBtn', 'toolbar', 'remoteState']) $(id).hidden = true;
  setMorePanel(false);
  $('reactions').textContent = '';
  $('handBtn').setAttribute('aria-pressed', 'false');
  $('handBtn').textContent = '✋ Raise hand';
  $('productBtns').textContent = '';
  session.product?.dispose?.();
  session.product = null;
  $('tvRemote').hidden = true;
  $('wallRow').hidden = true;
  setStyle(true);
  setCutout(true);
  setSize(1);
  stage.setLobby(true);
  session.kind = session.preset = session.code = null;
  $('lobby').hidden = false;
  setStatus('Ready', 'idle');
  if (location.search) history.replaceState(null, '', `${location.pathname}${location.hash}`);
  stage.setWallColour(WALL_COLOURS.Cream);
  for (const o of $('wallSwatches').children) o.setAttribute('aria-pressed', String(o.title === 'Cream'));
}
$('hangup').addEventListener('click', endSession);
addEventListener('pagehide', () => session.link?.close());
addEventListener('beforeunload', (e) => {
  if (['call', 'host'].includes(session.kind) && session.link) { e.preventDefault(); e.returnValue = ''; }
});
addEventListener('offline', () => toast('You\'re offline. Calls will reconnect when the internet is back.', 6000));
addEventListener('online', () => { if (session.link) toast('Back online.'); });

// ---------------------------------------------------------------- boot

// Overlays sit just above the toolbar, which wraps to more rows on narrow screens.
new ResizeObserver(([entry]) => {
  const h = entry.target.hidden ? 0 : entry.target.getBoundingClientRect().height;
  document.documentElement.style.setProperty('--tb', `${Math.round(h)}px`);
}).observe($('toolbar'));

try { $('className').value = localStorage.getItem('holocall.name') || ''; } catch { /* private mode */ }

for (const input of document.querySelectorAll('.codein')) {
  input.addEventListener('input', () => { input.value = input.value.toUpperCase(); });
}

const startTab = location.hash.slice(1);
selectTab(TABS.includes(startTab) ? startTab : 'call');

// An invite link pre-fills the code; joining still takes one tap so sound can play.
const joinCode = cleanCode(new URLSearchParams(location.search).get('join') || '').slice(0, 6);
if (joinCode) {
  const tab = TABS.includes(startTab) && !['shop', 'about'].includes(startTab) ? startTab : 'call';
  selectTab(tab);
  const input = { call: 'callCode', live: 'liveCode', class: 'classCode', stage: 'stageCode' }[tab];
  $(input).value = joinCode;
  setStatus(`Invited · code ${joinCode} · tap to join`, 'busy');
  if (tab === 'class') $('className').focus();
}

// A shared product link (?item=fridge&opt=Silver#shop) opens that product straight away.
const sharedItem = new URLSearchParams(location.search).get('item');
if (sharedItem && CATALOG[sharedItem]) {
  selectTab('shop');
  const opt = new URLSearchParams(location.search).get('opt');
  openProduct(sharedItem, CATALOG[sharedItem].options?.includes(opt) ? opt : undefined);
}

stage.xrSupported().then((ok) => { document.querySelector('[data-view="xr"]').hidden = !ok; });
loadPersonSegmenter().catch(() => {});  // warm up while the visitor reads the lobby
