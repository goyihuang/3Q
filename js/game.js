import * as THREE from './three.module.min.js';
import { HEROES, TROOPS, WEAPONS } from './heroes.js';

// ------------------------------------------------------------
// 基本設定
// ------------------------------------------------------------
const $ = (s) => document.querySelector(s);
const rand = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const ARENA_R = 58;
const IS_TOUCH = matchMedia('(pointer:coarse)').matches || 'ontouchstart' in window;

const renderer = new THREE.WebGLRenderer({ canvas: $('#c'), antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, IS_TOUCH ? 1.5 : 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 500);
function onResize() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.fov = w < h ? 56 : 42;
  camera.updateProjectionMatrix();
}
addEventListener('resize', onResize);
onResize();

// ------------------------------------------------------------
// 讓 2D 角色圖「膨脹」成立體模型：依照透明度輪廓計算距離場，
// 中央厚、邊緣薄，正反兩面縫合，保留原始造型與上色。
// ------------------------------------------------------------
const ART = {};
function buildPuff(img, worldH) {
  const W = img.width, H = img.height;
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const cx = cv.getContext('2d');
  cx.drawImage(img, 0, 0);
  const A = cx.getImageData(0, 0, W, H).data;
  const al = (x, y) => A[(clamp(y, 0, H - 1) * W + clamp(x, 0, W - 1)) * 4 + 3];
  let minY = H, maxY = 0, sx = 0, sw = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const a = al(x, y);
    if (a > 60) { minY = Math.min(minY, y); maxY = Math.max(maxY, y); sx += x * a; sw += a; }
  }
  const centerX = sx / sw;
  const step = 2;
  const gx = Math.floor((W - 1) / step) + 1, gy = Math.floor((H - 1) / step) + 1;
  const ins = new Uint8Array(gx * gy);
  for (let j = 0; j < gy; j++) for (let i = 0; i < gx; i++) {
    let m = 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) m = Math.max(m, al(i * step + dx, j * step + dy));
    ins[j * gx + i] = m > 30 ? 1 : 0;
  }
  // chamfer 距離轉換
  const D = new Float32Array(gx * gy);
  for (let k = 0; k < D.length; k++) D[k] = ins[k] ? 1e6 : 0;
  const g = (i, j) => (i < 0 || j < 0 || i >= gx || j >= gy) ? 0 : D[j * gx + i];
  for (let j = 0; j < gy; j++) for (let i = 0; i < gx; i++) {
    const k = j * gx + i; if (!D[k]) continue;
    D[k] = Math.min(D[k], g(i - 1, j) + 1, g(i, j - 1) + 1, g(i - 1, j - 1) + 1.414, g(i + 1, j - 1) + 1.414);
  }
  for (let j = gy - 1; j >= 0; j--) for (let i = gx - 1; i >= 0; i--) {
    const k = j * gx + i; if (!D[k]) continue;
    D[k] = Math.min(D[k], g(i + 1, j) + 1, g(i, j + 1) + 1, g(i + 1, j + 1) + 1.414, g(i - 1, j + 1) + 1.414);
  }
  let maxD = 0; for (const d of D) maxD = Math.max(maxD, d);
  const scale = worldH / (maxY - minY);
  const thick = worldH * 0.2;
  let Hh = new Float32Array(gx * gy);
  for (let k = 0; k < D.length; k++) Hh[k] = D[k] > 0 ? thick * Math.sqrt(D[k] / maxD) : 0;
  // 平滑
  for (let pass = 0; pass < 2; pass++) {
    const N = new Float32Array(Hh.length);
    for (let j = 0; j < gy; j++) for (let i = 0; i < gx; i++) {
      const k = j * gx + i;
      if (!ins[k]) continue;
      let s = 0, c = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const ii = i + dx, jj = j + dy;
        if (ii < 0 || jj < 0 || ii >= gx || jj >= gy) continue;
        s += Hh[jj * gx + ii]; c++;
      }
      N[k] = s / c;
    }
    Hh = N;
  }
  const nv = gx * gy;
  const pos = new Float32Array(nv * 2 * 3), uv = new Float32Array(nv * 2 * 2);
  for (let j = 0; j < gy; j++) for (let i = 0; i < gx; i++) {
    const k = j * gx + i, px = i * step, py = j * step;
    const x = (px - centerX) * scale, y = (maxY - py) * scale, z = Hh[k];
    pos.set([x, y, z], k * 3);
    pos.set([x, y, -z * 0.8], (k + nv) * 3);
    const u = (px + 0.5) / W, v = 1 - (py + 0.5) / H;
    uv.set([u, v], k * 2); uv.set([u, v], (k + nv) * 2);
  }
  const idx = [];
  for (let j = 0; j < gy - 1; j++) for (let i = 0; i < gx - 1; i++) {
    const a = j * gx + i, b = a + 1, c = a + gx, d = c + 1;
    if (!(ins[a] || ins[b] || ins[c] || ins[d])) continue;
    idx.push(a, c, b, b, c, d);
    idx.push(a + nv, b + nv, c + nv, b + nv, d + nv, c + nv);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  geo.computeBoundingSphere();
  return { geo, width: W * scale, height: worldH };
}

const texLoader = new THREE.TextureLoader();
function loadArt(key, file, worldH) {
  return new Promise((res, rej) => {
    texLoader.load(file, (tex) => {
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = 4;
      const p = buildPuff(tex.image, worldH);
      ART[key] = { tex, ...p, file };
      res();
    }, undefined, rej);
  });
}

// ------------------------------------------------------------
// 音效與音樂（WebAudio 即時合成）
// ------------------------------------------------------------
const Audio = {
  ctx: null, master: null, muted: false, bgmOn: false, noise: null,
  init() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain(); this.master.gain.value = 0.5; this.master.connect(this.ctx.destination);
    const len = this.ctx.sampleRate; const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0); for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.noise = buf;
  },
  toggle() { this.muted = !this.muted; if (this.master) this.master.gain.value = this.muted ? 0 : 0.5; $('#btnMute').style.opacity = this.muted ? 0.4 : 1; },
  nz(t, dur, type, f0, f1, vol, q = 1) {
    const c = this.ctx, s = c.createBufferSource(); s.buffer = this.noise;
    const f = c.createBiquadFilter(); f.type = type; f.Q.value = q;
    f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = c.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    s.connect(f); f.connect(g); g.connect(this.master); s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.02);
  },
  osc(t, dur, type, f0, f1, vol) {
    const c = this.ctx, o = c.createOscillator(); o.type = type;
    o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
    const g = c.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(this.master); o.start(t); o.stop(t + dur + 0.02);
  },
  play(name) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    switch (name) {
      case 'swing': this.nz(t, 0.14, 'bandpass', 600, 3500, 0.35, 2); break;
      case 'heavy': this.nz(t, 0.35, 'bandpass', 300, 2500, 0.5, 1.5); this.osc(t, 0.3, 'sawtooth', 120, 40, 0.15); break;
      case 'hit': this.osc(t, 0.12, 'sine', 160, 45, 0.5); this.nz(t, 0.08, 'highpass', 2000, 1000, 0.25); break;
      case 'shoot': this.nz(t, 0.1, 'bandpass', 2500, 900, 0.3, 4); break;
      case 'hurt': this.osc(t, 0.2, 'square', 220, 90, 0.12); break;
      case 'ko': this.osc(t, 0.25, 'triangle', 500, 120, 0.12); break;
      case 'boom': this.nz(t, 1.0, 'lowpass', 1800, 80, 0.8); this.osc(t, 0.8, 'sine', 90, 30, 0.7); break;
      case 'pickup': this.osc(t, 0.1, 'triangle', 660, 660, 0.2); this.osc(t + 0.08, 0.15, 'triangle', 990, 990, 0.2); break;
      case 'dash': this.nz(t, 0.18, 'bandpass', 1200, 400, 0.3, 1); break;
      case 'gong': [196, 247, 294].forEach((f, i) => this.osc(t + i * 0.01, 2.2, 'sine', f, f * 0.98, 0.25)); this.nz(t, 1.5, 'bandpass', 900, 500, 0.3, 3); break;
    }
  },
  // 鼓與五聲音階旋律
  bgmStep: 0, bgmNext: 0, timer: null,
  startBgm() {
    if (!this.ctx || this.timer) return;
    this.bgmNext = this.ctx.currentTime + 0.1; this.bgmStep = 0;
    const scale = [146.8, 174.6, 196, 220, 261.6, 293.7, 349.2, 392, 440];
    let melody = [];
    const genPhrase = () => { melody = []; let n = 4; for (let i = 0; i < 16; i++) { n = clamp(n + Math.floor(rand(-2, 3)), 0, scale.length - 1); melody.push(Math.random() < 0.65 ? scale[n] : 0); } };
    genPhrase();
    const spb = 60 / 138 / 2;
    this.timer = setInterval(() => {
      if (!this.bgmOn) return;
      while (this.bgmNext < this.ctx.currentTime + 0.2) {
        const s = this.bgmStep % 16, t = this.bgmNext;
        if (!this.muted) {
          if (s % 4 === 0 || s === 10 || s === 14) { this.osc(t, 0.35, 'sine', 110, 42, 0.55); this.nz(t, 0.08, 'lowpass', 900, 200, 0.25); }
          if (s % 4 === 2) this.nz(t, 0.05, 'highpass', 6000, 4000, 0.06);
          if (s === 4 || s === 12) { this.osc(t, 0.12, 'triangle', 330, 200, 0.12); this.nz(t, 0.12, 'bandpass', 1500, 900, 0.15, 2); }
          const m = melody[s];
          if (m && this.bgmStep % 64 >= 16) { this.osc(t, 0.28, 'triangle', m * 2, m * 2 * 0.995, 0.07); this.osc(t, 0.2, 'sawtooth', m, m, 0.018); }
          if (s === 0) this.osc(t, spb * 15, 'sawtooth', scale[Math.floor(this.bgmStep / 16) % 4 === 3 ? 2 : 0] / 2, 70, 0.04);
        }
        this.bgmStep++; if (this.bgmStep % 64 === 0) genPhrase();
        this.bgmNext += spb;
      }
    }, 50);
  },
};

// ------------------------------------------------------------
// 場景：戰場
// ------------------------------------------------------------
const scene = new THREE.Scene();
{
  const cv = document.createElement('canvas'); cv.width = 4; cv.height = 256;
  const g = cv.getContext('2d'); const gr = g.createLinearGradient(0, 0, 0, 256);
  gr.addColorStop(0, '#5f9fe0'); gr.addColorStop(0.55, '#bfe0f2'); gr.addColorStop(1, '#f3e3c0');
  g.fillStyle = gr; g.fillRect(0, 0, 4, 256);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace;
  scene.background = t;
}
scene.fog = new THREE.Fog(0xd6e6ee, 55, 150);
const hemi = new THREE.HemisphereLight(0xfff4e0, 0x6a7a40, 2.2);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xffeccc, 2.6);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -30, right: 30, top: 30, bottom: -30, near: 1, far: 120 });
sun.shadow.bias = -0.0005;
sun.shadow.normalBias = 0.02;
scene.add(sun, sun.target);

