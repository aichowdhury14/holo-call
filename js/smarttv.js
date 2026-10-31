// The smart TV's screen: a small TV operating system drawn on a canvas that the 3D screen
// uses as its texture. Driven by the on-screen remote, the keyboard, or taps on the screen.
// Programmes are animated scenes drawn in code; "My video" plays a real file from the device.

import * as THREE from 'three';

const W = 960, H = 540;
const UI = '"Instrument Sans", system-ui, sans-serif';
const BN = '"Hind Siliguri", "Noto Sans Bengali", "Nirmala UI", sans-serif';

const MOVIES = [
  { title: 'Monsoon Express', meta: '2025 · Drama · 2h 4m', kind: 'rain', tint: ['#1d2b4f', '#4f6fa8'] },
  { title: 'The Tea Garden', meta: '2024 · Family · 1h 52m', kind: 'tea', tint: ['#1f4d2b', '#7fb069'] },
  { title: 'River of Stars', meta: '2026 · Romance · 2h 11m', kind: 'river', tint: ['#5a2448', '#f08a4b'] },
  { title: 'Dhaka Nights', meta: '2025 · Thriller · 1h 47m', kind: 'city', tint: ['#140f2e', '#c2367c'] },
  { title: 'Last Over', meta: '2024 · Sport · 2h 0m', kind: 'cricket', tint: ['#123d1f', '#e2b23c'] },
];
const VIDEOS = [
  { title: "Cox's Bazar sunset in 4K", meta: 'Travel BD · 1.2M views', kind: 'river' },
  { title: 'Sylhet tea gardens from a drone', meta: 'Sky Bangla · 860K views', kind: 'tea' },
  { title: 'Best last-over finishes', meta: 'Cricket Zone · 3.4M views', kind: 'cricket' },
  { title: 'Rainy evening in Dhaka', meta: 'City Walks · 410K views', kind: 'rain' },
  { title: 'Lo-fi Bangla beats to relax', meta: 'Gaan Studio · 2.1M views', kind: 'music' },
  { title: 'Old Dhaka at night', meta: 'Street Eats · 980K views', kind: 'city' },
];
const CHANNELS = [
  { name: 'Khobor 24', kind: 'news' },
  { name: 'Khela TV', kind: 'cricket' },
  { name: 'Gaan Bangla', kind: 'music' },
  { name: 'Prokriti HD', kind: 'tea' },
];
const TICKER = 'সর্বশেষ: ঢাকায় আজ হালকা থেকে মাঝারি বৃষ্টির সম্ভাবনা  •  পদ্মা সেতু দিয়ে ঈদের ছুটিতে রেকর্ড যান চলাচল  •  বিপিএলের নতুন মৌসুম শুরু আগামী মাসে  •  ';

function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

export class SmartTV {
  constructor() {
    this.canvas = document.createElement('canvas');
    this.canvas.width = W;
    this.canvas.height = H;
    this.g = this.canvas.getContext('2d');
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.on = false;
    this.screen = 'off';
    this.focus = 0;
    this.back = [];
    this.volume = 12;
    this.channel = 0;
    this.item = null;          // what the player is showing
    this.paused = false;
    this.progress = 0;
    this.osd = null;           // { text, until }
    this.video = null;         // <video> for the viewer's own file
    this.hits = [];
    this.onNeedVideo = null;   // called when "My video" needs a file
    this.onChange = null;      // called when power or volume changes
    this.draw(0);
  }

  dispose() {
    this.stopVideo();
    this.texture.dispose();
  }

  // ---------------------------------------------------------------- input

  power() {
    this.on = !this.on;
    if (this.on) { this.go('boot'); this.bootAt = performance.now(); } else { this.video?.pause(); this.screen = 'off'; }
    this.onChange?.();
  }

  go(screen, focus = 0, remember = true) {
    if (remember && this.screen !== 'boot' && this.screen !== 'off') this.back.push([this.screen, this.focus]);
    this.screen = screen;
    this.focus = focus;
  }

