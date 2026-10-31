// On-device AI: the selfie segmenter cuts people out of live video, and the
// "magic touch" interactive segmenter cuts out whatever object the user taps in a photo.

const MP = new URL('../vendor/mediapipe-0.10.21/', import.meta.url).href;

let vision = null;
function getVision() {
  if (!vision) {
    vision = (async () => {
      const mod = await import(MP + 'vision_bundle.mjs');
      const files = await mod.FilesetResolver.forVisionTasks(MP + 'wasm');
      return { mod, files };
    })();
    vision.catch(() => { vision = null; });  // allow a retry after a network failure
  }
  return vision;
}

async function create(name, options) {
  const { mod, files } = await getVision();
  let lastErr;
  for (const delegate of ['GPU', 'CPU']) {
    try {
      return await mod[name].createFromOptions(files, { ...options, baseOptions: { ...options.baseOptions, delegate } });
    } catch (e) { lastErr = e; console.warn(name, delegate, 'failed', e); }
  }
  throw lastErr;
}

// ---------------------------------------------------------------- people in live video

let person = null, personLoading = null;
let lastVideoTime = -1, lastAt = 0;

export function loadPersonSegmenter() {
  if (!personLoading) {
    personLoading = create('ImageSegmenter', {
      baseOptions: { modelAssetPath: MP + 'selfie_segmenter.tflite' },
      runningMode: 'VIDEO', outputConfidenceMasks: true, outputCategoryMask: false,
    }).then((s) => (person = s));
    personLoading.catch(() => { personLoading = null; });
  }
  return personLoading;
}

export function resetVideo() { lastVideoTime = -1; }

// Runs at most ~30 times a second, and only when the video has a new frame.
// onMask receives (Float32Array, width, height); the array is only valid during the call.
export function segmentVideo(video, onMask) {
  if (!person || !video.srcObject || video.readyState < 2 || !video.videoWidth) return;
  const now = performance.now();
  if (video.currentTime === lastVideoTime || now - lastAt < 30) return;
  lastVideoTime = video.currentTime;
  lastAt = now;
  try {
    person.segmentForVideo(video, now, (result) => {
      const m = result.confidenceMasks && result.confidenceMasks[0];
      if (m) onMask(m.getAsFloat32Array(), m.width, m.height);
    });
  } catch (e) { console.warn(e); }
}

// ---------------------------------------------------------------- objects in photos

let touch = null;

export async function cutoutAt(image, x, y) {
  if (!touch) {
    touch = create('InteractiveSegmenter', {
      baseOptions: { modelAssetPath: MP + 'magic_touch.tflite' },
      outputConfidenceMasks: true, outputCategoryMask: false,
    });
    touch.catch(() => { touch = null; });
  }
  const seg = await touch;
  let out = null;
  seg.segment(image, { keypoint: { x, y } }, (result) => {
    const masks = result.confidenceMasks || [];
    const m = masks[masks.length - 1];
    if (m) out = { data: m.getAsFloat32Array().slice(), w: m.width, h: m.height };
  });
  if (!out) throw new Error('The cutout model returned nothing.');
  // Make sure the tapped point counts as "object", whichever way round the model reports it.
  const at = out.data[Math.min(out.h - 1, Math.floor(y * out.h)) * out.w + Math.min(out.w - 1, Math.floor(x * out.w))];
  if (at < 0.5) for (let i = 0; i < out.data.length; i++) out.data[i] = 1 - out.data[i];
  return out;
}
