// Vector Spot dozing in his blanket: the layered shapes traced from his side portrait
// (traced/spot-blanket.js, made by scripts/trace.mjs), cut into a few regions that move on their
// own: the head nods, an ear flicks, a front paw twitches, the tail thumps, and the whole body
// breathes. Each region draws the shapes that overlap it, clipped to its outline; the body under
// it keeps a slightly smaller hole, so no gap shows when a part moves. Lids close over the eye.
// Coordinates are the traced picture's pixels (745 x 760); he faces left.
import traced from './traced/spot-blanket.js';
import { el } from './svg.js';

// region outlines in picture pixels, and the point each turns around
const REGIONS = {
  head: { poly: [[0, 0], [300, 0], [304, 112], [262, 168], [222, 196], [180, 222], [140, 238], [100, 214], [0, 206]], pivot: [232, 196] },
  ear: { poly: [[148, 4], [242, 8], [280, 60], [280, 124], [246, 170], [182, 170], [160, 104], [146, 40]], pivot: [196, 22] },
  paw: { poly: [[92, 588], [210, 588], [214, 668], [88, 668]], pivot: [150, 640] },
  tail: { poly: [[566, 578], [745, 590], [745, 662], [566, 664]], pivot: [572, 618] },
};
const EYE = { x: 107, y: 75, rx: 13.5, ry: 7, rot: -12 };

const bboxOf = (d) => {
  const n = d.match(/-?\d+(\.\d+)?/g).map(Number);
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (let i = 0; i + 1 < n.length; i += 2) { x0 = Math.min(x0, n[i]); x1 = Math.max(x1, n[i]); y0 = Math.min(y0, n[i + 1]); y1 = Math.max(y1, n[i + 1]); }
  return [x0, y0, x1, y1];
};
const polyBox = (p) => [Math.min(...p.map((q) => q[0])), Math.min(...p.map((q) => q[1])), Math.max(...p.map((q) => q[0])), Math.max(...p.map((q) => q[1]))];
const overlaps = (a, b) => a[0] <= b[2] && a[2] >= b[0] && a[1] <= b[3] && a[3] >= b[1];
// grow or shrink an outline around its centre
const scalePoly = (p, k) => {
  const cx = p.reduce((s, q) => s + q[0], 0) / p.length, cy = p.reduce((s, q) => s + q[1], 0) / p.length;
  return p.map(([x, y]) => [cx + (x - cx) * k, cy + (y - cy) * k]);
};
const polyD = (p) => 'M ' + p.map(([x, y]) => `${x.toFixed(1)} ${y.toFixed(1)}`).join(' L ') + ' Z';