  press(key) {
    if (key === 'power') { this.power(); return; }
    if (!this.on) return;
    if (this.screen === 'boot') return;
    const s = this.screen;
    if (key === 'home') { this.video?.pause(); this.back = []; this.go('home', 0, false); return; }
    if (key === 'back') {
      if (s === 'myvideo') this.video?.pause();
      const prev = this.back.pop();
      if (prev) { this.screen = prev[0]; this.focus = prev[1]; } else this.go('home', 0, false);
      return;
    }
    if (key === 'netflix') { this.go('netflix'); return; }
    if (key === 'youtube') { this.go('youtube'); return; }
    if (key === 'volUp' || key === 'volDown') {
      this.volume = Math.max(0, Math.min(30, this.volume + (key === 'volUp' ? 1 : -1)));
      if (this.video) this.video.volume = this.volume / 30;
      this.osd = { text: 'volume', until: performance.now() + 1800 };
      this.onChange?.();
      return;
    }
    if (key === 'chUp' || key === 'chDown') {
      if (s !== 'live') this.go('live', 0);
      this.setChannel(this.channel + (key === 'chUp' ? 1 : -1));
      return;
    }
    const dir = { left: -1, right: 1 }[key] ?? 0;
    if (s === 'home') {
      if (key === 'down' && this.focus === 0) this.focus = 1;
      else if (key === 'up' && this.focus > 0) this.focus = 0;
      else if (dir && this.focus > 0) this.focus = Math.max(1, Math.min(4, this.focus + dir));
      else if (key === 'ok') this.open(['hero', 'netflix', 'youtube', 'live', 'myvideo'][this.focus]);
    } else if (s === 'netflix') {
      if (dir) this.focus = Math.max(0, Math.min(MOVIES.length - 1, this.focus + dir));
      else if (key === 'ok') this.play(MOVIES[this.focus]);
    } else if (s === 'youtube') {
      const rowLen = 3;
      if (dir) this.focus = Math.max(0, Math.min(VIDEOS.length - 1, this.focus + dir));
      else if (key === 'down') this.focus = Math.min(VIDEOS.length - 1, this.focus + rowLen);
      else if (key === 'up') this.focus = Math.max(0, this.focus - rowLen);
      else if (key === 'ok') this.play(VIDEOS[this.focus]);
    } else if (s === 'live') {
      if (key === 'up' || key === 'down') this.setChannel(this.channel + (key === 'up' ? 1 : -1));
    } else if (s === 'player') {
      if (key === 'ok') this.paused = !this.paused;
      else if (dir) this.progress = Math.max(0, Math.min(0.999, this.progress + dir * 0.05));
      this.osd = { text: 'progress', until: performance.now() + 2500 };
    } else if (s === 'myvideo') {
      if (key === 'ok') {
        if (!this.video) this.onNeedVideo?.();
        else if (this.video.paused) this.video.play().catch(() => {}); else this.video.pause();
      } else if (dir && this.video?.duration) {
        this.video.currentTime = Math.max(0, Math.min(this.video.duration - 0.5, this.video.currentTime + dir * 10));
      }
      this.osd = { text: 'progress', until: performance.now() + 2500 };
    }
  }

  open(what) {
    if (what === 'hero') this.play(MOVIES[2]);
    else if (what === 'live') { this.go('live'); this.setChannel(this.channel); }
    else if (what === 'myvideo') { this.go('myvideo'); if (this.video) this.video.play().catch(() => {}); }
    else this.go(what);
  }

  play(item) {
    this.go('player');
    this.item = item;
    this.paused = false;
    this.progress = 0.02;
    this.osd = { text: 'progress', until: performance.now() + 3000 };
  }

  setChannel(i) {
    this.channel = (i + CHANNELS.length) % CHANNELS.length;
    this.osd = { text: 'channel', until: performance.now() + 2500 };
  }

  // Taps on the 3D screen arrive as texture coordinates.
  tap(uv) {
    if (!this.on) { this.power(); return; }
    const x = uv.x * W, y = (1 - uv.y) * H;
    const hit = this.hits.find((r) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h);
    if (hit) { this.focus = hit.i; this.press('ok'); } else if (['player', 'myvideo'].includes(this.screen)) this.press('ok');
  }

  playFile(file) {
    this.stopVideo();
    const v = document.createElement('video');
    v.playsInline = true;
    v.loop = true;
    v.src = URL.createObjectURL(file);
    v.volume = this.volume / 30;
    this.video = v;
    this.videoName = file.name;
    if (!this.on) this.power();
    if (this.screen !== 'myvideo') this.go('myvideo');
    return v.play();
  }

  stopVideo() {
    if (!this.video) return;
    this.video.pause();
    URL.revokeObjectURL(this.video.src);
    this.video = null;
  }

  // ---------------------------------------------------------------- drawing