function noise2(x, z) { return Math.sin(x * 0.13 + Math.sin(z * 0.07) * 2) * Math.cos(z * 0.11 + Math.sin(x * 0.05)) ; }
function groundH(x, z) {
  const r = Math.hypot(x, z);
  if (r < 61) return 0;
  return Math.pow(r - 61, 1.25) * 0.42 * (1 + 0.35 * noise2(x, z)) + noise2(x * 2, z * 2) * 0.6;
}
const CAMPS = {
  player: new THREE.Vector3(0, 0, 44),
  west: new THREE.Vector3(-36, 0, 4),
  east: new THREE.Vector3(36, 0, 4),
  center: new THREE.Vector3(0, 0, -6),
  north: new THREE.Vector3(0, 0, -42),
};
function pathDist(x, z) {
  // 道路：南北主道 + 東西橫道
  const d1 = Math.abs(x + Math.sin(z * 0.08) * 3);
  const d2 = Math.abs(z - 4 + Math.sin(x * 0.07) * 3);
  return Math.min(d1, d2);
}
function buildWorld() {
  // 草地細節貼圖
  const cv = document.createElement('canvas'); cv.width = cv.height = 256;
  const g = cv.getContext('2d'); g.fillStyle = '#c9c9c9'; g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 2500; i++) {
    const v = Math.floor(rand(150, 255)); g.fillStyle = `rgb(${v},${v},${v})`;
    g.fillRect(rand(0, 256), rand(0, 256), rand(1, 3), rand(2, 6));
  }
  const detail = new THREE.CanvasTexture(cv); detail.wrapS = detail.wrapT = THREE.RepeatWrapping; detail.repeat.set(60, 60);
  detail.colorSpace = THREE.SRGBColorSpace; detail.anisotropy = 8;
  const size = 260, seg = 200;
  const geo = new THREE.PlaneGeometry(size, size, seg, seg); geo.rotateX(-Math.PI / 2);
  const p = geo.attributes.position; const col = new Float32Array(p.count * 3);
  const grass = new THREE.Color('#7fb24a'), grass2 = new THREE.Color('#5f9a3a'), dirt = new THREE.Color('#c9a46a'), rock = new THREE.Color('#8f8a6a');
  const c = new THREE.Color();
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getZ(i);
    const h = groundH(x, z); p.setY(i, h);
    c.copy(grass).lerp(grass2, (noise2(x * 1.7, z * 1.3) + 1) / 2);
    const pd = pathDist(x, z);
    if (Math.hypot(x, z) < 60) {
      if (pd < 4) c.lerp(dirt, clamp((4 - pd) / 2.2, 0, 1));
      for (const k of ['west', 'east', 'center', 'north', 'player']) {
        const cp = CAMPS[k]; const d = Math.hypot(x - cp.x, z - cp.z);
        if (d < 9) c.lerp(dirt, clamp((9 - d) / 3, 0, 0.85));
      }
    } else c.lerp(rock, clamp(h / 30, 0, 0.6));
    col.set([c.r, c.g, c.b], i * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.computeVertexNormals();
  const ground = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: detail, vertexColors: true, roughness: 1 }));
  ground.receiveShadow = true;
  scene.add(ground);

  const dummy = new THREE.Object3D();
  // 木柵欄
  {
    const n = 560;
    const lg = new THREE.CylinderGeometry(0.28, 0.3, 3.2, 6); lg.translate(0, 1.6, 0);
    const tip = new THREE.ConeGeometry(0.3, 0.7, 6); tip.translate(0, 3.55, 0);
    const mat = new THREE.MeshStandardMaterial({ color: '#8a5a32', roughness: 0.9, flatShading: true });
    const logs = new THREE.InstancedMesh(lg, mat, n), tips = new THREE.InstancedMesh(tip, mat, n);
    let m = 0;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      // 南北出口留空
      if (Math.abs(Math.sin(a)) > 0.995) continue;
      dummy.position.set(Math.cos(a) * 60.5, 0, Math.sin(a) * 60.5);
      dummy.rotation.set(rand(-0.05, 0.05), rand(0, 6), rand(-0.05, 0.05));
      dummy.scale.set(1, rand(0.85, 1.15), 1); dummy.updateMatrix();
      logs.setMatrixAt(m, dummy.matrix); tips.setMatrixAt(m, dummy.matrix); m++;
    }
    logs.count = tips.count = m;
    logs.castShadow = tips.castShadow = true; logs.receiveShadow = true;
    scene.add(logs, tips);
  }
  // 樹木
  {
    const trunk = new THREE.CylinderGeometry(0.25, 0.4, 2, 6); trunk.translate(0, 1, 0);
    const l1 = new THREE.ConeGeometry(2.2, 3.2, 7); l1.translate(0, 3.2, 0);
    const l2 = new THREE.ConeGeometry(1.6, 2.6, 7); l2.translate(0, 4.8, 0);
    const tm = new THREE.MeshStandardMaterial({ color: '#6b4426', flatShading: true });
    const lm = new THREE.MeshStandardMaterial({ color: '#3f8a3a', flatShading: true, roughness: 0.9 });
    const lm2 = new THREE.MeshStandardMaterial({ color: '#5aa846', flatShading: true, roughness: 0.9 });
    const N = 320;
    const T = new THREE.InstancedMesh(trunk, tm, N), L1 = new THREE.InstancedMesh(l1, lm, N), L2 = new THREE.InstancedMesh(l2, lm2, N);
    let m = 0;
    for (let i = 0; i < N * 3 && m < N; i++) {
      const a = rand(0, Math.PI * 2), r = rand(52, 110);
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      if (r < 59 && (pathDist(x, z) < 6)) continue;
      if (r > 59 && r < 63) continue;
      if (Math.abs(x) < 8 && Math.abs(z) > 50) continue;
      dummy.position.set(x, groundH(x, z) - 0.2, z);
      dummy.rotation.set(0, rand(0, 6), 0);
      const s = rand(0.8, 1.6); dummy.scale.set(s, s * rand(0.9, 1.3), s); dummy.updateMatrix();
      T.setMatrixAt(m, dummy.matrix); L1.setMatrixAt(m, dummy.matrix); L2.setMatrixAt(m, dummy.matrix); m++;
    }
    T.count = L1.count = L2.count = m;
    for (const o of [T, L1, L2]) { o.castShadow = true; scene.add(o); }
  }
  // 岩石
  {
    const rg = new THREE.DodecahedronGeometry(1, 0);
    const rm = new THREE.MeshStandardMaterial({ color: '#9a9488', flatShading: true });
    const N = 90; const R = new THREE.InstancedMesh(rg, rm, N);
    for (let i = 0; i < N; i++) {
      const a = rand(0, 6.28), r = i < 30 ? rand(20, 56) : rand(64, 120);
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      dummy.position.set(x, groundH(x, z), z); dummy.rotation.set(rand(0, 3), rand(0, 3), 0);
      const s = i < 30 ? rand(0.4, 1.1) : rand(1, 4); dummy.scale.set(s, s * 0.7, s * rand(0.8, 1.3)); dummy.updateMatrix();
      R.setMatrixAt(i, dummy.matrix);
    }
    R.castShadow = R.receiveShadow = true; scene.add(R);
  }
  // 草叢
  {
    const tg = new THREE.BufferGeometry();
    const v = [];
    for (let k = 0; k < 3; k++) {
      const a = (k / 3) * Math.PI;
      const cx = Math.cos(a) * 0.35, cz = Math.sin(a) * 0.35;
      v.push(-cx, 0, -cz, cx, 0, cz, 0, 0.7, 0);
    }
    tg.setAttribute('position', new THREE.Float32BufferAttribute(v, 3)); tg.computeVertexNormals();
    const gm = new THREE.MeshLambertMaterial({ color: '#6fae3e', side: THREE.DoubleSide });
    const N = 2600; const G = new THREE.InstancedMesh(tg, gm, N); let m = 0;
    const cc = new THREE.Color();
    for (let i = 0; i < N * 2 && m < N; i++) {
      const a = rand(0, 6.28), r = Math.sqrt(Math.random()) * 59;
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      if (pathDist(x, z) < 4.5) continue;
      dummy.position.set(x, 0, z); dummy.rotation.set(0, rand(0, 6), 0);
      const s = rand(0.45, 1.0); dummy.scale.set(s, s, s); dummy.updateMatrix();
      G.setMatrixAt(m, dummy.matrix); G.setColorAt(m, cc.setHSL(rand(0.22, 0.3), 0.5, rand(0.32, 0.45))); m++;
    }
    G.count = m; scene.add(G);
  }
  // 營地：帳篷、旗幟、篝火
  const flagTex = (ch, bg) => {
    const c = document.createElement('canvas'); c.width = 128; c.height = 192;
    const g = c.getContext('2d'); g.fillStyle = bg; g.fillRect(0, 0, 128, 192);
    g.strokeStyle = '#ffd04a'; g.lineWidth = 8; g.strokeRect(6, 6, 116, 180);
    g.fillStyle = '#fff3c4'; g.font = 'bold 96px serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(ch, 64, 100);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  };
  const myFlag = new THREE.MeshStandardMaterial({ map: flagTex('我', '#1e5fb4'), side: THREE.DoubleSide });
  const enFlag = new THREE.MeshStandardMaterial({ map: flagTex('敵', '#9c1c1c'), side: THREE.DoubleSide });
  const pole = new THREE.CylinderGeometry(0.08, 0.08, 6, 5); pole.translate(0, 3, 0);
  const poleMat = new THREE.MeshStandardMaterial({ color: '#5a3a1a' });
  const flagGeo = new THREE.PlaneGeometry(1.6, 2.4, 8, 1); flagGeo.translate(0.85, 4.6, 0);
  const tentGeo = new THREE.ConeGeometry(2.2, 2.8, 4); tentGeo.translate(0, 1.4, 0);
  const tentMat1 = new THREE.MeshStandardMaterial({ color: '#e8dcc0', flatShading: true });
  const tentMat2 = new THREE.MeshStandardMaterial({ color: '#b0473a', flatShading: true });
  const flags = [];
  for (const [k, cp] of Object.entries(CAMPS)) {
    const mine = k === 'player';
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * 6.28 + 0.6;
      const t = new THREE.Mesh(tentGeo, i % 2 ? tentMat2 : tentMat1);
      if (mine) t.position.set(cp.x + [-12, 12, -17][i], 0, cp.z + [3, 3, -3][i]);
      else t.position.set(cp.x + Math.cos(a) * 9, 0, cp.z + Math.sin(a) * 9);
      t.rotation.y = rand(0, 3);
      t.castShadow = true; t.receiveShadow = true; scene.add(t);
    }
    for (let i = 0; i < 2; i++) {
      const pm = new THREE.Mesh(pole, poleMat); pm.position.set(cp.x + (i ? 1 : -1) * (mine ? 6 : 3), 0, cp.z - 2); pm.castShadow = true; scene.add(pm);
      const f = new THREE.Mesh(flagGeo.clone(), mine ? myFlag : enFlag); f.position.copy(pm.position); f.castShadow = true; scene.add(f);
      flags.push(f);
    }
    const fire = makeFire(); fire.position.set(cp.x + (mine ? 8 : 0), 0, cp.z + (mine ? 1 : 2)); scene.add(fire); fires.push(fire);
  }
  world.flags = flags;
  // 遠山
  const mg = new THREE.ConeGeometry(1, 1, 6);
  const mm = new THREE.MeshStandardMaterial({ color: '#7f9a8a', flatShading: true });
  for (let i = 0; i < 26; i++) {
    const a = (i / 26) * 6.28 + rand(-0.1, 0.1), r = rand(150, 190);
    const m = new THREE.Mesh(mg, mm); const s = rand(30, 60);
    m.scale.set(s, s * rand(0.6, 1.1), s); m.position.set(Math.cos(a) * r, s * 0.3, Math.sin(a) * r); scene.add(m);
  }
}
const fires = [];
const world = {};
function makeFire() {
  const g = new THREE.Group();
  const logM = new THREE.MeshStandardMaterial({ color: '#4a2a12' });
  for (let i = 0; i < 3; i++) { const l = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 1.4, 5), logM); l.rotation.set(Math.PI / 2, 0, (i / 3) * 3.14); l.position.y = 0.15; g.add(l); }
  const fm = new THREE.MeshBasicMaterial({ color: '#ffa020', transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false });
  const f1 = new THREE.Mesh(new THREE.ConeGeometry(0.45, 1.3, 6), fm); f1.position.y = 0.75; g.add(f1);
  const f2 = new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.9, 6), fm.clone()); f2.material.color.set('#ffe070'); f2.position.y = 0.6; g.add(f2);
  const light = new THREE.PointLight(0xff9a40, 6, 9, 1.5); light.position.y = 1.2; g.add(light);
  g.userData = { f1, f2, light };
  return g;
}

