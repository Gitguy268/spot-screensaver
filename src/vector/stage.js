// The vector screensaver: a hand-built SVG cabin at night where Spot sleeps on his bed by the
// fire, and a golden meadow he runs through in his dream. Same director frames as the 3D version.
import gallop from './traced/gallop.js';
import { createNapper } from './napper.js';
import { el } from './svg.js';
import photoUrl from '../../assets/spot-bandana.webp?inline';

const W = 1600, H = 900, TAU = Math.PI * 2;
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const smooth = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
const lerp = (a, b, t) => a + (b - a) * t;
const bell = (x, a, b) => smooth((x - a) / ((b - a) / 2)) * smooth((b - x) / ((b - a) / 2));
const rng = (seed) => { let s = seed; return () => (s = (s * 16807) % 2147483647) / 2147483647; };

function gradient(defs, kind, id, stops, attrs = {}) {
  const g = el(kind === 'r' ? 'radialGradient' : 'linearGradient', { id, ...(kind === 'r' ? {} : { x1: 0, y1: 0, x2: 0, y2: 1 }), ...attrs }, defs);
  for (const [o, c, a = 1] of stops) el('stop', { offset: o, 'stop-color': c, 'stop-opacity': a }, g);
  return `url(#${id})`;
}

// ---------------------------------------------------------------- the cabin
function buildRoom(svg, defs, r) {
  const g = el('g', {}, svg);
  el('rect', { x: -200, y: -100, width: W + 400, height: 820, fill: gradient(defs, 'l', 'wall', [[0, '#2a1a12'], [0.6, '#3d271a'], [1, '#24160e']]) }, g);
  // log wall
  const logFill = gradient(defs, 'l', 'log', [[0, '#6b4429'], [0.35, '#4f311d'], [1, '#2a190f']]);
  for (let y = 20; y < 700; y += 64) {
    el('rect', { x: -200, y, width: W + 400, height: 58, rx: 29, fill: logFill }, g);
    el('path', { d: `M -200 ${y + 20} Q 400 ${(y + 16 + r() * 8).toFixed(1)} 800 ${y + 22} T ${W + 200} ${y + 20}`, stroke: '#7a5236', 'stroke-width': 1.2, fill: 'none', opacity: 0.35 }, g);
  }
  // window with snow
  const win = el('g', { transform: 'translate(1150 150)' }, g);
  el('rect', { x: -14, y: -14, width: 308, height: 288, rx: 6, fill: '#3a2315' }, win);
  el('rect', { x: 0, y: 0, width: 280, height: 260, fill: gradient(defs, 'l', 'night', [[0, '#0d1830'], [0.7, '#1f3358'], [1, '#55678a']]) }, win);
  el('circle', { cx: 220, cy: 50, r: 46, fill: gradient(defs, 'r', 'moon', [[0, '#f2f0e0', 0.35], [1, '#f2f0e0', 0]]) }, win);
  el('circle', { cx: 220, cy: 50, r: 18, fill: '#f2f0e0' }, win);
  for (const [x, h] of [[40, 90], [110, 130], [200, 100], [250, 70]]) el('path', { d: `M ${x} ${222 - h} L ${x - h * 0.3} 222 L ${x + h * 0.3} 222 Z`, fill: '#0b1426', opacity: 0.85 }, win);
  el('path', { d: 'M 0 220 C 60 200, 120 214, 180 204 C 230 196, 260 206, 280 200 L 280 260 L 0 260 Z', fill: '#c8d4ec' }, win);
  const snow = [];
  const snowG = el('g', {}, win);
  for (let i = 0; i < 70; i++) snow.push({ x: r() * 280, y: r() * 260, s: 0.6 + r() * 1.8, v: 14 + r() * 24, e: el('circle', { r: (1 + r() * 1.6).toFixed(2), fill: '#fff', opacity: 0.85 }, snowG) });
  el('path', { d: 'M 140 0 V 260 M 0 130 H 280', stroke: '#3a2315', 'stroke-width': 12 }, win);
  el('rect', { x: -24, y: 270, width: 328, height: 18, rx: 4, fill: '#5a3a22' }, win);
  // moonlight on the floor
  el('path', { d: 'M 1150 410 L 1430 410 L 1600 900 L 1020 900 Z', fill: gradient(defs, 'l', 'moonbeam', [[0, '#9fb4ff', 0.12], [1, '#9fb4ff', 0]]) }, g);

  // floor
  el('rect', { x: -200, y: 700, width: W + 400, height: 300, fill: gradient(defs, 'l', 'floor', [[0, '#5a3a22'], [0.3, '#6e4728'], [1, '#2c1a0e']]) }, g);
  for (let i = -12; i <= 12; i++) el('path', { d: `M ${800 + i * 60} 700 L ${800 + i * 200} 1000`, stroke: '#2a190d', 'stroke-width': 1.5, opacity: 0.55 }, g);
  for (const y of [740, 800, 880]) el('path', { d: `M -200 ${y} H ${W + 200}`, stroke: '#2a190d', 'stroke-width': 1.2, opacity: 0.35 }, g);

  // fireplace
  const fp = el('g', {}, g);
  el('path', { d: 'M 80 -100 H 600 V 760 H 80 Z', fill: '#4a4239' }, fp);
  const stones = el('g', {}, fp);
  for (let y = -80; y < 760; y += 46) for (let x = 84 + (Math.floor(y / 46) % 2) * 30; x < 600; x += 66) {
    const w = 52 + r() * 18, h = 36 + r() * 10, shade = 0.75 + r() * 0.5;
    const c = (v) => Math.round(clamp(v * shade, 0, 255));
    el('rect', { x: (x + r() * 4).toFixed(1), y: (y + r() * 4).toFixed(1), width: Math.min(w, 600 - x).toFixed(1), height: h.toFixed(1), rx: 12, fill: `rgb(${c(122)},${c(112)},${c(100)})`, stroke: '#2a241e', 'stroke-width': 3 }, stones);
  }
  el('rect', { x: 50, y: 300, width: 580, height: 40, rx: 6, fill: gradient(defs, 'l', 'mantel', [[0, '#7a4c2a'], [1, '#3a2010']]) }, fp);
  // the framed photo of Spot on the mantel (the same portrait as in the 3D cabin)
  const frame = el('g', { transform: 'translate(280 150)' }, fp);
  el('rect', { x: -6, y: -6, width: 132, height: 152, fill: '#2a1a0e' }, frame);
  el('rect', { x: 0, y: 0, width: 120, height: 140, fill: '#d8cdb8' }, frame);
  el('image', { x: 8, y: 8, width: 104, height: 124, preserveAspectRatio: 'xMidYMid slice', href: photoUrl }, frame);
  el('path', { d: 'M 180 760 L 180 500 Q 340 400 500 500 L 500 760 Z', fill: '#0c0705' }, fp);
  el('path', { d: 'M 200 760 L 200 520 Q 340 430 480 520 L 480 760 Z', fill: gradient(defs, 'l', 'firebox', [[0, '#1a0c06'], [1, '#3a1608']]) }, fp);
  el('rect', { x: 40, y: 750, width: 600, height: 34, rx: 6, fill: '#5d564d' }, fp);
  // logs and embers
  el('rect', { x: 236, y: 712, width: 210, height: 34, rx: 17, fill: '#3b2312', transform: 'rotate(-6 340 730)' }, fp);
  el('rect', { x: 250, y: 724, width: 190, height: 30, rx: 15, fill: '#4a2c16', transform: 'rotate(8 340 740)' }, fp);
  el('ellipse', { cx: 340, cy: 748, rx: 120, ry: 12, fill: '#ff5a10', opacity: 0.8 }, fp);
  const fireGlow = el('filter', { id: 'fireGlow', x: '-50%', y: '-50%', width: '200%', height: '200%' }, defs);
  el('feGaussianBlur', { stdDeviation: 6 }, fireGlow);
  const flameFill = [
    gradient(defs, 'l', 'flame0', [[0, '#ff3a0a', 0], [0.5, '#ff6a1a', 0.9], [1, '#ffa040']]),
    gradient(defs, 'l', 'flame1', [[0, '#ffb040', 0], [0.4, '#ffc860', 0.95], [1, '#fff0b0']]),
  ];
  const flameG = el('g', { filter: 'url(#fireGlow)' }, fp);
  const flames = [0, 1, 2, 3, 4].map((i) => ({ e: el('path', { fill: flameFill[i % 2], opacity: i % 2 ? 0.95 : 0.85 }, flameG), x: 280 + i * 30, h: i % 2 ? 110 : 170 }));
  const sharp = el('g', {}, fp);
  const cores = [0, 1].map((i) => ({ e: el('path', { fill: flameFill[1] }, sharp), x: 320 + i * 40, h: 90 }));

  // rug
  el('ellipse', { cx: 1000, cy: 838, rx: 560, ry: 74, fill: gradient(defs, 'r', 'rug', [[0, '#3a6a44'], [0.7, '#2f5a3a'], [0.72, '#7a1f22'], [0.9, '#7a1f22'], [0.92, '#e8d9b0'], [1, '#e8d9b0']]) }, g);
  // his shadow on the rug
  el('ellipse', { cx: 1040, cy: 846, rx: 300, ry: 26, fill: '#120a06', opacity: 0.55, filter: 'url(#fireGlow)' }, g);
  const front = el('g', {}, null);

  // firelight
  const light = el('ellipse', { cx: 340, cy: 650, rx: 900, ry: 600, fill: gradient(defs, 'r', 'firelight', [[0, '#ff9040', 0.45], [0.5, '#ff7a30', 0.12], [1, '#ff7a30', 0]]), 'pointer-events': 'none' }, null);
  return { g, front, flames, cores, snow, light };
}

