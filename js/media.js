// Our own camera and microphone: open, mute, camera off, switch front/back, and a mic level meter.

export const local = { stream: null, facing: 'user', mic: true, cam: true, hasAudio: false, cameras: 0 };

const VIDEO = { width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 30 } };
const AUDIO = { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 };

export async function openCamera() {
  if (local.stream) return local.stream;
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error('This browser cannot open the camera. Open the page over https in Chrome, Edge or Safari.');
  }
  const video = { ...VIDEO, facingMode: 'user' };
  try {
    local.stream = await navigator.mediaDevices.getUserMedia({ video, audio: AUDIO });
  } catch (e) {
    if (e.name === 'NotAllowedError') throw new Error('Camera permission was blocked. Allow the camera and microphone in the address bar, then try again.');
    if (e.name === 'NotFoundError') throw new Error('No camera found on this device.');
    // The microphone may be missing or busy; carry on with video so the call still works.
    local.stream = await navigator.mediaDevices.getUserMedia({ video, audio: false });
  }
  Object.assign(local, { facing: 'user', mic: true, cam: true, hasAudio: local.stream.getAudioTracks().length > 0 });
  try {
    local.cameras = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'videoinput').length;
  } catch { local.cameras = 1; }
  return local.stream;
}

export function stopCamera() {
  stopMeter();
  local.stream?.getTracks().forEach((t) => t.stop());
  local.stream = null;
}

export function setMic(on) {
  local.mic = on;
  local.stream?.getAudioTracks().forEach((t) => { t.enabled = on; });
}

export function setCam(on) {
  local.cam = on;
  local.stream?.getVideoTracks().forEach((t) => { t.enabled = on; });
}

// Swaps to the other camera. `replace(track)` pushes the new track into live connections.
// Phones usually can't open both cameras, so the old one is released first.
export async function flipCamera(replace) {
  const stream = local.stream;
  const old = stream.getVideoTracks()[0];
  const next = local.facing === 'user' ? 'environment' : 'user';
  old?.stop();
  let fresh;
  try {
    fresh = await navigator.mediaDevices.getUserMedia({ video: { ...VIDEO, facingMode: { exact: next } }, audio: false });
  } catch {
    fresh = await navigator.mediaDevices.getUserMedia({ video: { ...VIDEO, facingMode: local.facing }, audio: false });
    swapInto(stream, old, fresh.getVideoTracks()[0]);
    await replace(stream.getVideoTracks()[0]);
    throw new Error('Could not switch cameras on this device.');
  }
  swapInto(stream, old, fresh.getVideoTracks()[0]);
  local.facing = next;
  await replace(stream.getVideoTracks()[0]);
  return next;
}

function swapInto(stream, old, track) {
  track.enabled = local.cam;
  if (old) stream.removeTrack(old);
  stream.addTrack(track);
}

// ---------------------------------------------------------------- mic level

let meterCtx = null, meterStop = null;

// Calls onLevel(0..1) about 20 times a second. Start it from a click so audio is allowed.
export function startMeter(onLevel) {
  stopMeter();
  const track = local.stream?.getAudioTracks()[0];
  if (!track) return;
  try {
    meterCtx = meterCtx || new AudioContext();
    meterCtx.resume().catch(() => {});
    const src = meterCtx.createMediaStreamSource(new MediaStream([track]));
    const an = meterCtx.createAnalyser();
    an.fftSize = 512;
    src.connect(an);
    const buf = new Float32Array(an.fftSize);
    const id = setInterval(() => {
      an.getFloatTimeDomainData(buf);
      let sum = 0;
      for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
      onLevel(local.mic ? Math.min(1, Math.sqrt(sum / buf.length) * 6) : 0);
    }, 50);
    meterStop = () => { clearInterval(id); src.disconnect(); };
  } catch (e) { console.warn('mic meter', e); }
}

export function stopMeter() { meterStop?.(); meterStop = null; }