// 圓形陰影貼圖
const blobTex = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d'); const gr = g.createRadialGradient(32, 32, 2, 32, 32, 32);
  gr.addColorStop(0, 'rgba(0,0,0,0.55)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c);
})();
const blobGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
const blobMat = new THREE.MeshBasicMaterial({ map: blobTex, transparent: true, depthWrite: false });
const ringGeo = new THREE.RingGeometry(0.55, 0.7, 28).rotateX(-Math.PI / 2);

// ------------------------------------------------------------
// 特效
// ------------------------------------------------------------
const fx = new THREE.Group(); scene.add(fx);
const effects = [];
function addEffect(obj, life, update) { fx.add(obj); effects.push({ obj, life, t: 0, update }); }
function updateEffects(dt) {
  for (let i = effects.length - 1; i >= 0; i--) {
    const e = effects[i]; e.t += dt;
    const k = e.t / e.life;
    if (k >= 1) { fx.remove(e.obj); e.obj.geometry?.dispose?.(); e.obj.material?.dispose?.(); effects.splice(i, 1); continue; }
    e.update(e.obj, k, dt);
  }
}
function slashFx(pos, angle, range, arcDeg, color, y = 0.9, thick = 0.9) {
  const arc = THREE.MathUtils.degToRad(Math.max(arcDeg, 50));
  const geo = new THREE.RingGeometry(Math.max(0.3, range - thick), range, 32, 1, -arc / 2, arc);
  geo.rotateX(-Math.PI / 2);
  const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, depthWrite: false });
  const m = new THREE.Mesh(geo, mat); m.position.set(pos.x, pos.y + y, pos.z); m.rotation.y = -angle;
  m.rotation.z = rand(-0.25, 0.25);
  addEffect(m, 0.22, (o, k) => { o.material.opacity = 0.85 * (1 - k); o.scale.setScalar(0.8 + k * 0.35); o.rotation.y = -angle + (k - 0.5) * 0.6; });
}
function ringFx(pos, r0, r1, color, life = 0.45, y = 0.15) {
  const geo = new THREE.RingGeometry(0.85, 1, 48); geo.rotateX(-Math.PI / 2);
  const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, depthWrite: false });
  const m = new THREE.Mesh(geo, mat); m.position.set(pos.x, y, pos.z);
  addEffect(m, life, (o, k) => { const r = r0 + (r1 - r0) * (1 - (1 - k) * (1 - k)); o.scale.setScalar(r); o.material.opacity = 0.9 * (1 - k); });
}
function pillarFx(pos, color, h = 10, r = 1.2, life = 0.6) {
  const geo = new THREE.CylinderGeometry(r, r * 1.3, h, 16, 1, true); geo.translate(0, h / 2, 0);
  const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.45, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, depthWrite: false });
  const m = new THREE.Mesh(geo, mat); m.position.set(pos.x, 0, pos.z);
  addEffect(m, life, (o, k) => { o.scale.set(1 - k * 0.8, 0.3 + k * 1.2, 1 - k * 0.8); o.material.opacity = 0.45 * (1 - k); });
}
function teleFx(pos, angle, range, arcDeg, dur) {
  const arc = THREE.MathUtils.degToRad(arcDeg);
  const geo = arcDeg >= 360 ? new THREE.CircleGeometry(range, 40) : new THREE.CircleGeometry(range, 32, -arc / 2, arc);
  geo.rotateX(-Math.PI / 2);
  const mat = new THREE.MeshBasicMaterial({ color: 0xff2a1a, transparent: true, opacity: 0.25, depthWrite: false });
  const m = new THREE.Mesh(geo, mat); m.position.set(pos.x, 0.06, pos.z); m.rotation.y = -angle;
  addEffect(m, dur, (o, k) => { o.material.opacity = 0.15 + 0.3 * k; });
}

// 火花粒子
const SPARKS = 900;
const sparkGeo = new THREE.BufferGeometry();
const sp = { pos: new Float32Array(SPARKS * 3), col: new Float32Array(SPARKS * 3), vel: new Float32Array(SPARKS * 3), life: new Float32Array(SPARKS), i: 0 };
sparkGeo.setAttribute('position', new THREE.BufferAttribute(sp.pos, 3));
sparkGeo.setAttribute('color', new THREE.BufferAttribute(sp.col, 3));
const sparkTex = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 32; const g = c.getContext('2d');
  const gr = g.createRadialGradient(16, 16, 0, 16, 16, 16); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.4, 'rgba(255,255,255,.6)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 32, 32); return new THREE.CanvasTexture(c);
})();
const sparks = new THREE.Points(sparkGeo, new THREE.PointsMaterial({ size: 0.45, map: sparkTex, vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
sparks.frustumCulled = false;
scene.add(sparks);
for (let i = 0; i < SPARKS; i++) sp.pos[i * 3 + 1] = -100;
const _c = new THREE.Color();
function burst(p, color, n = 12, speed = 8, up = 4) {
  _c.set(color);
  for (let k = 0; k < n; k++) {
    const i = sp.i = (sp.i + 1) % SPARKS;
    sp.pos.set([p.x, p.y, p.z], i * 3);
    const a = rand(0, 6.28), s = rand(0.3, 1) * speed;
    sp.vel.set([Math.cos(a) * s, rand(0.2, 1) * up, Math.sin(a) * s], i * 3);
    sp.col.set([_c.r, _c.g, _c.b], i * 3);
    sp.life[i] = rand(0.25, 0.6);
  }
}
function updateSparks(dt) {
  for (let i = 0; i < SPARKS; i++) {
    if (sp.life[i] <= 0) continue;
    sp.life[i] -= dt;
    if (sp.life[i] <= 0) { sp.pos[i * 3 + 1] = -100; continue; }
    sp.vel[i * 3 + 1] -= 15 * dt;
    for (let a = 0; a < 3; a++) sp.pos[i * 3 + a] += sp.vel[i * 3 + a] * dt;
    const f = Math.min(1, sp.life[i] * 3);
    sp.col[i * 3] *= 0.97 + 0.03 * f; sp.col[i * 3 + 1] *= 0.95; sp.col[i * 3 + 2] *= 0.93;
  }
  sparkGeo.attributes.position.needsUpdate = true;
  sparkGeo.attributes.color.needsUpdate = true;
}

// 浮動數字
const numsEl = $('#nums');
const numPool = [];
const _v = new THREE.Vector3();
function floatNum(pos, text, cls = '') {
  let el = numPool.pop();
  if (!el) { el = document.createElement('div'); numsEl.appendChild(el); }
  el.className = 'num ' + cls; el.textContent = text; el.style.display = 'block';
  nums.push({ el, p: pos.clone().add(new THREE.Vector3(rand(-0.4, 0.4), 2.2, 0)), t: 0 });
}
const nums = [];
function updateNums(dt) {
  for (let i = nums.length - 1; i >= 0; i--) {
    const n = nums[i]; n.t += dt; n.p.y += dt * 1.6;
    if (n.t > 0.8) { n.el.style.display = 'none'; numPool.push(n.el); nums.splice(i, 1); continue; }
    _v.copy(n.p).project(camera);
    n.el.style.left = ((_v.x + 1) / 2 * innerWidth) + 'px';
    n.el.style.top = ((1 - _v.y) / 2 * innerHeight) + 'px';
    n.el.style.opacity = n.t < 0.6 ? 1 : 1 - (n.t - 0.6) / 0.2;
  }
}

// ------------------------------------------------------------
// 單位
// ------------------------------------------------------------
class Unit {
  constructor(artKey, opts) {
    this.art = ART[artKey];
    this.team = opts.team; this.kind = opts.kind; this.def = opts.def;
    this.size = opts.size || 1;
    this.mat = new THREE.MeshStandardMaterial({ map: this.art.tex, alphaTest: 0.5, roughness: 0.7, metalness: 0, emissive: 0xffffff, emissiveIntensity: 0 });
    this.mesh = new THREE.Mesh(this.art.geo, this.mat);
    this.mesh.castShadow = true;
    this.flip = new THREE.Group(); this.flip.add(this.mesh);
    this.body = new THREE.Group(); this.body.add(this.flip);
    this.root = new THREE.Group(); this.root.add(this.body);
    this.root.scale.setScalar(this.size);
    const blob = new THREE.Mesh(blobGeo, blobMat); blob.scale.set(this.art.width * 0.75, 1, 1.1); blob.position.y = 0.03; this.root.add(blob);
    this.blob = blob;
    if (opts.ring) {
      const r = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: opts.ring, transparent: true, opacity: 0.85, depthWrite: false }));
      r.position.y = 0.05; r.scale.setScalar(this.art.width * 0.7); this.root.add(r); this.ring = r;
    }
    this.pos = this.root.position;
    this.kb = new THREE.Vector3();
    this.dir = new THREE.Vector3(-1, 0, 0);
    this.faceR = false; this.flipS = 1;
    this.y = 0; this.vy = 0; this.launched = false; this.down = 0;
    this.stun = 0; this.flash = 0; this.t = rand(0, 10);
    this.moving = 0; this.lean = 0; this.spin = 0;
    this.radius = 0.55 * this.size * Math.max(0.8, this.art.width / 1.8);
    this.hp = this.maxHp = opts.hp || 100;
    this.dead = false; this.deathT = 0;
    this.atkCd = rand(1, 3); this.wind = 0;
    scene.add(this.root);
  }
  face(dx) { if (Math.abs(dx) > 0.05) this.faceR = dx > 0; }
  update(dt) {
    this.t += dt;
    if (this.y > 0 || this.vy !== 0) {
      this.vy -= 32 * dt; this.y += this.vy * dt;
      if (this.y <= 0) { this.y = 0; this.vy = 0; if (this.launched) { this.launched = false; this.down = 0.45; burst(this.pos, '#d8c8a0', 6, 3, 2); } }
    }
    if (this.down > 0) this.down -= dt;
    this.pos.addScaledVector(this.kb, dt);
    this.kb.multiplyScalar(Math.exp(-7 * dt));
    const r = Math.hypot(this.pos.x, this.pos.z);
    if (r > ARENA_R) { this.pos.x *= ARENA_R / r; this.pos.z *= ARENA_R / r; }
    this.root.position.y = this.y;
    // 動畫
    const target = this.faceR ? -1 : 1;
    this.flipS += (target - this.flipS) * Math.min(1, dt * 14);
    this.flip.scale.x = Math.abs(this.flipS) < 0.08 ? 0.08 * Math.sign(this.flipS || 1) : this.flipS;
    this.flip.rotation.y = (1 - Math.abs(this.flipS)) * 0.6 + (this.faceR ? 0.22 : -0.22);
    const bob = this.moving > 0.1 ? Math.abs(Math.sin(this.t * 11)) * 0.16 : Math.sin(this.t * 3) * 0.02;
    this.body.position.y = bob;
    const sq = this.moving > 0.1 ? 1 + Math.sin(this.t * 22) * 0.04 : 1 + Math.sin(this.t * 3) * 0.015;
    this.body.scale.set(1 / Math.sqrt(sq), sq, 1);
    let rz = this.moving > 0.1 ? Math.sin(this.t * 11) * 0.06 : 0;
    rz += this.lean * (this.faceR ? -1 : 1);
    if (this.down > 0) rz = (this.faceR ? 1 : -1) * 1.2 * Math.min(1, this.down * 4);
    if (this.launched) rz = (this.faceR ? 1 : -1) * (0.6 + this.t * 8 % 6.28 * 0.0);
    this.body.rotation.z = rz;
    this.body.rotation.x = -0.18;
    this.lean *= Math.exp(-10 * dt);
    if (this.spin > 0) { this.spin -= dt; this.body.rotation.y += dt * 30; } else this.body.rotation.y *= Math.exp(-15 * dt);
    if (this.flash > 0) { this.flash -= dt; this.mat.emissiveIntensity = Math.max(0, this.flash / 0.12) * 0.9; }
    else this.mat.emissiveIntensity = 0;
    if (this.wind > 0) { this.mat.emissive.setRGB(1, 0.2, 0.1); this.mat.emissiveIntensity = 0.25 + 0.25 * Math.sin(this.t * 40); }
    else this.mat.emissive.setRGB(1, 1, 1);
  }
  remove() { scene.remove(this.root); this.mat.dispose(); this.ring?.material.dispose(); }
}

