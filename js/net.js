// Peer-to-peer video with PeerJS (free public signalling server + TURN relay).
// call*: one-to-one, both sides send video.  cast*: one presenter, many watch-only viewers.

/* global Peer */

const CALL_PREFIX = 'holocall-v2-call-';
const CAST_PREFIX = 'holocall-v2-cast-';
const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const MAX_VIEWERS = 12;   // the presenter uploads one copy of the video per viewer
const NO_ANSWER_MS = 20000;

export function makeCode() {
  let s = '';
  for (let i = 0; i < 6; i++) s += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  return s;
}

export function friendlyError(err) {
  const t = err?.type;
  if (t === 'network' || t === 'server-error' || t === 'socket-error' || t === 'socket-closed') {
    return 'Could not reach the call server. Check your internet connection and try again.';
  }
  if (t === 'browser-incompatible') return 'This browser does not support video calls. Use Chrome, Edge or Safari.';
  return `Connection problem: ${err?.message || t || 'unknown error'}`;
}

// Fires onGone once when the media connection dies (PeerJS 'close' is unreliable on some browsers).
function watchMedia(mc, onGone) {
  let done = false, timer = null;
  const gone = () => { if (!done) { done = true; clearTimeout(timer); onGone(); } };
  mc.on('close', gone);
  const pc = mc.peerConnection;
  pc?.addEventListener('iceconnectionstatechange', () => {
    const s = pc.iceConnectionState;
    clearTimeout(timer);
    if (s === 'failed' || s === 'closed') gone();
    else if (s === 'disconnected') timer = setTimeout(gone, 6000);
  });
}

// Host side keeps its peer alive when the signalling socket drops.
function keepAlive(peer) {
  peer.on('disconnected', () => { if (!peer.destroyed) peer.reconnect(); });
}

// ---------------------------------------------------------------- one-to-one

export function callHost(stream, h) {
  let peer, current = null;
  const open = () => {
    const code = makeCode();
    peer = new Peer(CALL_PREFIX + code, { debug: 1 });
    keepAlive(peer);
    peer.on('open', () => h.onCode(code));
    peer.on('call', (mc) => {
      if (current) { mc.close(); return; }
      current = mc;
      mc.answer(stream);
      mc.on('stream', (remote) => h.onRemote(remote));
      watchMedia(mc, () => { if (current === mc) { current = null; h.onRemoteGone(); } });
    });
    peer.on('error', (err) => {
      if (err.type === 'unavailable-id') { peer.destroy(); open(); return; }
      h.onError(err);
    });
  };
  open();
  return { close() { current?.close(); peer?.destroy(); } };
}

export function callJoin(code, stream, h) {
  const peer = new Peer({ debug: 1 });
  let mc = null, gotStream = false;
  const timer = setTimeout(() => { if (!gotStream) h.onNoAnswer(); }, NO_ANSWER_MS);
  peer.on('open', () => {
    mc = peer.call(CALL_PREFIX + code, stream);
    mc.on('stream', (remote) => { gotStream = true; clearTimeout(timer); h.onRemote(remote); });
    watchMedia(mc, () => { if (gotStream) h.onRemoteGone(); });
  });
  peer.on('error', (err) => {
    clearTimeout(timer);
    if (err.type === 'peer-unavailable') h.onNotFound(); else h.onError(err);
  });
  return { close() { clearTimeout(timer); mc?.close(); peer.destroy(); } };
}

// ---------------------------------------------------------------- one-to-many

// h: onCode(code), onViewers(count), onMessage(msg, viewerId, name), onError(err)
// getState(): snapshot sent to every new viewer.
export function castHost(stream, getState, h) {
  let peer;
  const viewers = new Map();  // peerId -> { conn, media, name }
  const count = () => {
    h.onViewers(viewers.size);
    broadcast({ t: 'count', n: viewers.size });
  };
  const drop = (id) => {
    const v = viewers.get(id);
    if (!v) return;
    viewers.delete(id);
    v.media?.close();
    count();
  };
  const open = () => {
    const code = makeCode();
    peer = new Peer(CAST_PREFIX + code, { debug: 1 });
    keepAlive(peer);
    peer.on('open', () => h.onCode(code));
    peer.on('connection', (conn) => {
      conn.on('open', () => {
        if (viewers.size >= MAX_VIEWERS) {
          conn.send({ t: 'full' });
          setTimeout(() => conn.close(), 500);
          return;
        }
        const name = String(conn.metadata?.name || '').slice(0, 40);
        const media = peer.call(conn.peer, stream);
        viewers.set(conn.peer, { conn, media, name });
        watchMedia(media, () => drop(conn.peer));
        conn.send({ ...getState(), t: 'state' });
        count();
      });
      conn.on('data', (msg) => {
        const v = viewers.get(conn.peer);
        if (v && msg && typeof msg === 'object') h.onMessage(msg, conn.peer, v.name);
      });
      conn.on('close', () => drop(conn.peer));
    });
    peer.on('error', (err) => {
      if (err.type === 'unavailable-id') { peer.destroy(); open(); return; }
      if (err.type === 'peer-unavailable') return;  // a viewer vanished mid-handshake
      h.onError(err);
    });
  };
  function broadcast(msg) {
    for (const v of viewers.values()) if (v.conn.open) v.conn.send(msg);
  }
  open();
  return {
    send: broadcast,
    close() {
      broadcast({ t: 'end' });
      setTimeout(() => peer?.destroy(), 300);
    },
  };
}

// h: onStream(stream), onMessage(msg), onEnded(reason), onNotFound(), onError(err)
export function castJoin(code, name, h) {
  const peer = new Peer({ debug: 1 });
  let conn = null, ended = false, gotStream = false;
  const end = (reason) => { if (!ended) { ended = true; h.onEnded(reason); } };
  const timer = setTimeout(() => { if (!gotStream && !ended) h.onNoAnswer(); }, NO_ANSWER_MS);
  peer.on('open', () => {
    conn = peer.connect(CAST_PREFIX + code, { reliable: true, metadata: { name } });
    conn.on('data', (msg) => {
      if (!msg || typeof msg !== 'object') return;
      if (msg.t === 'end') end('ended');
      else if (msg.t === 'full') { clearTimeout(timer); end('full'); }
      else h.onMessage(msg);
    });
    conn.on('close', () => end('ended'));
  });
  peer.on('call', (mc) => {
    mc.answer();  // watch-only: no camera needed
    mc.on('stream', (s) => { gotStream = true; clearTimeout(timer); h.onStream(s); });
    watchMedia(mc, () => end('lost'));
  });
  peer.on('error', (err) => {
    if (err.type === 'peer-unavailable') { clearTimeout(timer); h.onNotFound(); } else h.onError(err);
  });
  return {
    send(msg) { if (conn?.open) conn.send(msg); },
    close() { ended = true; clearTimeout(timer); conn?.close(); peer.destroy(); },
  };
}