function flamePath(x, base, h, t, k) {
  const w = h * 0.36;
  const s1 = Math.sin(t * 7.1 + k) * 0.5 + Math.sin(t * 12.3 + k * 2) * 0.3;
  const s2 = Math.sin(t * 9.4 + k * 1.7) * 0.5 + Math.sin(t * 15.1 + k) * 0.25;
  const top = base - h * (0.85 + 0.15 * Math.sin(t * 5.3 + k));
  const tx = x + s1 * w * 0.6;
  const f = (v) => v.toFixed(1);
  return `M ${f(x - w)} ${base} C ${f(x - w * 1.1)} ${f(base - h * 0.4)}, ${f(x - w * 0.3 + s2 * 12)} ${f(base - h * 0.6)}, ${f(tx)} ${f(top)} C ${f(x + w * 0.3 + s1 * 12)} ${f(base - h * 0.55)}, ${f(x + w * 1.1)} ${f(base - h * 0.35)}, ${f(x + w)} ${base} Z`;
}

// ---------------------------------------------------------------- the dream meadow
function buildDream(svg, defs, r) {
  const g = el('g', {}, svg);
  el('rect', { x: -200, y: -100, width: W + 400, height: 900, fill: gradient(defs, 'l', 'dsky', [[0, '#7fa6d8'], [0.45, '#c9d6e6'], [0.75, '#ffe0b0'], [1, '#ffcf96']]) }, g);
  el('circle', { cx: 1180, cy: 470, r: 260, fill: gradient(defs, 'r', 'dsun', [[0, '#fffbe8', 0.95], [0.25, '#fff1c8', 0.6], [1, '#ffd8a0', 0]]) }, g);
  const blur = el('filter', { id: 'far', x: '-10%', y: '-30%', width: '120%', height: '160%' }, defs);
  el('feGaussianBlur', { stdDeviation: 4 }, blur);
  const blurNear = el('filter', { id: 'near', x: '-10%', y: '-30%', width: '120%', height: '160%' }, defs);
  el('feGaussianBlur', { stdDeviation: 7 }, blurNear);
  // clouds
  const clouds = el('g', { filter: 'url(#far)', opacity: 0.8 }, g);
  for (let i = 0; i < 6; i++) { const cx = r() * W, cy = 80 + r() * 200; for (let k = 0; k < 4; k++) el('ellipse', { cx: (cx + k * 50 - 75).toFixed(0), cy: (cy - (k % 2) * 18).toFixed(0), rx: (70 + r() * 40).toFixed(0), ry: (30 + r() * 12).toFixed(0), fill: '#fff7ec' }, clouds); }
  // rolling hills in layers, scrolled at different speeds (parallax); each tile is 2W wide and repeats
  const layer = (y, amp, color, trees, filter) => {
    const lg = el('g', filter ? { filter } : {}, g);
    const inner = el('g', {}, lg);
    const ys = [];
    for (let x = 0; x <= W * 2; x += 100) ys.push(y + (r() - 0.5) * amp * 0.6);
    ys[ys.length - 1] = ys[0];
    const treeX = Array.from({ length: trees }, () => [r() * W * 2, 0.6 + r() * 0.8]);
    for (const off of [0, W * 2]) {
      let d = `M ${off} 900 L ${off} ${ys[0].toFixed(1)}`;
      for (let i = 1; i < ys.length; i++) d += ` Q ${off + i * 100 - 50} ${(y - amp * (0.5 + 0.5 * Math.sin(i * 1.7))).toFixed(1)} ${off + i * 100} ${ys[i].toFixed(1)}`;
      d += ` L ${off + W * 2} 900 Z`;
      el('path', { d, fill: color }, inner);
      for (const [tx, s] of treeX) {
        el('rect', { x: (off + tx - 4 * s).toFixed(1), y: (y - 50 * s).toFixed(1), width: (8 * s).toFixed(1), height: (60 * s).toFixed(1), fill: color }, inner);
        el('ellipse', { cx: (off + tx).toFixed(1), cy: (y - 70 * s).toFixed(1), rx: (34 * s).toFixed(1), ry: (44 * s).toFixed(1), fill: color }, inner);
      }
    }
    return inner;
  };
  const hills = [layer(600, 60, '#a9b58f', 5, 'url(#far)'), layer(660, 50, '#7f9a5c', 7, 'url(#far)'), layer(730, 30, '#5f8a3a', 0, null)];
  // foreground grass tufts and flowers (two tiles of W for scrolling)
  const tile = el('g', {}, g);
  const blades = [];
  for (let i = 0; i < 160; i++) blades.push([r() * W, 770 + r() * 140, 30 + r() * 50, r(), r()]);
  for (const off of [0, W]) for (const [i, [x0, y, h, a, b]] of blades.entries()) {
    const x = off + x0, c = ['#4f7f2e', '#5e9236', '#3f6a24', '#73a344'][i % 4];
    el('path', { d: `M ${x.toFixed(1)} ${y.toFixed(1)} q ${(-6 + a * 4).toFixed(1)} ${(-h * 0.6).toFixed(1)} ${(-10 + b * 20).toFixed(1)} ${(-h).toFixed(1)} q 4 ${(h * 0.5).toFixed(1)} 8 ${h.toFixed(1)} Z`, fill: c }, tile);
    if (i % 7 === 0) el('circle', { cx: x.toFixed(1), cy: (y - h).toFixed(1), r: (4 + a * 3).toFixed(1), fill: ['#ffe066', '#ff8fa0', '#ffffff', '#c9a0ff'][i % 4] }, tile);
  }
  const near = el('g', { filter: 'url(#near)', opacity: 0.9 }, null); // out-of-focus blades in front of Spot
  const nearTile = el('g', {}, near);
  const tall = Array.from({ length: 26 }, () => [r() * W, 120 + r() * 120, r(), r()]);
  for (const off of [0, W]) for (const [x0, h, a, b] of tall) {
    const x = off + x0;
    el('path', { d: `M ${x.toFixed(1)} 920 q ${(-10 + a * 6).toFixed(1)} ${(-h * 0.6).toFixed(1)} ${(-20 + b * 40).toFixed(1)} ${(-h).toFixed(1)} q 6 ${(h * 0.5).toFixed(1)} 18 ${h.toFixed(1)} Z`, fill: '#3e6a22' }, nearTile);
  }
  // pollen motes
  const motes = el('g', {}, g);
  const mote = [];
  for (let i = 0; i < 40; i++) mote.push({ x: r() * W, y: 200 + r() * 600, p: r() * TAU, e: el('circle', { r: (2 + r() * 3).toFixed(1), fill: '#fff6d8', opacity: 0.6 }, motes) });
  return { g, hills, tile, near, nearTile, mote };
}

