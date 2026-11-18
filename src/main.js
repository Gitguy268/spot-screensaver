// Spot Screensaver: picks the style (3D, vector or both, alternating each loop), runs the director
// and draws frames at a capped rate. URL parameters (also used by the macOS bundle):
//   style=3d|vector|alternate  quality=low|medium|high  scene=nap|dream|chase|wake  at=<seconds>
//   speed=<x>  seed=<n>  fps=<cap>  saver=1 (no UI, no cursor)  preview=1 (tiny System Settings thumbnail)
//   sound=1  caption=0|1
import { createDirector } from './director.js';
import { createSound } from './sound.js';

const $ = (s) => document.querySelector(s);
const params = new URLSearchParams(location.search);
const saver = params.get('saver') === '1';
const preview = params.get('preview') === '1';
const pick = (k, list, def) => (list.includes(params.get(k)) ? params.get(k) : def);
const prefs = (() => { try { return JSON.parse(localStorage.getItem('spot-screensaver') || '{}'); } catch { return {}; } })();
const savePrefs = () => { try { localStorage.setItem('spot-screensaver', JSON.stringify(prefs)); } catch { /* private mode */ } };

let style = pick('style', ['3d', 'vector', 'alternate'], saver ? '3d' : prefs.style || '3d');
let quality = pick('quality', ['low', 'medium', 'high'], preview ? 'low' : prefs.quality || (matchMedia('(pointer: coarse)').matches ? 'low' : 'medium'));
const fpsCap = +params.get('fps') || (saver ? 30 : 60);
const seed = +params.get('seed') || ((Date.now() / 1000) | 0) % 100000;
const director = createDirector({ seed, speed: +params.get('speed') || 1, start: pick('scene', ['nap', 'dream', 'chase', 'wake'], 'nap'), at: +params.get('at') || 0 });
const caption = params.get('caption') ? params.get('caption') === '1' : !saver;
const sound = createSound();
if (saver) document.body.classList.add('saver');

const stages = {};
let shown = null; // '3d' | 'vector'
let errors = 0;

async function stage(kind) {
  if (stages[kind]) return stages[kind];
  if (kind === '3d') {
    const { createStage3D } = await import('./three/stage.js');
    stages[kind] = await createStage3D({ canvas: $('#c'), quality, preview });
  } else {
    const { createStageVector } = await import('./vector/stage.js');
    stages[kind] = createStageVector({ root: $('#v'), preview });
  }
  return stages[kind];
}

// which style a cycle uses: 'alternate' swaps every loop, starting with 3D
const styleFor = (cycle) => (style === 'alternate' ? (cycle % 2 ? 'vector' : '3d') : style);

async function show(kind) {
  if (kind === '3d' && !webgl()) kind = 'vector';
  await stage(kind);
  shown = kind;
  $('#c').hidden = kind !== '3d';
  $('#v').hidden = kind !== 'vector';
}

function webgl() {
  if (webgl.ok !== undefined) return webgl.ok;
  try { const c = document.createElement('canvas'); webgl.ok = !!(c.getContext('webgl2') || c.getContext('webgl')); } catch { webgl.ok = false; }
  return webgl.ok;
}

const TEXT = { nap: 'Spot is napping by the fire', dream: 'Spot is dreaming…', chase: { butterfly: 'In his dream: a butterfly!', ball: 'In his dream: the ball!', laser: 'In his dream: the red dot!' }, wake: 'Spot is waking up' };
let lastCaption = '';
function setCaption(f) {
  if (!caption) return;
  const text = f.phase === 'chase' ? TEXT.chase[f.prey] : TEXT[f.phase];
  if (text === lastCaption) return;
  lastCaption = text;
  const el = $('#caption');
  el.classList.remove('on');
  setTimeout(() => { el.textContent = text; el.classList.add('on'); }, 400);
  clearTimeout(setCaption.t);
  setCaption.t = setTimeout(() => el.classList.remove('on'), 6000);
}

