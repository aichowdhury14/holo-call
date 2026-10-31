import * as stage from './stage.js';
import { loadPersonSegmenter, segmentVideo, resetVideo } from './segment.js';
import { SAMPLES, loadPhoto, cutPhoto, wholePhoto } from './products.js';
import * as net from './net.js';

const $ = (id) => document.getElementById(id);
const TABS = ['call', 'shop', 'live', 'class', 'stage', 'about'];

const PRESETS = {
  live: {
    label: 'Live selling', mount: 'projector', size: 1, studio: 'studioLive', viewerBtns: ['heartBtn'],
    inviteLabel: 'Your live code', note: 'Viewers open the link to watch. They don\'t need a camera.',
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
  local: null,       // our camera stream
  code: null,
  cast: { card: null, board: '', title: null },
  hands: new Map(),
  reactAt: new Map(),
  hearts: 0,
  claps: 0,
};

// Live video subjects get a fresh AI mask every frame.
stage.onFrame(() => {
  if (stage.subjectKind() === 'video') segmentVideo(stage.subjectVideo, (f, w, h) => stage.writeMask(f, w, h));
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
const stopStream = (s) => s?.getTracks().forEach((t) => t.stop());

async function getLocalStream() {
  if (session.local) return session.local;
  if (!navigator.mediaDevices?.getUserMedia) throw new Error('This browser cannot open the camera. Open the page over https in Chrome, Edge or Safari.');
  const video = { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 30 } };
  try {
    session.local = await navigator.mediaDevices.getUserMedia({ video, audio: { echoCancellation: true, noiseSuppression: true } });
  } catch (e) {
    if (e.name === 'NotAllowedError') throw new Error('Camera permission was blocked. Allow the camera in the address bar, then try again.');
    if (e.name === 'NotFoundError') throw new Error('No camera found on this device.');
    session.local = await navigator.mediaDevices.getUserMedia({ video, audio: false });
  }
  $('localVideo').srcObject = session.local;
  return session.local;
}

function configureToolbar({ style = true, size = true, extras = [] } = {}) {
  $('styleSeg').hidden = !style;
  $('sizeWrap').hidden = !size;
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
    if (camera) { setStatus('Opening camera…', 'busy'); await getLocalStream(); }
    if (seg) { setStatus('Loading the AI cutout…', 'busy'); await seg; }
  } catch (e) {
    console.error(e);
    stopStream(session.local); session.local = null;
    setStatus('Could not start', 'bad');
    toast(e.message || 'Could not start the camera or the AI model. Check your connection and try again.', 7000);
    return false;
  } finally {
    setBusy(false);
  }
  $('lobby').hidden = true;
  $('toolbar').hidden = false;
  stage.setLobby(false);
  return true;
}

async function showRemote(stream) {
  resetVideo();
  const soundOk = await stage.showVideo(stream, { mirror: false, muted: false });
  $('soundBtn').hidden = soundOk;
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
$('panelBtn').addEventListener('click', () => { $('invite').hidden = !$('invite').hidden; });

// ---------------------------------------------------------------- Call tab

$('btnSolo').addEventListener('click', async () => {
  if (!await begin({ camera: true, segmenter: true })) return;
  session.kind = 'solo';
  stage.setMount('projector');
  resetVideo();
  stage.showVideo(session.local, { mirror: true, muted: true });
  configureToolbar();
  setStatus('Solo preview · this is how you would appear', 'live');
});

$('btnCall').addEventListener('click', async () => {
  if (!await begin({ camera: true, segmenter: true })) return;
  session.kind = 'call';
  stage.setMount('projector');
  configureToolbar({ extras: ['panelBtn'] });
  $('localVideo').hidden = false;
  setStatus('Opening a call line…', 'busy');
  session.link = net.callHost(session.local, {
    onCode(code) {
      showInvite(code, 'call', { label: 'Your call code', note: 'Open the link on another phone or laptop. When they join, they appear on the projector.' });
      setStatus(`Waiting for someone to join · ${code}`, 'busy');
    },
    onRemote(s) { showRemote(s); $('invite').hidden = true; setStatus('Live · drag to look around', 'live'); },
    onRemoteGone() {
      stage.clearSubject();
      setStatus(`They left · code ${session.code} is still open`, 'idle');
      toast('The other person left the call.');
    },
    onError(err) { setStatus('Connection problem', 'bad'); toast(net.friendlyError(err), 6000); },
  });
});

$('callJoin').addEventListener('submit', async (e) => {
  e.preventDefault();
  const code = cleanCode($('callCode').value);
  if (code.length !== 6) { toast('Call codes are 6 letters and numbers, like K7Q2MX.'); $('callCode').focus(); return; }
  if (!await begin({ camera: true, segmenter: true })) return;
  session.kind = 'call';
  stage.setMount('projector');
  configureToolbar();
  $('localVideo').hidden = false;
  setStatus(`Calling ${code}…`, 'busy');
  session.link = net.callJoin(code, session.local, {
    onRemote(s) { showRemote(s); setStatus('Live · drag to look around', 'live'); },
    onRemoteGone() { stage.clearSubject(); setStatus('Call ended', 'idle'); toast('The other person left the call.'); },
    onNotFound() { setStatus('No call with that code', 'bad'); toast(`No call is waiting on code ${code}. Check the code, or ask them to start the call again.`, 6500); },
    onNoAnswer() { setStatus('No answer', 'bad'); toast('They didn\'t pick up. They may already be in a call.', 6000); },
    onError(err) { setStatus('Connection problem', 'bad'); toast(net.friendlyError(err), 6000); },
  });
});

// ---------------------------------------------------------------- Shop tab

async function viewSample(id) {
  const sample = SAMPLES[id];
  if (!await begin()) return;
  session.kind = 'shop';
  const m = sample.make($('tvSize').value);
  stage.setMount('floor');
  stage.showModel(m.object, m.dims);
  configureToolbar({ style: false, size: false });
  $('productTag').textContent = m.label;
  $('productTag').hidden = false;
  setStatus('Real size · drag to look around', 'live');
}
document.querySelectorAll('[data-sample]').forEach((b) => b.addEventListener('click', () => viewSample(b.dataset.sample)));

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
  configureToolbar({ style: true, size: false });
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
  configureToolbar({ extras: role === 'host' ? ['panelBtn'] : p.viewerBtns });
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
  stage.showVideo(session.local, { mirror: true, muted: true });  // presenters preview themselves
  for (const id of ['studioLive', 'studioClass', 'studioStage']) $(id).hidden = id !== p.studio;
  $('studio').hidden = false;
  renderHands();
  renderCast();
  setStatus('Opening…', 'busy');
  session.link = net.castHost(session.local, () => ({ preset, ...session.cast }), {
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
      if (msg.t === 'state' || msg.t === 'cast') {
        if (msg.t === 'state' && PRESETS[msg.preset] && msg.preset !== session.preset) applyPreset(msg.preset, 'viewer');
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

document.querySelectorAll('[data-view]').forEach((b) => b.addEventListener('click', async () => {
  try {
    await stage.setView(b.dataset.view);
    const camEnded = session.local?.getVideoTracks().some((t) => t.readyState === 'ended');
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
  session.link?.close();
  session.link = null;
  if (stage.inXR()) stage.endXR();
  stage.setView('room').catch(() => {});
  if (glasses) setGlasses(false);
  if (display) setDisplay(false);
  stage.setTilt(false);
  $('tiltBtn').setAttribute('aria-pressed', 'false');
  stopStream(session.local);
  session.local = null;
  $('localVideo').srcObject = null;
  $('localVideo').hidden = true;
  for (const id of ['invite', 'studio', 'castCard', 'castBoard', 'castTitle', 'productTag', 'soundBtn', 'toolbar']) $(id).hidden = true;
  $('reactions').textContent = '';
  $('handBtn').setAttribute('aria-pressed', 'false');
  $('handBtn').textContent = '✋ Raise hand';
  setStyle(true);
  setSize(1);
  stage.setLobby(true);
  session.kind = session.preset = session.code = null;
  $('lobby').hidden = false;
  setStatus('Ready', 'idle');
  if (location.search) history.replaceState(null, '', `${location.pathname}${location.hash}`);
}
$('hangup').addEventListener('click', endSession);
addEventListener('pagehide', () => session.link?.close());

// ---------------------------------------------------------------- boot

// Overlays sit just above the toolbar, which wraps to more rows on narrow screens.
new ResizeObserver(([entry]) => {
  const h = entry.target.hidden ? 0 : entry.target.getBoundingClientRect().height;
  document.documentElement.style.setProperty('--tb', `${Math.round(h)}px`);
}).observe($('toolbar'));

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

stage.xrSupported().then((ok) => { document.querySelector('[data-view="xr"]').hidden = !ok; });
loadPersonSegmenter().catch(() => {});  // warm up while the visitor reads the lobby