// ------------------------------------------------------------
// 遊戲狀態
// ------------------------------------------------------------
const G = {
  state: 'loading', hero: null, player: null, enemies: [], projs: [], items: [],
  ko: 0, combo: 0, maxCombo: 0, comboT: 0, time: 0, musou: 0, musouT: 0,
  hitstop: 0, shake: 0, officers: [], boss: null, phase: 0, spawnT: 0, later: [],
  camTarget: new THREE.Vector3(), selIndex: 0,
};
function later(t, fn) { G.later.push({ t, fn }); }

const keys = {};
const input = { x: 0, z: 0 };
addEventListener('keydown', (e) => {
  if (e.repeat) return;
  keys[e.code] = true;
  Audio.init();
  if (G.state === 'play') {
    if (e.code === 'KeyJ' || e.code === 'KeyZ') act('atk');
    if (e.code === 'KeyK' || e.code === 'KeyX') act('heavy');
    if (e.code === 'Space' || e.code === 'ShiftLeft') act('dash');
    if (e.code === 'KeyL' || e.code === 'KeyC') act('musou');
    if (e.code === 'Escape' || e.code === 'KeyP') pauseGame(true);
    if (e.code === 'Space') e.preventDefault();
  } else if (G.state === 'pause' && (e.code === 'Escape' || e.code === 'KeyP')) pauseGame(false);
  else if (G.state === 'select') {
    if (e.code === 'ArrowRight' || e.code === 'KeyD') selectHero((G.selIndex + 1) % HEROES.length);
    if (e.code === 'ArrowLeft' || e.code === 'KeyA') selectHero((G.selIndex + HEROES.length - 1) % HEROES.length);
    if (e.code === 'Enter' || e.code === 'KeyJ') startGame();
  } else if (G.state === 'title' && (e.code === 'Enter' || e.code === 'Space')) toSelect();
  if (e.code === 'KeyM') Audio.toggle();
});
addEventListener('keyup', (e) => { keys[e.code] = false; });
addEventListener('blur', () => { for (const k in keys) keys[k] = false; if (G.state === 'play') pauseGame(true); });

// 觸控
const touch = { id: null, x: 0, y: 0, dx: 0, dy: 0 };
{
  const stick = $('#stick'), knob = $('#knob');
  const move = (t) => {
    const r = stick.getBoundingClientRect();
    let dx = t.clientX - (r.left + r.width / 2), dy = t.clientY - (r.top + r.height / 2);
    const l = Math.hypot(dx, dy), m = 50; if (l > m) { dx *= m / l; dy *= m / l; }
    touch.dx = dx / m; touch.dy = dy / m;
    knob.style.transform = `translate(${dx}px,${dy}px)`;
  };
  stick.addEventListener('touchstart', (e) => { e.preventDefault(); Audio.init(); const t = e.changedTouches[0]; touch.id = t.identifier; move(t); }, { passive: false });
  stick.addEventListener('touchmove', (e) => { e.preventDefault(); for (const t of e.changedTouches) if (t.identifier === touch.id) move(t); }, { passive: false });
  const end = (e) => { for (const t of e.changedTouches) if (t.identifier === touch.id) { touch.id = null; touch.dx = touch.dy = 0; knob.style.transform = ''; } };
  stick.addEventListener('touchend', end); stick.addEventListener('touchcancel', end);
  document.querySelectorAll('.tb').forEach((b) => {
    b.addEventListener('touchstart', (e) => { e.preventDefault(); Audio.init(); act(b.dataset.k); if (b.dataset.k === 'heavy' || b.dataset.k === 'atk') keys['T_' + b.dataset.k] = true; }, { passive: false });
    b.addEventListener('touchend', (e) => { e.preventDefault(); keys['T_' + b.dataset.k] = false; }, { passive: false });
  });
}

// ------------------------------------------------------------
// 戰鬥
// ------------------------------------------------------------
function angleOf(v) { return Math.atan2(v.z, v.x); }
function dealDamage(target, dmg, src, dirX, dirZ, kb, launch, opts = {}) {
  if (target.dead) return false;
  if (target === G.player) return hurtPlayer(dmg, src);
  dmg = Math.round(dmg * rand(0.9, 1.1));
  target.hp -= dmg;
  target.flash = 0.12;
  const armor = target.kind === 'boss' ? 0.25 : target.kind === 'officer' ? 0.5 : 1;
  target.stun = Math.max(target.stun, (opts.stun || 0.4) * armor);
  target.wind = 0;
  target.kb.x += dirX * kb * armor; target.kb.z += dirZ * kb * armor;
  if (launch && (target.kind === 'soldier' || (target.kind === 'officer' && Math.random() < 0.3))) { target.vy = launch; target.y = Math.max(target.y, 0.01); target.launched = true; }
  else if (target.y > 0 && target.kind === 'soldier') { target.vy = Math.max(target.vy, 4); }
  target.face(-dirX);
  const hp = target.pos.clone(); hp.y += 1 * target.size + target.y;
  burst(hp, opts.color || '#ffe7a0', opts.big ? 16 : 8, 7, 5);
  floatNum(target.pos.clone().setY(target.y + target.size), dmg, opts.big ? 'big' : '');
  G.combo++; G.comboT = 2.2; G.maxCombo = Math.max(G.maxCombo, G.combo);
  addMusou(opts.musou ?? 1.1);
  G.hitstop = Math.max(G.hitstop, opts.big ? 0.06 : 0.025);
  if (target.hp <= 0) killEnemy(target, dirX, dirZ);
  return true;
}
function addMusou(v) { if (G.musouT > 0) return; G.musou = Math.min(100, G.musou + v); }
function killEnemy(e, dx, dz) {
  e.dead = true; e.deathT = 0;
  if (e.ring) e.ring.visible = false;
  e.vy = e.kind === 'soldier' ? rand(7, 11) : 8; e.y = Math.max(0.01, e.y); e.launched = true;
  e.kb.set(dx * 10, 0, dz * 10);
  G.ko++;
  Audio.play('ko');
  if (e.kind === 'soldier' && Math.random() < 0.045) spawnItem(e.pos, Math.random() < 0.7 ? 'bun' : 'wine');
  if (e.kind === 'officer') {
    banner(`擊破敵將「${e.def.name}」！`); Audio.play('gong');
    spawnItem(e.pos, 'bun'); spawnItem(e.pos.clone().add(new THREE.Vector3(1.2, 0, 0)), 'wine');
    ringFx(e.pos, 1, 10, '#ffd04a', 0.8);
    updateObjective();
    if (G.officers.every((o) => o.dead)) later(2.4, spawnBoss);
  }
  if (e.kind === 'boss') {
    banner('敵軍總大將 擊破！'); Audio.play('gong'); ringFx(e.pos, 1, 16, '#ffd04a', 1.2);
    G.slowmo = 1.2;
    later(2.5, () => endGame(true));
  }
}
function hurtPlayer(dmg, src) {
  const p = G.player;
  if (p.dead || p.inv > 0 || G.musouT > 0) return false;
  dmg = Math.round(dmg * rand(0.9, 1.1));
  p.hp -= dmg; p.flash = 0.12; p.inv = 0.35;
  if (src) { const dx = p.pos.x - src.pos.x, dz = p.pos.z - src.pos.z, l = Math.hypot(dx, dz) || 1; p.kb.x += dx / l * 5; p.kb.z += dz / l * 5; }
  p.stun = 0.18;
  floatNum(p.pos, dmg, 'hurt');
  Audio.play('hurt');
  G.musou = Math.min(100, G.musou + 2.5);
  G.shake = Math.max(G.shake, 0.25);
  if (p.hp <= 0) { p.hp = 0; p.dead = true; p.launched = true; p.vy = 8; later(2, () => endGame(false)); banner('敗北…'); }
  return true;
}
function meleeArc(src, range, arcDeg, dmg, kb, launch, opts) {
  const a0 = angleOf(src.dir);
  let hit = 0;
  for (const e of G.enemies) {
    if (e.dead) continue;
    const dx = e.pos.x - src.pos.x, dz = e.pos.z - src.pos.z, d = Math.hypot(dx, dz);
    if (d > range + e.radius) continue;
    if (arcDeg < 360 && d > e.radius + 0.4) {
      let da = Math.abs(Math.atan2(dz, dx) - a0); if (da > Math.PI) da = 2 * Math.PI - da;
      if (da > THREE.MathUtils.degToRad(arcDeg / 2) + 0.15) continue;
    }
    const l = d || 1;
    if (dealDamage(e, dmg, src, dx / l, dz / l, kb, launch, opts)) hit++;
  }
  if (hit) { Audio.play('hit'); G.shake = Math.max(G.shake, opts?.big ? 0.35 : 0.12); }
  return hit;
}
function aoe(center, radius, dmg, kb, launch, opts) {
  let hit = 0;
  for (const e of G.enemies) {
    if (e.dead) continue;
    const dx = e.pos.x - center.x, dz = e.pos.z - center.z, d = Math.hypot(dx, dz);
    if (d > radius + e.radius) continue;
    const l = d || 1;
    if (dealDamage(e, dmg, G.player, dx / l, dz / l, kb, launch, opts)) hit++;
  }
  if (hit) Audio.play('hit');
  return hit;
}