// ---- loop
let last = performance.now(), acc = 0, frames = 0, fps = 0, fpsT = 0, switching = false, lastCycle = 0;
function loop(now) {
  requestAnimationFrame(loop);
  const elapsed = (now - last) / 1000;
  if (elapsed < 1 / fpsCap - 0.002) return;
  last = now;
  const dt = Math.min(elapsed, 0.1);
  if (document.hidden || !shown || switching) return;
  const f = director.update(dt);
  // alternate styles at the start of each nap
  if (f.cycle !== lastCycle) {
    lastCycle = f.cycle;
    const want = styleFor(f.cycle);
    if (want !== shown) { switching = true; show(want).finally(() => { switching = false; }); return; }
  }
  try { stages[shown].update(dt, f); } catch (e) { if (errors++ < 3) console.error(e); }
  sound.update(dt, f);
  setCaption(f);
  frames++; fpsT += elapsed;
  if (fpsT > 1) { fps = frames / fpsT; frames = 0; fpsT = 0; }
}

// ---- UI (browser only)
function syncUI() {
  for (const b of document.querySelectorAll('[data-style]')) b.setAttribute('aria-pressed', String(b.dataset.style === style));
  $('#quality').value = quality;
  $('#sound').setAttribute('aria-pressed', String(sound.on));
  $('#sound').textContent = sound.on ? 'Sound on' : 'Sound off';
}
if (!saver) {
  let hideT = 0;
  const wake = () => { document.body.classList.add('ui'); clearTimeout(hideT); hideT = setTimeout(() => { if (!$('#bar').matches(':hover, :focus-within')) document.body.classList.remove('ui'); }, 2600); };
  addEventListener('pointermove', wake);
  addEventListener('pointerdown', wake);
  addEventListener('keydown', (e) => {
    wake();
    const k = e.key.toLowerCase();
    if (e.target.matches?.('select')) return;
    if (k === 'f') toggleFull();
    if (k === 'v') setStyle(shown === '3d' ? 'vector' : '3d');
    if (k === 'm') toggleSound();
    if (['1', '2', '3', '4'].includes(k)) jump(['nap', 'dream', 'chase', 'wake'][+k - 1]);
  });
  for (const b of document.querySelectorAll('[data-style]')) b.addEventListener('click', () => setStyle(b.dataset.style));
  for (const b of document.querySelectorAll('[data-scene]')) b.addEventListener('click', () => jump(b.dataset.scene));
  $('#quality').addEventListener('change', (e) => { prefs.quality = e.target.value; savePrefs(); const u = new URL(location.href); u.searchParams.set('quality', e.target.value); location.replace(u); });
  $('#sound').addEventListener('click', toggleSound);
  $('#full').addEventListener('click', toggleFull);
}
function setStyle(s) { style = s; prefs.style = s; savePrefs(); syncUI(); switching = true; show(styleFor(director.frame().cycle)).finally(() => { switching = false; }); }
function jump(phase) { director.jump(phase); }
function toggleSound() { sound.toggle(); syncUI(); }
function toggleFull() { if (document.fullscreenElement) document.exitFullscreen?.(); else document.documentElement.requestFullscreen?.().catch(() => {}); }

addEventListener('resize', () => { for (const s of Object.values(stages)) s.resize(); });

// ---- start
syncUI();
if (params.get('sound') === '1') sound.toggle(true);
show(styleFor(0)).then(() => {
  $('#loading').classList.add('done');
  window.__spotSaver.ready = true;
  requestAnimationFrame(loop);
}).catch((e) => {
  console.error(e);
  $('#loading').innerHTML = '<div id="nogl"><p>Spot could not settle in: ' + String(e.message || e).replace(/[<&]/g, '') + '</p></div>';
});

// hooks for tests and the macOS bundle
window.__spotSaver = {
  ready: false,
  frame: () => director.frame(),
  jump: (phase, at) => director.jump(phase, at),
  style: () => shown,
  setStyle,
  fps: () => fps,
  info: () => stages[shown]?.info?.(),
  step: (seconds, dt = 1 / 30) => { for (let t = 0; t < seconds; t += dt) { const f = director.update(dt); stages[shown].update(dt, f); } },
  stop: () => { switching = true; },
  stage: () => stages[shown],
};
