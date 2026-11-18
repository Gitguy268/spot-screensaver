import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDirector, PHASES, PREY, LENGTH } from './director.js';

const run = (d, seconds, step = 0.1) => { const seen = []; for (let t = 0; t < seconds; t += step) { const f = d.update(step); if (seen.at(-1)?.phase !== f.phase) seen.push(f); } return seen; };

test('phases follow nap → dream → chase → wake and loop', () => {
  const seen = run(createDirector({ seed: 3 }), 900);
  for (let i = 1; i < seen.length; i++) assert.equal(seen[i].phase, PHASES[(PHASES.indexOf(seen[i - 1].phase) + 1) % 4]);
  assert.ok(seen.length >= 8, 'at least two full cycles in 15 minutes');
});

test('lengths stay inside their ranges', () => {
  const d = createDirector({ seed: 9 });
  for (let i = 0; i < 40; i++) {
    const f = d.jump(PHASES[i % 4]);
    assert.ok(f.dur >= LENGTH[f.phase][0] && f.dur <= LENGTH[f.phase][1], `${f.phase} ${f.dur}`);
  }
});

test('the same seed gives the same loop, another seed a different one', () => {
  const key = (seed) => run(createDirector({ seed }), 600).map((f) => `${f.phase}:${f.prey}:${f.dur.toFixed(3)}`);
  assert.deepEqual(key(5), key(5));
  assert.notDeepEqual(key(5), key(6));
});

test('every chase has prey, never the same twice in a row', () => {
  const d = createDirector({ seed: 11 });
  let last = null;
  for (let i = 0; i < 30; i++) {
    const f = d.jump('chase');
    assert.ok(PREY.includes(f.prey));
    assert.notEqual(f.prey, last);
    last = f.prey;
  }
});

test('the veil is continuous across cuts and clear in the middle of phases', () => {
  const d = createDirector({ seed: 2 });
  let prev = d.frame();
  for (let t = 0; t < 600; t += 0.05) {
    const f = d.update(0.05);
    assert.ok(Math.abs(f.veil - prev.veil) < 0.1, `jump in veil at ${f.phase} ${f.t.toFixed(2)}: ${prev.veil} → ${f.veil}`);
    if (f.phase === 'nap') assert.equal(f.veil, 0);
    prev = f;
  }
  assert.equal(d.jump('chase', 20).veil, 0);
});

test('he is fully asleep while napping and dreaming, awake in the middle of wake', () => {
  const d = createDirector({ seed: 4 });
  assert.equal(d.jump('nap', 10).sleep, 1);
  assert.equal(d.jump('dream', 5).sleep, 1);
  const w = d.jump('wake', 7);
  assert.ok(w.sleep < 0.05, `sleep ${w.sleep}`);
});

test('speed scales time and the cycle counter counts naps', () => {
  const seen = run(createDirector({ seed: 1, speed: 10 }), 120);
  assert.ok(seen.length >= 4);
  const naps = seen.filter((f) => f.phase === 'nap').map((f) => f.cycle);
  assert.deepEqual(naps, naps.map((_, i) => i));
});