// 投射物
const arrowGeo = (() => { const g = new THREE.CylinderGeometry(0.04, 0.04, 1.2, 4); g.rotateZ(Math.PI / 2); return g; })();
const orbGeo = new THREE.SphereGeometry(0.35, 12, 10);
const stoneGeo = new THREE.DodecahedronGeometry(0.18);
function shoot(src, type, ang, opts) {
  let mesh;
  const color = opts.color || '#ffffff';
  if (type === 'arrow') mesh = new THREE.Mesh(arrowGeo, new THREE.MeshBasicMaterial({ color: '#fff2c0' }));
  else if (type === 'orb') mesh = new THREE.Mesh(orbGeo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending }));
  else mesh = new THREE.Mesh(stoneGeo, new THREE.MeshStandardMaterial({ color: '#7a6a5a' }));
  mesh.position.set(src.pos.x, src.pos.y + 0.9 * src.size, src.pos.z);
  mesh.rotation.y = -ang;
  scene.add(mesh);
  const speed = opts.speed || 22;
  G.projs.push({ mesh, vx: Math.cos(ang) * speed, vz: Math.sin(ang) * speed, life: opts.life || 0.8, team: src.team, dmg: opts.dmg, pierce: opts.pierce || 1, hitSet: new Set(), type, color, explode: opts.explode || 0, src, kb: opts.kb || 3, launch: opts.launch || 0 });
}
function updateProjs(dt) {
  for (let i = G.projs.length - 1; i >= 0; i--) {
    const p = G.projs[i];
    p.life -= dt;
    p.mesh.position.x += p.vx * dt; p.mesh.position.z += p.vz * dt;
    if (p.type === 'orb') { p.mesh.scale.setScalar(1 + Math.sin(p.life * 30) * 0.15); if (Math.random() < 0.5) burst(p.mesh.position, p.color, 1, 1, 1); }
    let done = p.life <= 0;
    if (p.team === 0) {
      for (const e of G.enemies) {
        if (e.dead || p.hitSet.has(e)) continue;
        const dx = e.pos.x - p.mesh.position.x, dz = e.pos.z - p.mesh.position.z;
        if (dx * dx + dz * dz < (e.radius + 0.4) ** 2) {
          p.hitSet.add(e);
          if (p.explode) { done = true; break; }
          const l = Math.hypot(p.vx, p.vz);
          dealDamage(e, p.dmg, p.src, p.vx / l, p.vz / l, p.kb, p.launch, { color: p.color });
          Audio.play('hit');
          if (--p.pierce <= 0) { done = true; break; }
        }
      }
      if (done && p.explode) {
        aoe(p.mesh.position, p.explode, p.dmg, 6, p.launch || 7, { color: p.color, big: true });
        ringFx(p.mesh.position, 0.5, p.explode, p.color, 0.4); burst(p.mesh.position, p.color, 20, 9, 7);
        G.shake = Math.max(G.shake, 0.2);
      }
    } else {
      const pl = G.player;
      const dx = pl.pos.x - p.mesh.position.x, dz = pl.pos.z - p.mesh.position.z;
      if (dx * dx + dz * dz < 0.7) { hurtPlayer(p.dmg, p.src); done = true; }
    }
    if (done) { scene.remove(p.mesh); p.mesh.material.dispose(); G.projs.splice(i, 1); }
  }
}

// 道具
const bunGeo = (() => { const g = new THREE.SphereGeometry(0.4, 14, 10); g.scale(1, 0.75, 1); return g; })();
const wineGeo = (() => { const g = new THREE.CylinderGeometry(0.22, 0.32, 0.7, 10); return g; })();
function spawnItem(pos, type) {
  const m = new THREE.Mesh(type === 'bun' ? bunGeo : wineGeo, new THREE.MeshStandardMaterial({ color: type === 'bun' ? '#fff3e0' : '#8a4a2a', emissive: type === 'bun' ? '#664400' : '#442200', emissiveIntensity: 0.4 }));
  m.position.set(pos.x + rand(-0.5, 0.5), 0.5, pos.z + rand(-0.5, 0.5)); m.castShadow = true; scene.add(m);
  G.items.push({ mesh: m, type, t: 0 });
}
function updateItems(dt) {
  const p = G.player;
  for (let i = G.items.length - 1; i >= 0; i--) {
    const it = G.items[i]; it.t += dt;
    it.mesh.position.y = 0.5 + Math.sin(it.t * 4) * 0.15; it.mesh.rotation.y += dt * 2;
    const d = Math.hypot(p.pos.x - it.mesh.position.x, p.pos.z - it.mesh.position.z);
    if (d < 1.3 && !p.dead) {
      if (it.type === 'bun') { const h = Math.round(p.maxHp * 0.3); p.hp = Math.min(p.maxHp, p.hp + h); floatNum(p.pos, '+' + h, 'heal'); }
      else { G.musou = 100; floatNum(p.pos, '無雙MAX', 'big'); }
      Audio.play('pickup'); burst(it.mesh.position, '#fff7a0', 14, 4, 6);
      scene.remove(it.mesh); it.mesh.material.dispose(); G.items.splice(i, 1);
    } else if (it.t > 40) { scene.remove(it.mesh); G.items.splice(i, 1); }
  }
}

// 玩家動作
function act(k) {
  if (G.state !== 'play') return;
  const p = G.player; if (!p || p.dead) return;
  if (k === 'musou') return startMusou();
  if (G.musouT > 0) return;
  if (k === 'dash') {
    if (p.dashCd > 0) return;
    p.dashCd = 0.45; p.dashT = 0.2; p.inv = 0.3; p.atkT = 0; p.comboIdx = -1;
    Audio.play('dash'); burst(p.pos.clone().setY(0.3), '#ffffff', 8, 4, 1);
    return;
  }
  if (p.stun > 0) return;
  if (p.atkT > 0.06) { p.buffer = k; return; }
  if (k === 'atk') lightAttack(); else heavyAttack();
}
function lightAttack() {
  const p = G.player, W = WEAPONS[G.hero.weapon];
  const idx = p.comboWin > 0 ? (p.comboIdx + 1) % 4 : 0;
  p.comboIdx = idx; const fin = idx === 3;
  p.atkT = W.interval * (fin ? 1.7 : 1); p.comboWin = p.atkT + 0.45;
  p.lean = fin ? 0.35 : 0.2;
  const col = G.hero.color;
  const dmg = W.dmg * G.hero.atk * (fin ? 1.8 : 1);
  aimAssist(p, W.proj ? 14 : W.range + 3);
  const ang = angleOf(p.dir);
  p.kb.x += p.dir.x * (fin ? 7 : 4); p.kb.z += p.dir.z * (fin ? 7 : 4);
  Audio.play('swing');
  if (W.proj === 'arrow') {
    const n = fin ? 5 : 1;
    for (let i = 0; i < n; i++) shoot(p, 'arrow', ang + (i - (n - 1) / 2) * 0.12, { dmg, pierce: fin ? 4 : 2, color: col, speed: 30, life: 0.6, kb: 4, launch: fin ? 8 : 0 });
    Audio.play('shoot');
    return;
  }
  if (W.proj === 'orb') {
    if (fin) for (let i = -1; i <= 1; i++) shoot(p, 'orb', ang + i * 0.3, { dmg, explode: 2.6, color: col, speed: 16, life: 0.7, launch: 9 });
    else shoot(p, 'orb', ang, { dmg, pierce: 3, color: col, speed: 18, life: 0.65 });
    Audio.play('shoot');
    return;
  }
  later(0.05, () => {
    const range = W.range * (fin ? 1.25 : 1), arc = fin ? Math.min(360, W.arc * 1.6) : W.arc;
    slashFx(p.pos, ang, range, arc, col, 0.9, fin ? 1.3 : 0.9);
    if (G.hero.weapon === 'mace' && fin) { ringFx(p.pos, 0.5, range + 1, col, 0.4); burst(p.pos.clone().setY(0.2), '#d8c8a0', 20, 8, 5); }
    meleeArc(p, range, arc, dmg, W.kb * (fin ? 1.6 : 1), fin ? 11 : 0, { color: col, big: fin });
  });
}
function heavyAttack() {
  const p = G.player, W = WEAPONS[G.hero.weapon];
  if (p.heavyCd > 0) return;
  p.heavyCd = 0.9; p.atkT = 0.55; p.comboWin = 0;
  const col = G.hero.color;
  const dmg = W.dmg * G.hero.atk * 2;
  aimAssist(p, 14);
  const ang = angleOf(p.dir);
  Audio.play('heavy');
  if (W.proj === 'arrow') {
    for (let i = 0; i < 9; i++) shoot(p, 'arrow', ang + (i - 4) * 0.14, { dmg: dmg * 0.7, pierce: 5, color: col, speed: 32, life: 0.7, launch: 9 });
    p.kb.x -= p.dir.x * 6; p.kb.z -= p.dir.z * 6;
    ringFx(p.pos, 0.5, 3, col, 0.3);
    return;
  }
  if (W.proj === 'orb') {
    const c = p.pos.clone().addScaledVector(p.dir, 5);
    pillarFx(c, col, 8, 1.6, 0.6); ringFx(c, 0.5, 4.5, col, 0.5);
    later(0.15, () => { aoe(c, 4.2, dmg, 6, 12, { color: col, big: true }); burst(c.clone().setY(1), col, 30, 10, 10); G.shake = 0.3; });
    return;
  }
  p.spin = 0.35;
  if (G.hero.weapon === 'spear') { p.dashT = 0.18; p.inv = 0.2; }
  for (let k = 0; k < 2; k++) later(0.08 + k * 0.16, () => {
    const R = W.range + 1.2;
    ringFx(p.pos, 0.6, R + 0.5, col, 0.35, 0.9);
    slashFx(p.pos, ang + k * Math.PI, R, 360, col, 0.9, 1.4);
    meleeArc(p, R, 360, dmg * 0.6, W.kb * 1.4, k === 1 ? 12 : 4, { color: col, big: k === 1 });
  });
}
function aimAssist(p, range) {
  // 沒有輸入方向時，自動朝向最近的敵人
  if (Math.hypot(input.x, input.z) > 0.2) return;
  let best = null, bd = range;
  for (const e of G.enemies) {
    if (e.dead) continue;
    const d = Math.hypot(e.pos.x - p.pos.x, e.pos.z - p.pos.z);
    if (d < bd) { bd = d; best = e; }
  }
  if (best) { p.dir.set(best.pos.x - p.pos.x, 0, best.pos.z - p.pos.z).normalize(); p.face(p.dir.x); }
}
function startMusou() {
  const p = G.player;
  if (G.musou < 100 || G.musouT > 0 || p.dead) return;
  G.musouT = 2.6; G.musouTick = 0; p.inv = 3;
  banner('無雙亂舞！');
  Audio.play('boom');
  flash(0.7);
  ringFx(p.pos, 1, 14, G.hero.color, 0.8);
  pillarFx(p.pos, G.hero.color, 14, 1.0, 0.9);
}
function updateMusou(dt) {
  if (G.musouT <= 0) return;
  const p = G.player;
  G.musouT -= dt; G.musouTick -= dt;
  G.musou = Math.max(0, (G.musouT / 2.6) * 100);
  p.spin = 0.1;
  G.shake = Math.max(G.shake, 0.15);
  const W = WEAPONS[G.hero.weapon];
  if (G.musouTick <= 0) {
    G.musouTick = 0.2;
    const col = G.hero.color;
    const dmg = W.dmg * G.hero.atk * 1.6;
    ringFx(p.pos, 1, 7.5, col, 0.35, 0.9);
    for (let i = 0; i < 3; i++) {
      const a = rand(0, 6.28), r = rand(2, 7);
      const c = p.pos.clone().add(new THREE.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r));
      pillarFx(c, i % 2 ? '#ffffff' : col, 9, 0.45, 0.45);
      burst(c.clone().setY(0.5), col, 10, 6, 10);
    }
    slashFx(p.pos, rand(0, 6.28), 6, 360, col, 1, 2);
    aoe(p.pos, 7.5, dmg, 9, 10, { color: col, big: true, musou: 0 });
    Audio.play('swing');
  }
  if (G.musouT <= 0) {
    // 終結一擊
    const col = G.hero.color;
    aoe(p.pos, 9, W.dmg * G.hero.atk * 4, 16, 14, { color: col, big: true, musou: 0 });
    ringFx(p.pos, 1, 12, '#ffffff', 0.7); pillarFx(p.pos, col, 18, 3, 0.8);
    burst(p.pos.clone().setY(1), col, 60, 14, 12);
    Audio.play('boom'); flash(0.5); G.shake = 0.6; G.musou = 0;
  }
}