function buildPrey(parent, defs) {
  const shadow = el('ellipse', { rx: 26, ry: 6, fill: '#1c3010', opacity: 0.35 }, parent);
  const butterfly = el('g', {}, parent);
  const wing = gradient(defs, 'r', 'wing', [[0, '#ffb040'], [0.65, '#e86a10'], [1, '#2a1406']]);
  const wings = [1, -1].map((s) => {
    const w = el('g', {}, butterfly);
    el('path', { d: 'M 0 0 C 10 -30, 40 -34, 44 -14 C 46 0, 24 4, 0 2 Z', fill: wing, stroke: '#1a0d05', 'stroke-width': 2 }, w);
    el('path', { d: 'M 0 2 C 20 6, 34 18, 26 32 C 18 40, 4 26, 0 6 Z', fill: wing, stroke: '#1a0d05', 'stroke-width': 2 }, w);
    w.dataset.side = s;
    return w;
  });
  el('ellipse', { cx: 0, cy: 6, rx: 3, ry: 14, fill: '#1a120a' }, butterfly);
  const ball = el('g', {}, parent);
  el('circle', { cx: 0, cy: 0, r: 22, fill: gradient(defs, 'r', 'tennis', [[0, '#e8f56a'], [0.7, '#c4d832'], [1, '#8a9a18']], { fx: 0.35, fy: 0.3 }) }, ball);
  el('path', { d: 'M -18 -12 C -4 -2, -4 6, -18 14 M 18 -12 C 4 -2, 4 6, 18 14', stroke: '#f6f8ee', 'stroke-width': 3, fill: 'none' }, ball);
  const laser = el('g', {}, parent);
  el('ellipse', { cx: 0, cy: 0, rx: 30, ry: 10, fill: gradient(defs, 'r', 'dotglow', [[0, '#ff3030', 0.8], [1, '#ff3030', 0]]) }, laser);
  el('ellipse', { cx: 0, cy: 0, rx: 7, ry: 3, fill: '#ff6060' }, laser);
  return { butterfly, wings, ball, laser, shadow };
}

