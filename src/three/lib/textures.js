// Procedural PBR textures, painted on canvases at startup so the game ships no image files.
// Each maker returns { map, normalMap, roughnessMap } (some only map). Heights are painted in
// greyscale on a second canvas and turned into a normal map with a Sobel filter.
import * as THREE from 'three';

let SIZE = 1024; // lowered on the Low quality preset
export const setTextureSize = (s) => { SIZE = s; cache.clear(); };
const cache = new Map();

function rng(seed) { let s = seed >>> 0 || 1; return () => (s = (s * 16807) % 2147483647) / 2147483647; }
function canvas(w = SIZE, h = w) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }

// Value noise, tileable over `period` cells
function noise2(period, seed) {
  const r = rng(seed), g = new Float32Array(period * period).map(() => r());
  const at = (x, y) => g[((y % period + period) % period) * period + ((x % period + period) % period)];
  return (x, y) => {
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    return (at(xi, yi) * (1 - u) + at(xi + 1, yi) * u) * (1 - v) + (at(xi, yi + 1) * (1 - u) + at(xi + 1, yi + 1) * u) * v;
  };
}
// Fractal noise in 0..1 sampled at u, v in 0..1 (tileable)
function fbm(seed, base = 8, oct = 4) {
  const ns = Array.from({ length: oct }, (_, i) => noise2(base << i, seed + i * 101));
  return (u, v) => { let s = 0, a = 0.5, n = 0; for (let i = 0; i < oct; i++) { s += a * ns[i](u * (base << i), v * (base << i)); n += a; a *= 0.5; } return s / n; };
}

function fillPixels(c, fn) {
  const x = c.getContext('2d'), img = x.createImageData(c.width, c.height), d = img.data;
  for (let j = 0; j < c.height; j++) for (let i = 0; i < c.width; i++) {
    const [r, g, b] = fn(i / c.width, j / c.height, i, j), k = (j * c.width + i) * 4;
    d[k] = r; d[k + 1] = g; d[k + 2] = b; d[k + 3] = 255;
  }
  x.putImageData(img, 0, 0);
  return c;
}

function normalFromHeight(h, strength = 2) {
  const w = h.width, H = h.height, src = h.getContext('2d').getImageData(0, 0, w, H).data;
  const at = (x, y) => src[(((y + H) % H) * w + ((x + w) % w)) * 4] / 255;
  return fillPixels(canvas(w, H), (u, v, x, y) => {
    const dx = (at(x + 1, y - 1) + 2 * at(x + 1, y) + at(x + 1, y + 1)) - (at(x - 1, y - 1) + 2 * at(x - 1, y) + at(x - 1, y + 1));
    const dy = (at(x - 1, y + 1) + 2 * at(x, y + 1) + at(x + 1, y + 1)) - (at(x - 1, y - 1) + 2 * at(x, y - 1) + at(x + 1, y - 1));
    let nx = -dx * strength, ny = -dy * strength, nz = 1;
    const l = Math.hypot(nx, ny, nz); nx /= l; ny /= l; nz /= l;
    return [(nx * 0.5 + 0.5) * 255, (ny * 0.5 + 0.5) * 255, (nz * 0.5 + 0.5) * 255];
  });
}