  tick(t) {
    if (this.screen === 'boot' && performance.now() - this.bootAt > 1800) this.go('home', 0, false);
    if (this.screen === 'player' && !this.paused) this.progress = (this.progress + 0.00025) % 1;
    this.draw(t);
    this.texture.needsUpdate = true;
  }

  draw(t) {
    const g = this.g;
    this.hits = [];
    g.save();
    g.textBaseline = 'alphabetic';
    switch (this.screen) {
      case 'off': g.fillStyle = '#050506'; g.fillRect(0, 0, W, H); break;
      case 'boot': this.drawBoot(t); break;
      case 'home': this.drawHome(t); break;
      case 'netflix': this.drawNetflix(t); break;
      case 'youtube': this.drawYoutube(t); break;
      case 'live': this.drawLive(t); break;
      case 'player': this.drawPlayer(t); break;
      case 'myvideo': this.drawMyVideo(t); break;
      default: break;
    }
    if (this.on && this.osd && performance.now() < this.osd.until) this.drawOsd();
    g.restore();
  }

  drawBoot(t) {
    const g = this.g;
    const k = Math.min(1, (performance.now() - this.bootAt) / 900);
    g.fillStyle = '#000'; g.fillRect(0, 0, W, H);
    g.globalAlpha = k;
    g.fillStyle = '#fff';
    g.font = `600 44px ${UI}`;
    g.textAlign = 'center';
    g.fillText('Smart TV', W / 2, H / 2);
    g.font = `400 18px ${UI}`;
    g.fillStyle = '#9aa4b2';
    g.fillText('Starting…', W / 2, H / 2 + 36);
    g.globalAlpha = 1;
  }