// ------------------------------------------------------------
// 敵軍
// ------------------------------------------------------------
function spawnSoldier(x, z, troop) {
  troop = troop || pick(TROOPS);
  const e = new Unit('army_' + troop.id, { team: 1, kind: 'soldier', def: troop, hp: troop.hp * (1 + G.phase * 0.15), size: 0.82, ring: 0xc0302a });
  e.pos.set(x, 0, z);
  e.aggro = rand(18, 30);
  G.enemies.push(e);
  return e;
}
function spawnOfficer(hero, pos, kind) {
  const isBoss = kind === 'boss';
  const e = new Unit('hero_' + hero.id, { team: 1, kind, def: hero, hp: isBoss ? 4200 : 1300, size: isBoss ? 1.55 : 1.22, ring: isBoss ? 0xff3a1a : 0xffc020 });
  e.pos.copy(pos);
  e.weapon = WEAPONS[hero.weapon];
  e.aggro = isBoss ? 60 : 16;
  e.atkCd = 2;
  G.enemies.push(e);
  for (let i = 0; i < (isBoss ? 14 : 8); i++) {
    const a = rand(0, 6.28), r = rand(2.5, 6);
    spawnSoldier(pos.x + Math.cos(a) * r, pos.z + Math.sin(a) * r).aggro = 14;
  }
  return e;
}
function spawnBoss() {
  if (G.state !== 'play') return;
  const used = new Set([G.hero.id, ...G.officers.map((o) => o.def.id)]);
  const hero = pick(HEROES.filter((h) => !used.has(h.id)));
  G.phase = 2;
  G.boss = spawnOfficer(hero, CAMPS.north, 'boss');
  banner(`敵軍總大將「${hero.name}」出陣！`);
  Audio.play('gong');
  updateObjective();
}
function updateObjective() {
  const n = G.officers.filter((o) => o.dead).length;
  $('#objective').textContent = G.phase < 2 ? `目標：擊破敵將（${n}/3）　小地圖黃點` : `目標：擊破敵軍總大將（北方）`;
}
const tmpV = new THREE.Vector3();
function updateEnemies(dt) {
  const p = G.player;
  const list = G.enemies;
  for (let i = list.length - 1; i >= 0; i--) {
    const e = list[i];
    if (e.dead) {
      e.deathT += dt;
      e.update(dt);
      e.body.rotation.z += dt * 12 * (e.faceR ? 1 : -1);
      if (e.deathT > 0.5) { e.mat.transparent = true; e.mat.opacity = Math.max(0, 1 - (e.deathT - 0.5) * 3); }
      if (e.deathT > 0.9) { e.remove(); list.splice(i, 1); }
      continue;
    }
    e.moving = 0;
    if (e.stun > 0) { e.stun -= dt; e.update(dt); continue; }
    if (e.y > 0 || e.down > 0) { e.update(dt); continue; }
    const dx = p.pos.x - e.pos.x, dz = p.pos.z - e.pos.z, d = Math.hypot(dx, dz) || 1;
    const nx = dx / d, nz = dz / d;
    e.atkCd -= dt;
    if (e.kind === 'soldier') soldierAI(e, dt, d, nx, nz);
    else officerAI(e, dt, d, nx, nz);
    e.update(dt);
  }
  // 分離
  for (let i = 0; i < list.length; i++) {
    const a = list[i]; if (a.dead) continue;
    for (let j = i + 1; j < list.length; j++) {
      const b = list[j]; if (b.dead) continue;
      const dx = b.pos.x - a.pos.x, dz = b.pos.z - a.pos.z; const r = a.radius + b.radius;
      const d2 = dx * dx + dz * dz;
      if (d2 < r * r && d2 > 1e-6) {
        const d = Math.sqrt(d2), push = (r - d) * 0.5;
        const ax = dx / d * push, az = dz / d * push;
        const wa = a.kind === 'soldier' ? 1 : 0.2, wb = b.kind === 'soldier' ? 1 : 0.2;
        a.pos.x -= ax * wa; a.pos.z -= az * wa; b.pos.x += ax * wb; b.pos.z += az * wb;
      }
    }
    const dx = a.pos.x - p.pos.x, dz = a.pos.z - p.pos.z; const r = a.radius + 0.5; const d2 = dx * dx + dz * dz;
    if (d2 < r * r && d2 > 1e-6) { const d = Math.sqrt(d2); a.pos.x += dx / d * (r - d); a.pos.z += dz / d * (r - d); }
  }
}
function soldierAI(e, dt, d, nx, nz) {
  const T = e.def;
  if (e.wind > 0) {
    e.wind -= dt; e.lean = -0.15;
    if (e.wind <= 0) {
      if (T.ai === 'ranged') { shoot(e, 'stone', Math.atan2(G.player.pos.z - e.pos.z, G.player.pos.x - e.pos.x), { dmg: T.dmg, speed: 13, life: 1.2 }); }
      else if (T.ai === 'charger') { e.kb.x += e.chargeX * 18; e.kb.z += e.chargeZ * 18; e.charging = 0.6; }
      else { e.lean = 0.35; if (d < 2.0 + e.radius) hurtPlayer(T.dmg * (1 + G.phase * 0.2), e); }
      e.atkCd = rand(1.8, 4);
    }
    return;
  }
  if (e.charging > 0) {
    e.charging -= dt; e.moving = 1;
    if (d < 1.4 + e.radius) { hurtPlayer(T.dmg, e); e.charging = 0; }
    return;
  }
  if (d > e.aggro) {
    // 慢慢向玩家集結
    if (Math.random() < 0.01) e.aggro += 2;
    return;
  }
  const want = T.ai === 'ranged' ? 8 : 1.3 + e.radius;
  const spd = T.spd * (1 + G.phase * 0.08);
  if (d > want + 0.3) { e.pos.x += nx * spd * dt; e.pos.z += nz * spd * dt; e.moving = 1; }
  else if (T.ai === 'ranged' && d < want - 2) { e.pos.x -= nx * spd * dt; e.pos.z -= nz * spd * dt; e.moving = 1; }
  e.face(nx);
  const inRange = T.ai === 'ranged' ? d < 12 : T.ai === 'charger' ? d < 9 : d < want + 0.8;
  if (inRange && e.atkCd <= 0) {
    e.wind = T.ai === 'charger' ? 0.7 : 0.45; e.chargeX = nx; e.chargeZ = nz;
  }
}
function officerAI(e, dt, d, nx, nz) {
  const W = e.weapon; const isBoss = e.kind === 'boss';
  const col = e.def.color;
  if (e.wind > 0) {
    e.wind -= dt; e.lean = -0.2;
    if (e.wind <= 0) {
      e.lean = 0.4;
      const ang = Math.atan2(e.aimZ, e.aimX);
      const mult = isBoss ? 1.6 : 1;
      if (e.attack === 'slash') {
        slashFx(e.pos, ang, e.atkR, e.atkArc, col, 0.9 * e.size, 1.2);
        const pd = Math.hypot(G.player.pos.x - e.pos.x, G.player.pos.z - e.pos.z);
        let da = Math.abs(Math.atan2(G.player.pos.z - e.pos.z, G.player.pos.x - e.pos.x) - ang); if (da > Math.PI) da = 2 * Math.PI - da;
        if (pd < e.atkR + 0.4 && (e.atkArc >= 360 || da < THREE.MathUtils.degToRad(e.atkArc / 2) + 0.2)) hurtPlayer(55 * mult, e);
        Audio.play('swing');
      } else if (e.attack === 'volley') {
        const n = isBoss ? 7 : 5;
        for (let i = 0; i < n; i++) shoot(e, W.proj === 'orb' ? 'orb' : 'arrow', ang + (i - (n - 1) / 2) * 0.16, { dmg: 35 * mult, speed: W.proj === 'orb' ? 12 : 20, life: 1.1, color: col });
        Audio.play('shoot');
      } else if (e.attack === 'slam') {
        ringFx(e.pos, 0.5, e.atkR, col, 0.4); burst(e.pos.clone().setY(0.3), '#d8c8a0', 24, 9, 6);
        const pd = Math.hypot(G.player.pos.x - e.pos.x, G.player.pos.z - e.pos.z);
        if (pd < e.atkR) hurtPlayer(70 * mult, e);
        G.shake = Math.max(G.shake, 0.3); Audio.play('heavy');
      }
      e.atkCd = isBoss ? rand(1.2, 2.2) : rand(1.8, 3.2);
    }
    return;
  }
  if (d > e.aggro) return;
  e.face(nx);
  const ranged = !!W.proj;
  const want = ranged ? 7 : 1.6 + e.radius;
  const spd = (isBoss ? 4.2 : 4.6) * (e.def.spd || 1);
  if (d > want) { e.pos.x += nx * spd * dt; e.pos.z += nz * spd * dt; e.moving = 1; }
  if (e.atkCd <= 0 && d < (ranged ? 13 : want + 2.5)) {
    e.aimX = nx; e.aimZ = nz;
    const roll = Math.random();
    if (ranged && roll < 0.7) { e.attack = 'volley'; e.wind = 0.7; teleFx(e.pos, Math.atan2(nz, nx), 10, 50, 0.7); }
    else if (roll < 0.35 + (isBoss ? 0.15 : 0)) { e.attack = 'slam'; e.atkR = isBoss ? 6 : 4.2; e.wind = 0.9; teleFx(e.pos, 0, e.atkR, 360, 0.9); }
    else { e.attack = 'slash'; e.atkR = (W.range + 1) * (isBoss ? 1.3 : 1); e.atkArc = Math.min(200, Math.max(90, W.arc)); e.wind = 0.6; teleFx(e.pos, Math.atan2(nz, nx), e.atkR, e.atkArc, 0.6); }
  }
}
function updateSpawner(dt) {
  G.spawnT -= dt;
  const alive = G.enemies.filter((e) => !e.dead && e.kind === 'soldier').length;
  const target = IS_TOUCH ? 34 : 46;
  if (G.spawnT <= 0 && alive < target) {
    G.spawnT = 0.9;
    const p = G.player.pos;
    let x, z;
    for (let tries = 0; tries < 8; tries++) {
      const a = rand(0, 6.28), r = rand(18, 26);
      x = p.x + Math.cos(a) * r; z = p.z + Math.sin(a) * r;
      if (Math.hypot(x, z) < ARENA_R - 3) break;
    }
    const rr = Math.hypot(x, z); if (rr > ARENA_R - 3) { x *= (ARENA_R - 3) / rr; z *= (ARENA_R - 3) / rr; }
    const troop = pick(TROOPS);
    const n = Math.floor(rand(4, 8));
    for (let i = 0; i < n; i++) spawnSoldier(x + rand(-2, 2), z + rand(-2, 2), Math.random() < 0.7 ? troop : undefined).aggro = 40;
  }
}