function tex(c, { srgb = false, repeat = [1, 1] } = {}) {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(...repeat);
  t.anisotropy = 8;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
function set({ color, height, rough, normalStrength = 2, repeat }) {
  return {
    map: tex(color, { srgb: true, repeat }),
    normalMap: height ? tex(normalFromHeight(height, normalStrength), { repeat }) : null,
    roughnessMap: rough ? tex(rough, { repeat }) : null,
  };
}
const memo = (key, make) => { if (!cache.has(key)) cache.set(key, make()); return cache.get(key); };
const mix = (a, b, t) => a + (b - a) * t;
const hex = (h) => [(h >> 16) & 255, (h >> 8) & 255, h & 255];

// Oak (or pine) floorboards: rows of planks of random length, grain lines, knots, gaps.
export function planks({ seed = 7, light = 0xc89660, dark = 0x8a5a32, rows = 8, key = 'oak' } = {}) {
  return memo('planks' + key, () => {
    const S = SIZE, color = canvas(), height = canvas(), rough = canvas();
    const r = rng(seed), grain = fbm(seed + 3, 4, 4), fine = noise2(256, seed + 9);
    const L = hex(light), D = hex(dark);
    // plank layout: per row, cut positions in 0..1 (tileable because the row wraps)
    const cuts = Array.from({ length: rows }, () => { const off = r(); return [off, (off + 0.35 + r() * 0.3) % 1]; });
    const tone = Array.from({ length: rows * 2 }, () => 0.75 + r() * 0.5);
    const knots = Array.from({ length: 14 }, () => [r(), r(), 0.006 + r() * 0.01]);
    const cc = color.getContext('2d'), hc = height.getContext('2d'), rc = rough.getContext('2d');
    const ci = cc.createImageData(S, S), hi = hc.createImageData(S, S), ri = rc.createImageData(S, S);
    for (let y = 0; y < S; y++) {
      const v = y / S, row = Math.floor(v * rows), rv = v * rows - row;
      for (let x = 0; x < S; x++) {
        const u = x / S, [a, b] = cuts[row];
        const inFirst = a < b ? (u >= a && u < b) : (u >= a || u < b);
        const plank = row * 2 + (inFirst ? 0 : 1);
        const edgeU = Math.min(Math.abs(u - a), Math.abs(u - b), Math.abs(u - a + 1), Math.abs(u - b - 1), Math.abs(u - a - 1), Math.abs(u - b + 1));
        const gap = Math.min(rv, 1 - rv) < 0.012 || edgeU < 0.0018;
        // grain: stretched noise warped into wavy lines
        const w = grain(u * 0.25 + plank * 0.37, v * 4);
        let g = Math.sin((v * rows * 9 + w * 6 + plank * 3.1) * Math.PI);
        g = 0.5 + 0.5 * g;
        let k = 0;
        for (const [kx, ky, kr] of knots) { const dd = Math.hypot((u - kx) * 0.6, v - ky); if (dd < kr * 3) k = Math.max(k, 1 - dd / (kr * 3)); }
        const t = tone[plank] * (0.82 + 0.18 * g) * (1 - 0.45 * k * k) * (0.94 + 0.12 * fine(u * 256, v * 64));
        const m = gap ? 0.25 : t;
        const i = (y * S + x) * 4;
        ci.data[i] = mix(D[0], L[0], Math.min(1, m) * 0.9); ci.data[i + 1] = mix(D[1], L[1], Math.min(1, m) * 0.9); ci.data[i + 2] = mix(D[2], L[2], Math.min(1, m) * 0.9); ci.data[i + 3] = 255;
        const h = gap ? 0 : 150 + g * 30 - k * 40 + (1 - Math.min(rv, 1 - rv) < 0.03 ? -20 : 0);
        hi.data[i] = hi.data[i + 1] = hi.data[i + 2] = h; hi.data[i + 3] = 255;
        const ro = gap ? 230 : 95 + 50 * (1 - g) + 30 * fine(u * 128, v * 128); // varnish worn unevenly
        ri.data[i] = ri.data[i + 1] = ri.data[i + 2] = ro; ri.data[i + 3] = 255;
      }
    }
    cc.putImageData(ci, 0, 0); hc.putImageData(hi, 0, 0); rc.putImageData(ri, 0, 0);
    return set({ color, height, rough, normalStrength: 1.0 });
  });
}

// Lime plaster: soft, uneven and slightly mottled
export function plaster({ tint = 0xe9e1d3, seed = 21, key = 'plaster' } = {}) {
  return memo('plaster' + key, () => {
    const S = SIZE >> 1, n = fbm(seed, 6, 5), T = hex(tint);
    const color = fillPixels(canvas(S), (u, v) => { const k = 0.9 + 0.12 * n(u, v); return T.map(c => c * k); });
    const height = fillPixels(canvas(S), (u, v) => { const h = 128 + 70 * (n(u * 2 % 1, v * 2 % 1) - 0.5); return [h, h, h]; });
    return set({ color, height, normalStrength: 1.2 });
  });
}

// Irregular stones with mortar, for the fireplace and the cabin chimney
export function stone({ seed = 5, key = 'stone', a = 0xa89a86, b = 0x6f6558 } = {}) {
  return memo('stone' + key, () => {
    const S = SIZE >> 1, r = rng(seed), A = hex(a), B = hex(b), n = fbm(seed + 1, 8, 4);
    const pts = Array.from({ length: 46 }, () => [r(), r() * 1, 0.7 + r() * 0.6]);
    const near = (u, v) => {
      let d1 = 9, d2 = 9, id = 0;
      for (let k = 0; k < pts.length; k++) for (let ox = -1; ox <= 1; ox++) for (let oy = -1; oy <= 1; oy++) {
        const dx = (pts[k][0] + ox - u) * 1, dy = (pts[k][1] + oy - v) * 1.6, d = Math.hypot(dx, dy);
        if (d < d1) { d2 = d1; d1 = d; id = k; } else if (d < d2) d2 = d;
      }
      return [d2 - d1, id];
    };
    const color = canvas(S), height = canvas(S), rough = canvas(S);
    const H = [], C = [];
    fillPixels(color, (u, v, x, y) => {
      const [edge, id] = near(u, v), mortar = edge < 0.02, t = pts[id][2] * (0.8 + 0.35 * n(u, v));
      const h = mortar ? 60 : 150 + Math.min(edge, 0.05) * 900 + 40 * n(u * 2 % 1, v * 2 % 1);
      H[y * S + x] = h;
      const warm = (pts[id][2] - 1) * 60; // each stone a slightly different tone
      const c = mortar ? [128, 120, 110] : A.map((ac, i) => mix(B[i], ac, Math.min(1, t * 0.75)) + (i === 0 ? warm : i === 2 ? -warm * 0.6 : warm * 0.3));
      C[y * S + x] = mortar;
      return c;
    });
    fillPixels(height, (u, v, x, y) => [H[y * S + x], H[y * S + x], H[y * S + x]]);
    fillPixels(rough, (u, v, x, y) => C[y * S + x] ? [240, 240, 240] : [200 + 30 * n(u, v), 0, 0].map(() => 200 + 30 * n(u, v)));
    return set({ color, height, rough, normalStrength: 1.4 });
  });
}

// A wool rug: border bands, a medallion pattern and fuzzy fibres. Fringe is separate geometry.
export function rug({ seed = 3, field = 0x8e2b2b, border = 0x1f3550, accent = 0xd8b46a, key = 'rug' } = {}) {
  return memo('rug' + key, () => {
    const W = SIZE, Hh = SIZE >> 1, n = noise2(512, seed), m = fbm(seed + 2, 8, 3);
    const F = hex(field), B = hex(border), A = hex(accent);
    const color = fillPixels(canvas(W, Hh), (u, v) => {
      const bx = Math.min(u, 1 - u) * 2, by = Math.min(v, 1 - v);
      const edge = Math.min(bx, by * 1);
      let c = F;
      if (edge < 0.05) c = B; else if (edge < 0.065) c = A; else if (edge < 0.11) c = (Math.floor((u + v) * 60) % 2) ? B : A; else if (edge < 0.12) c = A;
      else {
        const dx = (u - 0.5) * 2, dy = (v - 0.5) * 2 * 0.5 / 0.5;
        const md = Math.abs(dx) * 0.9 + Math.abs(dy) * 1.6; // lozenge medallion
        if (md < 0.36 && md > 0.3) c = A; else if (md < 0.3) c = B;
        const lattice = Math.abs(Math.sin(u * 40) * Math.sin(v * 22));
        if (md >= 0.36 && lattice > 0.93) c = A;
      }
      const k = 0.82 + 0.25 * n(u * 512, v * 256) + 0.1 * (m(u, v) - 0.5); // fibres and wear
      return c.map(x => x * k);
    });
    const height = fillPixels(canvas(W, Hh), (u, v) => { const h = 100 + 120 * n(u * 512, v * 256); return [h, h, h]; });
    return set({ color, height, normalStrength: 1.5 });
  });
}

// Woven upholstery for the sofa and the armchair
export function fabric({ tint = 0x5b6f5a, seed = 11, key = 'fabric' } = {}) {
  return memo('fabric' + key, () => {
    const S = SIZE >> 2, T = hex(tint), n = noise2(64, seed);
    const color = fillPixels(canvas(S), (u, v, x, y) => {
      const weave = ((x >> 1) + (y >> 1)) % 2 ? 0.93 : 1.05;
      const k = weave * (0.9 + 0.15 * n(u * 64, v * 64));
      return T.map(c => c * k);
    });
    const height = fillPixels(canvas(S), (u, v, x, y) => { const h = ((x >> 1) + (y >> 1)) % 2 ? 90 : 170; return [h, h, h]; });
    const t = set({ color, height, normalStrength: 1 });
    for (const m of [t.map, t.normalMap]) m.repeat.set(6, 6);
    return t;
  });
}

// Horizontal round logs for the cabin walls
export function logs({ seed = 13, key = 'logs' } = {}) {
  return memo('logs' + key, () => {
    const S = SIZE >> 1, n = fbm(seed, 4, 4), rows = 6, L = hex(0x9a6a3e), D = hex(0x4a2c16);
    const color = fillPixels(canvas(S), (u, v) => {
      const rv = (v * rows) % 1, round = Math.sin(rv * Math.PI);
      const g = 0.5 + 0.5 * Math.sin((u * 3 + n(u, v) * 4 + v * rows * 0.5) * Math.PI * 6);
      const k = Math.pow(round, 0.6) * (0.7 + 0.3 * g);
      return L.map((c, i) => mix(D[i], c, k));
    });
    const height = fillPixels(canvas(S), (u, v) => { const rv = (v * rows) % 1, h = 255 * Math.pow(Math.sin(rv * Math.PI), 0.5); return [h, h, h]; });
    return set({ color, height, normalStrength: 4 });
  });
}

// Lawn seen from above: mixed greens with patches of earth and clover
export function lawn({ seed = 17 } = {}) {
  return memo('lawn', () => {
    const S = SIZE >> 1, n = fbm(seed, 8, 5), f = noise2(256, seed + 4);
    const color = fillPixels(canvas(S), (u, v) => {
      const k = n(u, v), b = f(u * 256, v * 256);
      return [mix(48, 92, k) * (0.8 + 0.3 * b), mix(78, 132, k) * (0.8 + 0.3 * b), mix(30, 52, k)];
    });
    const t = set({ color });
    t.map.repeat.set(4, 4);
    return t;
  });
}

// Square stone patio tiles
export function tiles({ seed = 19 } = {}) {
  return memo('tiles', () => {
    const S = SIZE >> 1, n = fbm(seed, 8, 4), r = rng(seed), per = Array.from({ length: 16 }, () => 0.85 + r() * 0.25);
    const color = fillPixels(canvas(S), (u, v) => {
      const tu = (u * 4) % 1, tv = (v * 4) % 1, gap = tu < 0.02 || tv < 0.02;
      const k = gap ? 0.55 : per[Math.floor(u * 4) + 4 * Math.floor(v * 4)] * (0.88 + 0.2 * n(u, v));
      return [176 * k, 168 * k, 156 * k];
    });
    const height = fillPixels(canvas(S), (u, v) => { const tu = (u * 4) % 1, tv = (v * 4) % 1, h = tu < 0.02 || tv < 0.02 ? 60 : 160 + 30 * n(u, v); return [h, h, h]; });
    return set({ color, height, normalStrength: 2 });
  });
}

// Bark for the garden tree and fence posts
export function bark({ seed = 23 } = {}) {
  return memo('bark', () => {
    const S = SIZE >> 2, n = fbm(seed, 4, 4);
    const color = fillPixels(canvas(S), (u, v) => { const k = 0.5 + 0.5 * Math.sin((u * 18 + n(u, v) * 5) * Math.PI); return [70 + 40 * k, 52 + 28 * k, 38 + 18 * k]; });
    const height = fillPixels(canvas(S), (u, v) => { const k = 0.5 + 0.5 * Math.sin((u * 18 + n(u, v) * 5) * Math.PI); return [255 * k, 255 * k, 255 * k]; });
    return set({ color, height, normalStrength: 3 });
  });
}

// A soft radial sprite for glows (laser, fire, fairy lights) and particles
export function glowSprite() {
  return memo('glow', () => {
    const c = canvas(128), x = c.getContext('2d'), g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.2, 'rgba(255,255,255,0.6)');
    g.addColorStop(0.5, 'rgba(255,255,255,0.12)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g; x.fillRect(0, 0, 128, 128);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
    return t;
  });
}

// Painted landscape seen through a window: snowy field, garden, or a night sky with stars
export function windowView(kind, time) {
  return memo('view' + kind + time, () => {
    const W = 512, H = 384, c = canvas(W, H), x = c.getContext('2d'), r = rng(kind.length * 31 + time.length);
    const sky = { day: ['#9cc6ea', '#dceaf4'], evening: ['#3c4a78', '#f0a46a'], night: ['#060a18', '#1b2440'] }[time];
    const g = x.createLinearGradient(0, 0, 0, H * 0.7); g.addColorStop(0, sky[0]); g.addColorStop(1, sky[1]);
    x.fillStyle = g; x.fillRect(0, 0, W, H);
    if (time === 'night') for (let i = 0; i < 120; i++) { x.fillStyle = `rgba(255,255,255,${0.3 + r() * 0.7})`; x.fillRect(r() * W, r() * H * 0.6, 1.2, 1.2); }
    const snow = kind === 'cabin';
    const ground = snow ? (time === 'night' ? '#8794b0' : '#eef2f7') : (time === 'night' ? '#16241a' : '#4f7a3c');
    x.fillStyle = ground; x.fillRect(0, H * 0.68, W, H);
    // tree line, slightly out of focus
    x.filter = 'blur(2.5px)';
    for (let i = 0; i < 26; i++) {
      const tx = r() * W, th = 60 + r() * 90, tw = 20 + r() * 26;
      x.fillStyle = snow ? (time === 'night' ? '#1c2a26' : '#2e4a3a') : (time === 'night' ? '#0e1a12' : '#2f5a2c');
      x.beginPath(); x.moveTo(tx, H * 0.7 - th); x.lineTo(tx - tw, H * 0.7); x.lineTo(tx + tw, H * 0.7); x.fill();
      if (snow) { x.fillStyle = 'rgba(255,255,255,0.85)'; x.beginPath(); x.moveTo(tx, H * 0.7 - th); x.lineTo(tx - tw * 0.35, H * 0.7 - th * 0.6); x.lineTo(tx + tw * 0.35, H * 0.7 - th * 0.6); x.fill(); }
    }
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
    return t;
  });
}

// A single leaf silhouette with a midrib, for alpha-tested leaf cards
export function leafCard() {
  return memo('leaf', () => {
    const c = canvas(128), x = c.getContext('2d');
    x.translate(64, 64); x.rotate(-0.6);
    const g = x.createLinearGradient(-50, 0, 50, 0); g.addColorStop(0, '#d8e8c0'); g.addColorStop(1, '#ffffff');
    x.fillStyle = g;
    x.beginPath(); x.moveTo(-54, 0); x.quadraticCurveTo(0, -34, 54, 0); x.quadraticCurveTo(0, 34, -54, 0); x.fill();
    x.strokeStyle = 'rgba(120,140,90,0.8)'; x.lineWidth = 2; x.beginPath(); x.moveTo(-54, 0); x.lineTo(50, 0); x.stroke();
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
    return t;
  });
}