  drawHome(t) {
    const g = this.g;
    const bg = g.createLinearGradient(0, 0, W, H);
    bg.addColorStop(0, '#0d1b2e'); bg.addColorStop(1, '#1d1035');
    g.fillStyle = bg; g.fillRect(0, 0, W, H);
    // top bar
    g.fillStyle = '#e8eef8'; g.font = `600 22px ${UI}`; g.textAlign = 'left';
    g.fillText('Home', 40, 52);
    const now = new Date();
    g.textAlign = 'right';
    g.font = `500 20px ${UI}`;
    g.fillText(now.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }), W - 40, 52);
    this.wifi(W - 140, 40);
    // hero
    const hero = MOVIES[2];
    const hx = 40, hy = 80, hw = W - 80, hh = 250;
    this.sceneInto(hero.kind, t, hx, hy, hw, hh);
    const shade = g.createLinearGradient(hx, 0, hx + hw * 0.7, 0);
    shade.addColorStop(0, 'rgba(0,0,0,0.75)'); shade.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = shade; g.fillRect(hx, hy, hw, hh);
    g.textAlign = 'left';
    g.fillStyle = '#ffd59a'; g.font = `600 15px ${UI}`; g.fillText('FEATURED', hx + 30, hy + 60);
    g.fillStyle = '#fff'; g.font = `700 42px ${UI}`; g.fillText(hero.title, hx + 30, hy + 108);
    g.fillStyle = '#c9d2e0'; g.font = `400 17px ${UI}`; g.fillText(hero.meta, hx + 30, hy + 138);
    this.pill(hx + 30, hy + 168, 'Play', this.focus === 0);
    this.ring(hx, hy, hw, hh, this.focus === 0);
    this.hits.push({ i: 0, x: hx, y: hy, w: hw, h: hh });
    // apps row
    const apps = [
      ['Netflix', '#0b0b0b', '#e50914'],
      ['YouTube', '#ffffff', '#ff0000'],
      ['Live TV', '#0f5a8a', '#ffffff'],
      ['My video', '#2b2f3a', '#6fe7ff'],
    ];
    const tw = (W - 80 - 3 * 20) / 4, ty = 360, th = 130;
    apps.forEach(([name, bgc, fg], i) => {
      const x = 40 + i * (tw + 20);
      g.fillStyle = bgc;
      this.round(x, ty, tw, th, 14); g.fill();
      g.fillStyle = fg;
      g.textAlign = 'center';
      g.font = name === 'Netflix' ? `800 34px ${UI}` : `700 28px ${UI}`;
      g.fillText(name === 'Netflix' ? 'NETFLIX' : name, x + tw / 2, ty + th / 2 + 11);
      this.ring(x, ty, tw, th, this.focus === i + 1, 14);
      this.hits.push({ i: i + 1, x, y: ty, w: tw, h: th });
    });
    g.textAlign = 'left';
    g.fillStyle = '#8a96a8'; g.font = `400 15px ${UI}`;
    g.fillText('Use the remote, the arrow keys, or tap the screen.', 40, 522);
  }

  drawNetflix(t) {
    const g = this.g;
    g.fillStyle = '#0a0a0a'; g.fillRect(0, 0, W, H);
    const m = MOVIES[this.focus];
    this.sceneInto(m.kind, t, 0, 0, W, 300);
    const fade = g.createLinearGradient(0, 120, 0, 300);
    fade.addColorStop(0, 'rgba(10,10,10,0)'); fade.addColorStop(1, 'rgba(10,10,10,1)');
    g.fillStyle = fade; g.fillRect(0, 0, W, 300);
    const side = g.createLinearGradient(0, 0, W * 0.6, 0);
    side.addColorStop(0, 'rgba(10,10,10,0.85)'); side.addColorStop(1, 'rgba(10,10,10,0)');
    g.fillStyle = side; g.fillRect(0, 0, W, 300);
    g.textAlign = 'left';
    g.fillStyle = '#e50914'; g.font = `800 30px ${UI}`; g.fillText('NETFLIX', 40, 56);
    g.fillStyle = '#fff'; g.font = `700 40px ${UI}`; g.fillText(m.title, 40, 150);
    g.fillStyle = '#bbb'; g.font = `400 17px ${UI}`; g.fillText(m.meta, 40, 180);
    g.fillStyle = '#fff'; g.font = `600 19px ${UI}`; g.fillText('Trending in Bangladesh', 40, 300);
    const pw = 160, ph = 190, py = 320;
    MOVIES.forEach((mv, i) => {
      const x = 40 + i * (pw + 18);
      const grad = g.createLinearGradient(x, py, x + pw, py + ph);
      grad.addColorStop(0, mv.tint[0]); grad.addColorStop(1, mv.tint[1]);
      g.fillStyle = grad; this.round(x, py, pw, ph, 8); g.fill();
      g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(x, py + ph - 56, pw, 56);
      g.fillStyle = '#fff'; g.font = `700 17px ${UI}`;
      this.wrap(mv.title, x + 12, py + ph - 32, pw - 24, 20);
      this.ring(x, py, pw, ph, this.focus === i, 8);
      this.hits.push({ i, x, y: py, w: pw, h: ph });
    });
  }

  drawYoutube(t) {
    const g = this.g;
    g.fillStyle = '#0f0f0f'; g.fillRect(0, 0, W, H);
    g.textAlign = 'left';
    g.fillStyle = '#fff'; g.font = `700 26px ${UI}`; g.fillText('YouTube', 40, 50);
    const cw = 280, ch = 158, gap = 20;
    VIDEOS.forEach((v, i) => {
      const col = i % 3, row = Math.floor(i / 3);
      const x = 40 + col * (cw + gap), y = 80 + row * (ch + 66);
      this.sceneInto(v.kind, t * 0.3 + i, x, y, cw, ch);
      g.fillStyle = '#fff'; g.font = `600 16px ${UI}`; g.fillText(v.title, x, y + ch + 24);
      g.fillStyle = '#aaa'; g.font = `400 14px ${UI}`; g.fillText(v.meta, x, y + ch + 44);
      this.ring(x, y, cw, ch, this.focus === i, 6);
      this.hits.push({ i, x, y, w: cw, h: ch + 50 });
    });
  }

  drawLive(t) {
    const ch = CHANNELS[this.channel];
    this.scene(ch.kind, t, ch);
    const g = this.g;
    g.fillStyle = 'rgba(0,0,0,0.45)'; this.round(W - 150, 24, 120, 34, 6); g.fill();
    g.fillStyle = '#ff4d4d'; g.beginPath(); g.arc(W - 132, 41, 6, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#fff'; g.font = `700 16px ${UI}`; g.textAlign = 'left'; g.fillText('LIVE', W - 118, 47);
  }

  drawPlayer(t) {
    this.scene(this.item.kind, this.paused ? this.pausedAt ?? t : t, null);
    if (!this.paused) this.pausedAt = t;
    const g = this.g;
    if (this.paused) {
      g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(0, 0, W, H);
      g.fillStyle = '#fff'; g.fillRect(W / 2 - 26, H / 2 - 34, 18, 68); g.fillRect(W / 2 + 8, H / 2 - 34, 18, 68);
    }
  }

  drawMyVideo() {
    const g = this.g;
    g.fillStyle = '#000'; g.fillRect(0, 0, W, H);
    const v = this.video;
    if (v && v.readyState >= 2 && v.videoWidth) {
      const s = Math.min(W / v.videoWidth, H / v.videoHeight);
      const w = v.videoWidth * s, h = v.videoHeight * s;
      g.drawImage(v, (W - w) / 2, (H - h) / 2, w, h);
      return;
    }
    g.textAlign = 'center';
    g.fillStyle = '#fff'; g.font = `600 30px ${UI}`;
    g.fillText(v ? 'Loading your video…' : 'Play a video on this TV', W / 2, H / 2 - 30);
    if (!v) {
      g.fillStyle = '#9aa4b2'; g.font = `400 18px ${UI}`;
      g.fillText('Pick any video from this phone or computer to judge the screen size.', W / 2, H / 2 + 6);
      this.pill(W / 2 - 110, H / 2 + 40, 'Choose a video', true, 220);
      this.hits.push({ i: 0, x: W / 2 - 110, y: H / 2 + 40, w: 220, h: 48 });
    }
  }

  drawOsd() {
    const g = this.g;
    g.textAlign = 'left';
    if (this.osd.text === 'volume') {
      g.fillStyle = 'rgba(0,0,0,0.6)'; this.round(W - 300, H - 90, 260, 52, 10); g.fill();
      g.fillStyle = '#fff'; g.font = `600 18px ${UI}`; g.fillText(`Volume ${this.volume}`, W - 284, H - 57);
      g.fillStyle = '#444'; g.fillRect(W - 170, H - 66, 114, 6);
      g.fillStyle = '#6fe7ff'; g.fillRect(W - 170, H - 66, 114 * (this.volume / 30), 6);
    } else if (this.osd.text === 'channel') {
      const ch = CHANNELS[this.channel];
      g.fillStyle = 'rgba(0,0,0,0.6)'; this.round(30, 24, 300, 56, 10); g.fill();
      g.fillStyle = '#6fe7ff'; g.font = `700 26px ${UI}`; g.fillText(String(this.channel + 1).padStart(2, '0'), 46, 62);
      g.fillStyle = '#fff'; g.font = `600 20px ${UI}`; g.fillText(ch.name, 92, 60);
    } else if (this.osd.text === 'progress') {
      let p = this.progress, title = this.item?.title || '';
      if (this.screen === 'myvideo') {
        if (!this.video?.duration) return;
        p = this.video.currentTime / this.video.duration; title = this.videoName || 'My video';
      }
      const grad = g.createLinearGradient(0, H - 120, 0, H);
      grad.addColorStop(0, 'rgba(0,0,0,0)'); grad.addColorStop(1, 'rgba(0,0,0,0.75)');
      g.fillStyle = grad; g.fillRect(0, H - 120, W, 120);
      g.fillStyle = '#fff'; g.font = `600 20px ${UI}`; g.fillText(title, 40, H - 52);
      g.fillStyle = 'rgba(255,255,255,0.3)'; g.fillRect(40, H - 34, W - 80, 5);
      g.fillStyle = '#e50914'; g.fillRect(40, H - 34, (W - 80) * p, 5);
    }
  }

  // ---------------------------------------------------------------- programmes

  sceneInto(kind, t, x, y, w, h) {
    const g = this.g;
    g.save();
    this.round(x, y, w, h, 10);
    g.clip();
    g.translate(x, y);
    g.scale(w / W, h / H);
    this.scene(kind, t, null, true);
    g.restore();
  }

  scene(kind, t, channel, thumb = false) {
    const g = this.g;
    const painter = {
      river: () => {
        const sky = g.createLinearGradient(0, 0, 0, H * 0.6);
        sky.addColorStop(0, '#3b2a5c'); sky.addColorStop(0.6, '#e2725b'); sky.addColorStop(1, '#f6b26b');
        g.fillStyle = sky; g.fillRect(0, 0, W, H * 0.6);
        g.fillStyle = '#ffe2a8'; g.beginPath(); g.arc(W * 0.66, H * 0.5, 46, 0, Math.PI * 2); g.fill();
        const water = g.createLinearGradient(0, H * 0.6, 0, H);
        water.addColorStop(0, '#c86b52'); water.addColorStop(1, '#2b2340');
        g.fillStyle = water; g.fillRect(0, H * 0.6, W, H * 0.4);
        g.strokeStyle = 'rgba(255,220,170,0.45)'; g.lineWidth = 2;
        for (let i = 0; i < 14; i++) {
          const yy = H * 0.62 + i * 16, off = (t * 30 + i * 37) % 80;
          g.beginPath(); g.moveTo(W * 0.66 - 80 + off - 40, yy); g.lineTo(W * 0.66 - 20 + off, yy); g.stroke();
        }
        g.fillStyle = '#1c1426';
        g.fillRect(0, H * 0.58, W, 8);
        const bx = ((t * 18) % (W + 300)) - 150, by = H * 0.68 + Math.sin(t * 2) * 4;
        g.beginPath(); g.moveTo(bx - 110, by); g.quadraticCurveTo(bx, by + 34, bx + 110, by); g.lineTo(bx + 80, by + 10); g.lineTo(bx - 80, by + 10); g.fill();
        g.beginPath(); g.ellipse(bx, by - 2, 40, 22, 0, Math.PI, 0); g.fill();
        g.fillRect(bx + 60, by - 70, 4, 70);
        g.strokeStyle = '#1c1426'; g.lineWidth = 2;
        for (let i = 0; i < 4; i++) {
          const x = ((t * 40 + i * 140) % (W + 100)) - 50, y = 90 + i * 18 + Math.sin(t * 3 + i) * 6;
          g.beginPath(); g.moveTo(x - 10, y - 5); g.lineTo(x, y); g.lineTo(x + 10, y - 5); g.stroke();
        }
      },
      rain: () => {
        g.fillStyle = '#0d1424'; g.fillRect(0, 0, W, H);
        const r = rng(9);
        for (let i = 0; i < 12; i++) {
          const bw = 60 + r() * 60, bh = 160 + r() * 240, x = i * 82 - 10;
          g.fillStyle = '#18213a'; g.fillRect(x, H - bh - 60, bw, bh);
          for (let k = 0; k < 18; k++) {
            if (r() < 0.45) { g.fillStyle = r() < 0.7 ? '#f7d58a' : '#8fd3ff'; g.fillRect(x + 8 + (k % 4) * 14, H - bh - 40 + Math.floor(k / 4) * 26, 7, 10); }
          }
        }
        g.fillStyle = '#121a2c'; g.fillRect(0, H - 60, W, 60);
        g.strokeStyle = 'rgba(180,200,255,0.35)'; g.lineWidth = 1.2;
        const r2 = rng(4);
        for (let i = 0; i < 160; i++) {
          const x = r2() * W, y = (r2() * H + t * 420) % H;
          g.beginPath(); g.moveTo(x, y); g.lineTo(x - 4, y + 16); g.stroke();
        }
        const cx = ((t * 60) % (W + 200)) - 100;
        g.fillStyle = '#ffeaa0'; g.beginPath(); g.arc(cx, H - 36, 5, 0, Math.PI * 2); g.fill();
        g.fillStyle = 'rgba(255,234,160,0.15)'; g.fillRect(cx - 40, H - 30, 80, 30);
      },
      tea: () => {
        const sky = g.createLinearGradient(0, 0, 0, H * 0.5);
        sky.addColorStop(0, '#8ec5ef'); sky.addColorStop(1, '#e3f1fb');
        g.fillStyle = sky; g.fillRect(0, 0, W, H);
        g.fillStyle = 'rgba(255,255,255,0.85)';
        for (let i = 0; i < 4; i++) {
          const x = ((t * 12 + i * 260) % (W + 200)) - 100, y = 60 + i * 22;
          g.beginPath(); g.ellipse(x, y, 70, 18, 0, 0, Math.PI * 2); g.ellipse(x + 40, y - 10, 46, 16, 0, 0, Math.PI * 2); g.fill();
        }
        const hills = ['#5f9e4c', '#4c8a3d', '#3c7631', '#2f6226'];
        hills.forEach((c, i) => {
          const base = H * 0.42 + i * 70;
          g.fillStyle = c;
          g.beginPath(); g.moveTo(0, H);
          for (let x = 0; x <= W; x += 20) g.lineTo(x, base + Math.sin(x * 0.006 + i * 1.7) * 36);
          g.lineTo(W, H); g.fill();
          g.strokeStyle = 'rgba(20,50,15,0.35)'; g.lineWidth = 3;
          for (let k = 1; k < 4; k++) {
            g.beginPath();
            for (let x = 0; x <= W; x += 20) {
              const y = base + 14 * k + Math.sin(x * 0.006 + i * 1.7) * 36;
              if (x === 0) g.moveTo(x, y); else g.lineTo(x, y);
            }
            g.stroke();
          }
        });
        g.fillStyle = '#244a1c';
        for (const x of [180, 520, 790]) { g.fillRect(x, H * 0.38, 6, 50); g.beginPath(); g.arc(x + 3, H * 0.36, 34, 0, Math.PI * 2); g.fill(); }
      },
      cricket: () => {
        const field = g.createLinearGradient(0, 0, 0, H);
        field.addColorStop(0, '#3e8e3a'); field.addColorStop(1, '#1f5d22');
        g.fillStyle = field; g.fillRect(0, 0, W, H);
        g.fillStyle = 'rgba(255,255,255,0.05)';
        for (let i = 0; i < 10; i++) if (i % 2) g.fillRect(0, i * 54, W, 54);
        g.fillStyle = '#c9b27c';
        g.beginPath(); g.moveTo(W / 2 - 40, 90); g.lineTo(W / 2 + 40, 90); g.lineTo(W / 2 + 110, H); g.lineTo(W / 2 - 110, H); g.fill();
        g.fillStyle = '#f2efe6';
        for (const dx of [-8, 0, 8]) g.fillRect(W / 2 + dx - 2, 70, 4, 26);
        for (const dx of [-16, 0, 16]) g.fillRect(W / 2 + dx - 3, H - 90, 6, 60);
        const k = (t * 0.6) % 1;
        const by = 100 + k * (H - 200), bx = W / 2 + Math.sin(k * Math.PI) * 30;
        g.fillStyle = '#c0392b'; g.beginPath(); g.arc(bx, by, 3 + k * 6, 0, Math.PI * 2); g.fill();
        if (!thumb) {
          g.fillStyle = 'rgba(8,30,60,0.9)'; this.round(30, 26, 330, 64, 8); g.fill();
          g.fillStyle = '#e2b23c'; g.fillRect(30, 26, 8, 64);
          g.fillStyle = '#fff'; g.font = `700 24px ${UI}`; g.textAlign = 'left';
          g.fillText('BAN  245/6', 52, 58);
          g.font = `400 16px ${UI}`; g.fillStyle = '#cfe0f5';
          g.fillText('42.3 ov  ·  Need 38 from 45 balls', 52, 80);
        }
      },
      city: () => {
        g.fillStyle = '#0b0820'; g.fillRect(0, 0, W, H);
        const r = rng(21);
        for (let i = 0; i < 16; i++) {
          const bw = 40 + r() * 70, bh = 120 + r() * 260, x = i * 62;
          g.fillStyle = '#181236'; g.fillRect(x, H - bh - 80, bw, bh);
          g.fillStyle = ['#ff4fa3', '#49d6ff', '#ffd166'][i % 3];
          g.globalAlpha = 0.6 + 0.4 * Math.sin(t * 2 + i);
          g.fillRect(x + 6, H - bh - 70, bw - 12, 4);
          g.globalAlpha = 1;
        }
        g.fillStyle = '#16122c'; g.fillRect(0, H - 80, W, 80);
        for (let i = 0; i < 6; i++) {
          const x = ((t * (80 + i * 25) + i * 200) % (W + 200)) - 100;
          g.fillStyle = i % 2 ? '#ff5050' : '#fff3b0';
          g.fillRect(x, H - 50 + (i % 3) * 10, 40, 3);
        }
      },
      music: () => {
        const bg = g.createLinearGradient(0, 0, W, H);
        bg.addColorStop(0, '#2b0f3a'); bg.addColorStop(1, '#0b2c3d');
        g.fillStyle = bg; g.fillRect(0, 0, W, H);
        for (let i = 0; i < 32; i++) {
          const h = 40 + (Math.sin(t * 6 + i * 0.7) * 0.5 + 0.5) * (120 + 80 * Math.sin(i * 1.3 + t));
          g.fillStyle = `hsl(${180 + i * 4}, 80%, 65%)`;
          g.fillRect(80 + i * 25, H * 0.72 - h, 16, h);
        }
        if (!thumb) {
          g.fillStyle = '#fff'; g.textAlign = 'left'; g.font = `700 30px ${UI}`;
          g.fillText(channel ? channel.name : 'Lo-fi Bangla beats', 80, 90);
          g.font = `400 22px ${BN}`; g.fillStyle = '#cbd5e1';
          g.fillText('আমার সোনার বাংলা · Instrumental', 80, 124);
        }
      },
      news: () => {
        const bg = g.createLinearGradient(0, 0, W, H);
        bg.addColorStop(0, '#0b2a5a'); bg.addColorStop(1, '#0a4f8f');
        g.fillStyle = bg; g.fillRect(0, 0, W, H);
        g.strokeStyle = 'rgba(255,255,255,0.08)'; g.lineWidth = 2;
        for (let i = 0; i < 6; i++) { g.beginPath(); g.arc(W * 0.78, H * 0.38, 40 + i * 34, 0, Math.PI * 2); g.stroke(); }
        g.fillStyle = '#e8d4c0'; g.beginPath(); g.arc(W * 0.42, 200, 48, 0, Math.PI * 2); g.fill();
        g.fillStyle = '#1d2b44'; g.beginPath(); g.ellipse(W * 0.42, 370, 130, 110, 0, Math.PI, 0); g.fill();
        g.fillRect(W * 0.42 - 130, 370, 260, 60);
        g.fillStyle = '#c0392b'; g.fillRect(0, H - 130, 190, 46);
        g.fillStyle = '#fff'; g.font = `700 24px ${BN}`; g.textAlign = 'left';
        g.fillText('সর্বশেষ', 22, H - 98);
        g.fillStyle = 'rgba(255,255,255,0.95)'; g.fillRect(190, H - 130, W - 190, 46);
        g.fillStyle = '#0b2a5a'; g.font = `600 22px ${BN}`;
        g.fillText('বাংলাদেশে স্মার্ট টিভির বাজার বাড়ছে', 210, H - 98);
        g.fillStyle = '#0a1f40'; g.fillRect(0, H - 84, W, 44);
        g.save();
        g.beginPath(); g.rect(0, H - 84, W, 44); g.clip();
        g.fillStyle = '#ffd166'; g.font = `500 20px ${BN}`;
        const tw = g.measureText(TICKER).width || 1;
        const off = (t * 90) % tw;
        g.fillText(TICKER + TICKER, -off, H - 55);
        g.restore();
        g.fillStyle = '#fff'; g.font = `800 22px ${UI}`; g.fillText('KHOBOR 24', 30, 50);
      },
    }[kind];
    painter?.();
  }

  // ---------------------------------------------------------------- bits

  round(x, y, w, h, r) {
    const g = this.g;
    g.beginPath();
    g.moveTo(x + r, y);
    g.arcTo(x + w, y, x + w, y + h, r);
    g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r);
    g.arcTo(x, y, x + w, y, r);
    g.closePath();
  }

  ring(x, y, w, h, on, r = 12) {
    if (!on) return;
    const g = this.g;
    g.strokeStyle = '#ffffff'; g.lineWidth = 4;
    this.round(x - 4, y - 4, w + 8, h + 8, r + 3); g.stroke();
  }

  pill(x, y, text, on, w = 120) {
    const g = this.g;
    g.fillStyle = on ? '#ffffff' : 'rgba(255,255,255,0.2)';
    this.round(x, y, w, 48, 24); g.fill();
    g.fillStyle = on ? '#0b0b0b' : '#fff';
    g.font = `700 19px ${UI}`; g.textAlign = 'center';
    g.fillText(`▶  ${text}`, x + w / 2, y + 31);
    g.textAlign = 'left';
  }

  wifi(x, y) {
    const g = this.g;
    g.strokeStyle = '#e8eef8'; g.lineWidth = 2.5;
    for (let i = 1; i <= 3; i++) { g.beginPath(); g.arc(x, y + 8, i * 6, Math.PI * 1.25, Math.PI * 1.75); g.stroke(); }
  }

  wrap(text, x, y, maxW, lh) {
    const g = this.g, words = text.split(' ');
    let line = '', yy = y;
    for (const w of words) {
      const test = line ? `${line} ${w}` : w;
      if (g.measureText(test).width > maxW && line) { g.fillText(line, x, yy); line = w; yy += lh; } else line = test;
    }
    g.fillText(line, x, yy);
  }
}