// ------------------------------------------------------------
// 玩家更新
// ------------------------------------------------------------
function updatePlayer(dt) {
  const p = G.player;
  let ix = 0, iz = 0;
  if (keys.KeyW || keys.ArrowUp) iz -= 1;
  if (keys.KeyS || keys.ArrowDown) iz += 1;
  if (keys.KeyA || keys.ArrowLeft) ix -= 1;
  if (keys.KeyD || keys.ArrowRight) ix += 1;
  ix += touch.dx; iz += touch.dy;
  const l = Math.hypot(ix, iz); if (l > 1) { ix /= l; iz /= l; }
  input.x = ix; input.z = iz;
  p.atkT -= dt; p.comboWin -= dt; p.heavyCd -= dt; p.dashCd -= dt; p.inv -= dt; p.stun -= dt;
  if (p.dead) { p.update(dt); return; }
  // 長按連打
  if ((keys.KeyJ || keys.KeyZ || keys.T_atk) && p.atkT <= 0 && !p.buffer && G.musouT <= 0) p.buffer = 'atk';
  if (p.buffer && p.atkT <= 0.06 && p.stun <= 0 && G.musouT <= 0) { const b = p.buffer; p.buffer = null; if (b === 'atk') lightAttack(); else heavyAttack(); }
  const moving = Math.hypot(ix, iz) > 0.15;
  if (moving) { p.dir.set(ix, 0, iz).normalize(); p.face(ix); }
  let spd = 7.2 * G.hero.spd;
  if (p.atkT > 0) spd *= 0.25;
  if (G.musouT > 0) spd *= 0.5;
  if (p.stun > 0) spd = 0;
  if (p.dashT > 0) { p.dashT -= dt; spd = 22; p.moving = 1; if (Math.random() < 0.6) burst(p.pos.clone().setY(0.2), '#e8dcc0', 2, 2, 1); }
  else p.moving = moving ? 1 : 0;
  if (moving || p.dashT > 0) { p.pos.x += p.dir.x * spd * dt * (p.dashT > 0 || moving ? 1 : 0); p.pos.z += p.dir.z * spd * dt * (p.dashT > 0 || moving ? 1 : 0); }
  p.mat.opacity = 1;
  p.update(dt);
  if (p.inv > 0 && G.musouT <= 0 && p.dashT <= 0) p.mesh.visible = Math.floor(G.time * 30) % 2 === 0; else p.mesh.visible = true;
}