export function createNapper(parent, defs, { id = 'nap' } = {}) {
  const shapes = traced.paths.map(([c, d]) => ({ c, d, box: bboxOf(d) }));
  const draw = (g, filterBox) => {
    for (const s of shapes) if (!filterBox || overlaps(s.box, filterBox)) el('path', { fill: s.c, stroke: s.c, 'stroke-width': 0.6, d: s.d }, g);
  };
  const clip = (name, d, evenodd = false) => {
    const c = el('clipPath', { id: `${id}-${name}` }, defs);
    el('path', { d, 'clip-rule': evenodd ? 'evenodd' : 'nonzero' }, c);
    return `url(#${id}-${name})`;
  };
  const R = REGIONS;
  const root = el('g', { class: 'napper' }, parent);
  const body = el('g', {}, root);
  // the body: everything, with smaller holes where the moving parts are
  const holes = [R.head, R.paw, R.tail].map((r) => polyD(r.poly)).join(' ');
  draw(el('g', { 'clip-path': clip('base', `M -10 -10 H ${traced.w + 10} V ${traced.h + 10} H -10 Z ${holes}`, true) }, body));
  const part = (name, parentG, extra = '') => {
    const r = R[name];
    const g = el('g', {}, parentG);
    draw(el('g', { 'clip-path': clip(name, polyD(scalePoly(r.poly, 1.04)) + extra, !!extra) }, g), polyBox(scalePoly(r.poly, 1.06)));
    return g;
  };
  const tail = part('tail', body);
  const paw = part('paw', body);
  // Spot's red collar over the traced one
  el('path', { d: 'M 140 238 C 168 236, 214 220, 256 196 L 266 212 C 224 238, 176 256, 146 258 Z', fill: '#b81c1c', opacity: 0.92 }, body);
  el('path', { d: 'M 142 241 C 170 239, 214 223, 258 199', stroke: '#e0483c', 'stroke-width': 2, fill: 'none', opacity: 0.7 }, body);
  const head = el('g', {}, body);
  const headArt = el('g', {}, head);
  // the head minus the ear, which moves on its own
  draw(el('g', { 'clip-path': clip('head', polyD(scalePoly(R.head.poly, 1.04)) + ' ' + polyD(R.ear.poly), true) }, headArt), polyBox(scalePoly(R.head.poly, 1.05)));
  const ear = part('ear', head);

  // eyelid: a dark lid slides down inside the eye's outline; a lash line shows when shut
  const eye = el('g', { transform: `translate(${EYE.x} ${EYE.y}) rotate(${EYE.rot})` }, head);
  const eyeClip = clip('eye', `M ${-EYE.rx} 0 C ${-EYE.rx * 0.5} ${-EYE.ry * 1.5}, ${EYE.rx * 0.5} ${-EYE.ry * 1.5}, ${EYE.rx} 0 C ${EYE.rx * 0.5} ${EYE.ry * 1.3}, ${-EYE.rx * 0.5} ${EYE.ry * 1.3}, ${-EYE.rx} 0 Z`);
  const lidG = el('g', { 'clip-path': eyeClip }, eye);
  const lid = el('rect', { x: -EYE.rx - 2, y: -EYE.ry * 3, width: EYE.rx * 2 + 4, height: EYE.ry * 2, fill: '#35343a' }, lidG);
  el('rect', { x: -EYE.rx - 2, y: -EYE.ry * 3, width: EYE.rx * 2 + 4, height: EYE.ry * 0.9, fill: '#444349', opacity: 0.6 }, lidG);
  const lash = el('path', { d: `M ${-EYE.rx * 0.95} ${EYE.ry * 0.15} C ${-EYE.rx * 0.4} ${EYE.ry * 0.9}, ${EYE.rx * 0.4} ${EYE.ry * 0.9}, ${EYE.rx * 0.95} ${EYE.ry * 0.1}`, fill: 'none', stroke: '#0c0c0e', 'stroke-width': 2, 'stroke-linecap': 'round' }, eye);

  const rot = (g, [px, py], a, dx = 0, dy = 0) => g.setAttribute('transform', `translate(${dx.toFixed(2)} ${dy.toFixed(2)}) rotate(${a.toFixed(3)} ${px} ${py})`);
  const S = { t: 0, nod: 0.5, nodTo: 0.6, nodT: 2, breath: 0, earT: 3, pawT: 1, wag: 0 };

  // f: director frame; returns nothing. Head nod: dozing sinks slowly and catches back up.
  function update(dt, f, { x, y, scale }) {
    S.t += dt;
    const asleep = Math.min(1, Math.max(0, f.sleep)), awake = 1 - asleep, tw = f.twitch;
    root.setAttribute('transform', `translate(${x.toFixed(1)} ${y.toFixed(1)}) scale(${scale})`);
    S.nodT -= dt;
    if (S.nodT <= 0) { const low = S.nodTo > 0.7; S.nodTo = low ? 0.3 + 0.2 * Math.abs(Math.sin(S.t)) : 0.85 + 0.15 * Math.abs(Math.sin(S.t * 1.7)); S.nodT = low ? 1.3 : 6 + 5 * Math.abs(Math.sin(S.t * 0.7)); }
    const target = S.nodTo * asleep * (1 + 0.25 * tw) - 0.35 * awake;
    S.nod += (target - S.nod) * (1 - Math.exp(-(target > S.nod ? 0.4 : 3.5) * dt));
    S.breath += dt * Math.PI * 2 * (0.22 + 0.15 * awake + 0.05 * tw);
    const b = Math.sin(S.breath);
    body.setAttribute('transform', `translate(372 760) scale(${(1 + 0.004 * b).toFixed(4)} ${(1 + 0.007 * b).toFixed(4)}) translate(-372 -760)`);
    // awake: a look around (small turn of the head), and the odd blink
    const look = awake * 4 * Math.sin(S.t * 0.6);
    rot(head, R.head.pivot, -9 * S.nod + look + 1.2 * b * asleep, 0, 6 * S.nod);
    // ear flicks now and then, more while dreaming
    S.earT -= dt; if (S.earT < 0) S.earT = 2.5 + 6 * Math.abs(Math.sin(S.t * 1.3)) * (1 - 0.6 * tw);
    const flick = S.earT < 0.3 ? Math.sin(S.earT / 0.3 * Math.PI) * Math.sin(S.t * 40) : 0;
    rot(ear, R.ear.pivot, -5 * flick);
    // the front paw paddles in little bursts while he dreams
    S.pawT -= dt; if (S.pawT < -0.8) S.pawT = tw > 0.2 ? 0.4 + 1.6 * (1.2 - tw) * Math.abs(Math.sin(S.t * 2.1)) : 4 + 4 * Math.abs(Math.sin(S.t));
    const burst = S.pawT < 0 ? tw : 0;
    rot(paw, R.paw.pivot, -6 * burst * Math.max(0, Math.sin(S.t * 18)), -4 * burst * Math.max(0, Math.sin(S.t * 18)), -5 * burst * Math.max(0, Math.sin(S.t * 18)));
    // tail: thumps when he wakes
    S.wag += (awake - S.wag) * (1 - Math.exp(-1.5 * dt));
    rot(tail, R.tail.pivot, S.wag * 7 * Math.sin(S.t * 9) + 1.2 * Math.sin(S.t * 0.6));
    // lids: shut asleep, flutter while dreaming, blinks awake
    const blink = awake > 0.5 && S.t % 4.9 > 4.75 ? 1 : 0;
    const shut = Math.max(Math.min(1, asleep * 1.15) - 0.08 * tw * Math.abs(Math.sin(S.t * 23)), blink);
    lid.setAttribute('y', (-EYE.ry * 3 + EYE.ry * 2.15 * shut).toFixed(2));
    lash.setAttribute('opacity', shut > 0.85 ? 1 : 0);
  }

  return { root, update, size: [traced.w, traced.h], head: [120, 100] };
}