export function createStageVector({ root, preview = false, quality = 'high' }) {
  root.innerHTML = '';
  const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, preserveAspectRatio: 'xMidYMid slice', role: 'img' }, root);
  el('title', {}, svg).textContent = 'Spot, a black labrador, napping by the fire';
  const defs = el('defs', {}, svg);
  const r = rng(11);
  const view = el('g', {}, svg); // camera: scale and pan
  const room = buildRoom(view, defs, r);
  const dream = buildDream(view, defs, r);
  const actors = el('g', {}, view);
  const prey = buildPrey(actors, defs);
  const napper = createNapper(actors, defs, { id: 'vnap' });
  // the dream gallop: one stride of the 3D dog, traced into 12 vector frames (a flipbook)
  const runner = el('g', {}, actors);
  const frames = gallop.frames.map((fr) => {
    const g = el('g', { display: 'none' }, runner);
    for (const [c, d] of fr.paths) el('path', { fill: c, stroke: c, 'stroke-width': 0.6, d }, g);
    return g;
  });
  let shownFrame = 0;
  view.append(room.front, dream.near, room.light);
  const veilRect = el('rect', { x: 0, y: 0, width: W, height: H, fill: '#fff1dc', opacity: 0, 'pointer-events': 'none' }, svg);

  let time = 0, breath = 0, run = 0, world = null, scroll = 0, preyT = 0;
  const S = { up: 0, twitchT: 0, earT: 3, puffT: 2, look: 0 };

  function setWorld(w) {
    world = w;
    for (const e of [room.g, room.front, room.light]) e.style.display = w === 'room' ? '' : 'none';
    for (const e of [dream.g, dream.near]) e.style.display = w === 'dream' ? '' : 'none';
    for (const k of ['butterfly', 'ball', 'laser', 'shadow']) prey[k].style.display = 'none';
    napper.root.style.display = w === 'room' ? '' : 'none';
    runner.style.display = w === 'room' ? 'none' : '';
  }

  function roomFrame(dt, f) {
    for (const [i, fl] of room.flames.entries()) fl.e.setAttribute('d', flamePath(fl.x, 745, fl.h, time, i * 1.9));
    for (const [i, fl] of room.cores.entries()) fl.e.setAttribute('d', flamePath(fl.x, 742, fl.h, time * 1.3, i * 3.1 + 7));
    room.light.setAttribute('opacity', (0.8 + 0.2 * Math.sin(time * 13.1) * Math.sin(time * 7.3 + 1)).toFixed(3));
    for (const s of room.snow) {
      s.y += s.v * dt; s.x += Math.sin(time + s.s * 4) * dt * 6;
      if (s.y > 222) { s.y = -4; s.x = (s.x * 7.13 + 37) % 280; }
      s.e.setAttribute('cx', s.x.toFixed(1)); s.e.setAttribute('cy', s.y.toFixed(1));
    }
    const NAP = { x: 760, y: 846 - 760 * 0.8, scale: 0.8 };
    napper.update(dt, f, NAP);
    const hx = NAP.x + napper.head[0] * NAP.scale, hy = NAP.y + napper.head[1] * NAP.scale;
    // camera: a slow drift toward him while he naps, close on his face as he dreams
    const drift = f.phase === 'nap' ? f.p : f.phase === 'dream' ? 1 : 1 - smooth(f.t / 6);
    const close = f.phase === 'dream' ? smooth(f.p * 1.2) : 0;
    return { s: lerp(lerp(1, 1.12, drift), 1.9, close), x: lerp(lerp(800, 900, drift), hx + 60, close), y: lerp(lerp(450, 500, drift), hy + 40, close) };
  }

  function dreamFrame(dt, f) {
    // he gallops, the meadow scrolls past, the prey flits ahead
    run += dt * TAU * 2.2; // strides per second
    scroll += dt * 520;
    dream.hills.forEach((h, i) => h.setAttribute('transform', `translate(${(-(scroll * [0.08, 0.2, 0.45][i]) % (W * 2)).toFixed(1)} 0)`));
    dream.tile.setAttribute('transform', `translate(${(-(scroll * 0.9) % W).toFixed(1)} 0)`);
    dream.nearTile.setAttribute('transform', `translate(${(-(scroll * 1.5) % W).toFixed(1)} 0)`);
    for (const m of dream.mote) {
      m.x -= dt * (40 + 20 * Math.sin(m.p)); m.y += Math.sin(time + m.p) * dt * 10;
      if (m.x < -20) m.x = W + 20;
      m.e.setAttribute('cx', m.x.toFixed(1)); m.e.setAttribute('cy', m.y.toFixed(1));
    }
    const k = Math.floor((run / TAU) * frames.length) % frames.length;
    if (k !== shownFrame) { frames[shownFrame].setAttribute('display', 'none'); shownFrame = k; }
    frames[k].setAttribute('display', '');
    const sx = 640 + 80 * Math.sin(time * 0.31), scale = 0.95;
    // frame pixels: he is centred at x 360, the ground is at y 421
    runner.setAttribute('transform', `translate(${(sx - 360 * scale).toFixed(1)} ${(800 - 421 * scale).toFixed(1)}) scale(${scale})`);
    // prey
    preyT += dt;
    const px = sx + 420 + 90 * Math.sin(preyT * 0.7) + 40 * Math.sin(preyT * 1.9);
    for (const k of ['butterfly', 'ball', 'laser']) prey[k].style.display = k === f.prey ? '' : 'none';
    prey.shadow.style.display = f.prey === 'laser' ? 'none' : '';
    let py = 790;
    if (f.prey === 'butterfly') {
      py = 560 + 60 * Math.sin(preyT * 1.7) + 20 * Math.sin(preyT * 5.3);
      prey.butterfly.setAttribute('transform', `translate(${px.toFixed(1)} ${py.toFixed(1)}) rotate(${(10 * Math.sin(preyT * 3)).toFixed(1)})`);
      const flap = 0.2 + 0.8 * Math.abs(Math.sin(preyT * 16));
      for (const w of prey.wings) w.setAttribute('transform', `scale(${(+w.dataset.side * flap).toFixed(3)} 1)`);
    } else if (f.prey === 'ball') {
      py = 778 - 230 * Math.abs(Math.sin(preyT * 2.4));
      prey.ball.setAttribute('transform', `translate(${px.toFixed(1)} ${py.toFixed(1)}) rotate(${((preyT * 400) % 360).toFixed(1)})`);
    } else {
      prey.laser.setAttribute('transform', `translate(${(px + 30 * Math.sin(preyT * 6)).toFixed(1)} ${(806 + 8 * Math.sin(preyT * 4)).toFixed(1)})`);
    }
    const lift = clamp((790 - py) / 300, 0, 1);
    prey.shadow.setAttribute('cx', px.toFixed(1)); prey.shadow.setAttribute('cy', 802);
    prey.shadow.setAttribute('opacity', (0.35 * (1 - lift * 0.7)).toFixed(2));
    return { s: 1.05, x: 800 + 40 * Math.sin(time * 0.2), y: 470 };
  }

  function update(dt, f) {
    time += dt;
    if (f.world !== world) setWorld(f.world);
    const cam = world === 'room' ? roomFrame(dt, f) : dreamFrame(dt, f);
    const tx = W / 2 - cam.x * cam.s, ty = H / 2 - cam.y * cam.s;
    view.setAttribute('transform', `translate(${tx.toFixed(1)} ${ty.toFixed(1)}) scale(${cam.s.toFixed(4)})`);
    veilRect.setAttribute('opacity', (f.veil * 0.85).toFixed(3));
    root.style.filter = f.veil > 0.01 ? `blur(${(f.veil * 10).toFixed(1)}px)` : '';
  }

  return { update, resize() {}, info: () => ({ world, nodes: svg.querySelectorAll('*').length }) };
}