// ------------------------------------------------------------
// HUD
// ------------------------------------------------------------
let bannerTimer;
function banner(text) {
  const b = $('#banner'); b.textContent = text; b.classList.remove('show'); void b.offsetWidth; b.classList.add('show');
  clearTimeout(bannerTimer); bannerTimer = setTimeout(() => b.classList.remove('show'), 2300);
}
let flashV = 0;
function flash(v) { flashV = Math.max(flashV, v); }
const mm = $('#minimap').getContext('2d');
let mmT = 0, lastCombo = 0;
function updateHud(dt) {
  const p = G.player;
  $('#hpFill').style.width = (p.hp / p.maxHp * 100) + '%';
  $('#hpText').textContent = `${Math.max(0, Math.ceil(p.hp))} / ${p.maxHp}`;
  $('#muFill').style.width = G.musou + '%';
  const full = G.musou >= 100 && G.musouT <= 0;
  $('.bar.mu').classList.toggle('full', full);
  $('#muText').textContent = full ? '無雙 MAX！按 L' : '無雙';
  document.querySelector('.tb.d').classList.toggle('ready', full);
  $('#koNum').textContent = G.ko;
  const s = Math.floor(G.time); $('#timer').textContent = `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
  const c = $('#combo');
  if (G.combo > 1) { c.classList.add('on'); if (G.combo !== lastCombo) { $('#comboNum').textContent = G.combo; c.classList.remove('pop'); void c.offsetWidth; c.classList.add('pop'); } }
  else c.classList.remove('on');
  lastCombo = G.combo;
  // 最近的敵將血條
  let near = null, nd = 18;
  for (const e of G.enemies) if (!e.dead && e.kind !== 'soldier') { const d = Math.hypot(e.pos.x - p.pos.x, e.pos.z - p.pos.z); if (d < nd || e.kind === 'boss') { nd = d; near = e; if (e.kind === 'boss') break; } }
  const bb = $('#bossBar');
  if (near) { bb.classList.remove('hidden'); $('#bossName').textContent = (near.kind === 'boss' ? '敵軍總大將　' : '敵將　') + near.def.name; $('#bossFill').style.width = Math.max(0, near.hp / near.maxHp * 100) + '%'; }
  else bb.classList.add('hidden');
  // 小地圖
  mmT -= dt; if (mmT > 0) return; mmT = 0.1;
  const W = 160, sc = W / 2 / 62;
  mm.clearRect(0, 0, W, W);
  mm.save(); mm.beginPath(); mm.arc(80, 80, 79, 0, 6.28); mm.clip();
  mm.fillStyle = 'rgba(70,110,50,.55)'; mm.fillRect(0, 0, W, W);
  mm.strokeStyle = 'rgba(210,170,100,.6)'; mm.lineWidth = 6;
  mm.beginPath(); mm.moveTo(80, 0); mm.lineTo(80, 160); mm.moveTo(0, 80 + 4 * sc); mm.lineTo(160, 80 + 4 * sc); mm.stroke();
  mm.fillStyle = '#ff5a4a';
  for (const e of G.enemies) if (!e.dead && e.kind === 'soldier') mm.fillRect(80 + e.pos.x * sc - 1.5, 80 + e.pos.z * sc - 1.5, 3, 3);
  for (const e of G.enemies) if (!e.dead && e.kind !== 'soldier') {
    mm.fillStyle = e.kind === 'boss' ? '#ff2a1a' : '#ffd04a'; mm.beginPath(); mm.arc(80 + e.pos.x * sc, 80 + e.pos.z * sc, e.kind === 'boss' ? 7 : 5, 0, 6.28); mm.fill();
    mm.strokeStyle = '#000'; mm.lineWidth = 1.5; mm.stroke();
  }
  mm.fillStyle = '#4ab0ff'; mm.beginPath(); mm.arc(80 + p.pos.x * sc, 80 + p.pos.z * sc, 5, 0, 6.28); mm.fill(); mm.strokeStyle = '#fff'; mm.stroke();
  mm.restore();
}

// ------------------------------------------------------------
// 標題 / 選角場景（展示台）
// ------------------------------------------------------------
const stage = new THREE.Group(); scene.add(stage);
let showcase = [], selUnit = null;
function buildStage() {
  stage.position.copy(CAMPS.player);
  const plat = new THREE.Mesh(new THREE.CylinderGeometry(3.2, 3.6, 0.6, 32), new THREE.MeshStandardMaterial({ color: '#b5893f', roughness: 0.6, metalness: 0.2 }));
  plat.position.y = 0.3; plat.receiveShadow = true; plat.castShadow = true; stage.add(plat);
  const trim = new THREE.Mesh(new THREE.TorusGeometry(3.25, 0.12, 8, 48), new THREE.MeshStandardMaterial({ color: '#ffd04a', metalness: 0.6, roughness: 0.3 }));
  trim.rotation.x = Math.PI / 2; trim.position.y = 0.6; stage.add(trim);
  stage.visible = false;
}
function showTitle() {
  G.state = 'title';
  clearBattle();
  screens('title');
  stage.visible = false;
  for (const u of showcase) u.remove();
  showcase = [];
  HEROES.forEach((h, i) => {
    const u = new Unit('hero_' + h.id, { team: 0, kind: 'show', def: h, size: 1.25 });
    const a = (i / HEROES.length - 0.5) * Math.PI * 0.95;
    const row = i % 2;
    u.pos.set(CAMPS.player.x + Math.sin(a) * (9 + row * 2.5), 0, CAMPS.player.z - Math.cos(a) * (6 + row * 2.5) + 3);
    u.faceR = Math.sin(a) < 0; u.flipS = u.faceR ? -1 : 1;
    showcase.push(u);
  });
}
function toSelect() {
  Audio.init();
  G.state = 'select';
  for (const u of showcase) u.remove();
  showcase = [];
  screens('select');
  stage.visible = true;
  selectHero(G.selIndex);
}
function selectHero(i) {
  G.selIndex = i;
  const h = HEROES[i];
  document.querySelectorAll('.card').forEach((c, k) => c.classList.toggle('on', k === i));
  document.querySelectorAll('.card')[i]?.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
  $('#selTitle').textContent = h.title;
  $('#selName').textContent = h.name;
  $('#selWeapon').textContent = '武器：' + WEAPONS[h.weapon].label;
  $('#selDesc').textContent = h.desc;
  $('#stHp').style.width = (h.hp / 1500 * 100) + '%';
  $('#stAtk').style.width = (h.atk / 1.3 * 100) + '%';
  $('#stSpd').style.width = (h.spd / 1.15 * 100) + '%';
  if (selUnit) selUnit.remove();
  selUnit = new Unit('hero_' + h.id, { team: 0, kind: 'show', def: h, size: 2.1 });
  selUnit.pos.copy(CAMPS.player).setY(0);
  selUnit.y = 0.6; selUnit.vy = 0;
  selUnit.t = 0;
  ringFx(selUnit.pos, 1, 5, h.color, 0.6, 0.65);
  burst(selUnit.pos.clone().setY(2), h.color, 24, 6, 6);
  if (G.state === 'select') Audio.play('swing');
}
function buildGrid() {
  const grid = $('#grid');
  HEROES.forEach((h, i) => {
    const c = document.createElement('div'); c.className = 'card';
    c.innerHTML = `<img src="assets/unit_hero_${h.id}.png" alt=""><span>${h.name}</span>`;
    c.onclick = () => selectHero(i);
    grid.appendChild(c);
  });
}
function screens(name) {
  for (const id of ['loading', 'title', 'select', 'pause', 'result']) $('#' + id).classList.toggle('show', id === name || (name === 'pause' && id === 'pause'));
  $('#hud').classList.toggle('hidden', !(name === 'play' || name === 'pause' || name === 'result'));
  $('#touch').classList.toggle('hidden', !(IS_TOUCH && name === 'play'));
}

// ------------------------------------------------------------
// 開始 / 結束
// ------------------------------------------------------------
function clearBattle() {
  for (const e of G.enemies) e.remove();
  for (const p of G.projs) scene.remove(p.mesh);
  for (const it of G.items) scene.remove(it.mesh);
  G.enemies = []; G.projs = []; G.items = []; G.later = [];
  if (G.player) { G.player.remove(); G.player = null; }
}
function startGame() {
  Audio.init(); Audio.bgmOn = true; Audio.startBgm();
  clearBattle();
  if (selUnit) { selUnit.remove(); selUnit = null; }
  stage.visible = false;
  const h = HEROES[G.selIndex];
  G.hero = h;
  const p = new Unit('hero_' + h.id, { team: 0, kind: 'player', def: h, hp: h.hp, size: 1.12, ring: 0x3a9aff });
  p.pos.copy(CAMPS.player).setZ(CAMPS.player.z - 10);
  p.atkT = 0; p.comboWin = 0; p.comboIdx = -1; p.heavyCd = 0; p.dashCd = 0; p.dashT = 0; p.inv = 0; p.dir.set(0, 0, -1);
  G.player = p;
  Object.assign(G, { ko: 0, combo: 0, maxCombo: 0, comboT: 0, time: 0, musou: 0, musouT: 0, phase: 0, spawnT: 2, boss: null, slowmo: 0 });
  $('#pface').src = `assets/unit_hero_${h.id}.png`;
  $('#pname').textContent = `${h.title}　${h.name}`;
  // 敵將
  const others = HEROES.filter((x) => x.id !== h.id).sort(() => Math.random() - 0.5);
  G.officers = [spawnOfficer(others[0], CAMPS.west, 'officer'), spawnOfficer(others[1], CAMPS.east, 'officer'), spawnOfficer(others[2], CAMPS.center, 'officer')];
  for (let i = 0; i < 18; i++) spawnSoldier(rand(-20, 20), rand(5, 25));
  G.phase = 1;
  updateObjective();
  G.state = 'play';
  screens('play');
  G.camTarget.copy(p.pos);
  banner('出陣！');
  Audio.play('gong');
}
function pauseGame(on) {
  if (on && G.state === 'play') { G.state = 'pause'; screens('pause'); }
  else if (!on && G.state === 'pause') { G.state = 'play'; screens('play'); }
}
function endGame(win) {
  if (G.state !== 'play') return;
  G.state = 'result';
  screens('result');
  $('#resTitle').textContent = win ? '勝利' : '敗北';
  const t = Math.floor(G.time);
  let score = G.ko * 10 + G.maxCombo * 5 + (win ? 3000 : 0) - t * 3;
  const rank = !win ? 'C' : score > 4500 ? 'S' : score > 3500 ? 'A' : 'B';
  $('#resRank').textContent = rank;
  $('#resStats').innerHTML = `武將　${G.hero.name}<br>擊破數　${G.ko}<br>最大連擊　${G.maxCombo}<br>時間　${Math.floor(t / 60)} 分 ${t % 60} 秒`;
}

$('#btnStart').onclick = toSelect;
$('#btnGo').onclick = startGame;
$('#btnBack').onclick = showTitle;
$('#btnResume').onclick = () => pauseGame(false);
$('#btnQuit').onclick = () => { clearBattle(); toSelect(); };
$('#btnAgain').onclick = startGame;
$('#btnSel').onclick = () => { clearBattle(); toSelect(); };
$('#btnPause').onclick = () => pauseGame(true);
$('#btnMute').onclick = () => Audio.toggle();

// ------------------------------------------------------------
// 主迴圈
// ------------------------------------------------------------
const clock = new THREE.Clock();
const camPos = new THREE.Vector3(), lookAt = new THREE.Vector3();
let titleT = 0;
function frame() {
  requestAnimationFrame(frame);
  let dt = Math.min(clock.getDelta(), 1 / 30);
  const realDt = dt;
  titleT += realDt;
  // 營火 / 旗幟動畫
  for (const f of fires) { const u = f.userData; const s = 1 + Math.sin(titleT * 17 + f.position.x) * 0.15; u.f1.scale.set(s, 1 + Math.sin(titleT * 13) * 0.2, s); u.f2.scale.setScalar(1 + Math.sin(titleT * 21) * 0.2); u.light.intensity = 5 + Math.sin(titleT * 23) * 1.5; }
  if (world.flags) for (const f of world.flags) { const pa = f.geometry.attributes.position; for (let i = 0; i < pa.count; i++) { const x = (i % 9) / 8; pa.setZ(i, Math.sin(titleT * 5 + x * 5 + f.position.x) * 0.25 * x); } pa.needsUpdate = true; }

  if (G.state === 'play') {
    if (G.hitstop > 0) { G.hitstop -= dt; dt *= 0.08; }
    if (G.slowmo > 0) { G.slowmo -= realDt; dt *= 0.3; }
    G.time += dt;
    for (let i = G.later.length - 1; i >= 0; i--) { const l = G.later[i]; l.t -= dt; if (l.t <= 0) { G.later.splice(i, 1); l.fn(); } }
    G.comboT -= dt; if (G.comboT <= 0) G.combo = 0;
    updatePlayer(dt);
    updateMusou(dt);
    updateEnemies(dt);
    if (G.phase < 3) updateSpawner(dt);
    updateProjs(dt);
    updateItems(dt);
    updateHud(realDt);
    // 攝影機
    const p = G.player;
    G.camTarget.lerp(p.pos, 1 - Math.exp(-6 * realDt));
    const portrait = innerWidth < innerHeight;
    camPos.set(G.camTarget.x, 10.5 + (portrait ? 2 : 0), G.camTarget.z + 12.5 + (portrait ? 2.5 : 0));
    lookAt.set(G.camTarget.x, 1.2, G.camTarget.z);
  } else if (G.state === 'title') {
    for (const u of showcase) { u.moving = 0; u.update(realDt); }
    const a = Math.sin(titleT * 0.15) * 0.25;
    camPos.set(CAMPS.player.x + Math.sin(a) * 18, 7, CAMPS.player.z + 14 + Math.cos(a) * 4);
    lookAt.set(CAMPS.player.x, 2.2, CAMPS.player.z - 2);
  } else if (G.state === 'select') {
    if (selUnit) {
      selUnit.update(realDt);
      if (selUnit.y <= 0.6) { selUnit.y = 0.6; selUnit.vy = 0; selUnit.root.position.y = 0.6; }
      selUnit.body.rotation.y = Math.sin(titleT * 0.9) * 0.75;
      selUnit.faceR = false;
    }
    const portrait = innerWidth < innerHeight;
    camPos.set(CAMPS.player.x + (portrait ? 0 : 3.2), portrait ? 3.6 : 4.2, CAMPS.player.z + (portrait ? 13 : 10.5));
    lookAt.set(CAMPS.player.x + (portrait ? 0 : 3.2), portrait ? -1.4 : 2.6, CAMPS.player.z);
  }
  if (G.state !== 'pause') {
    updateEffects(G.state === 'play' ? dt : realDt);
    updateSparks(G.state === 'play' ? dt : realDt);
    updateNums(realDt);
  }
  camera.position.copy(camPos);
  if (G.shake > 0) { G.shake -= realDt; const s = G.shake * 0.6; camera.position.x += rand(-s, s); camera.position.y += rand(-s, s); }
  camera.lookAt(lookAt);
  // 陰影跟隨
  sun.position.set(lookAt.x + 18, 34, lookAt.z + 14);
  sun.target.position.set(lookAt.x, 0, lookAt.z);
  if (flashV > 0) { flashV -= realDt * 1.8; $('#flash').style.opacity = Math.max(0, flashV); }
  renderer.render(scene, camera);
}

// ------------------------------------------------------------
// 載入
// ------------------------------------------------------------
async function boot() {
  const jobs = [];
  let done = 0;
  const total = HEROES.length + TROOPS.length;
  const tick = () => { done++; $('#loadText').textContent = `載入武將中… ${done}/${total}`; };
  for (const h of HEROES) jobs.push(loadArt('hero_' + h.id, `assets/unit_hero_${h.id}.png`, 2.0).then(tick));
  for (const t of TROOPS) jobs.push(loadArt('army_' + t.id, `assets/unit_army_${t.id}.png`, 1.6).then(tick));
  await Promise.all(jobs);
  buildWorld();
  buildStage();
  buildGrid();
  showTitle();
  frame();
}
boot().catch((e) => { $('#loadText').textContent = '載入失敗：' + e.message; console.error(e); });
window.__G = G;
