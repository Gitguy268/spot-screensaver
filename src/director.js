// The director: Spot's loop of nap → dream → chase (inside the dream) → wake, with random
// lengths and a random thing to chase. Pure (no DOM, no three.js) so it runs in node tests.
// Both the 3D and the vector scenes read the same frame from it.

export const PHASES = ['nap', 'dream', 'chase', 'wake'];
export const PREY = ['butterfly', 'ball', 'laser'];
// [min, max] seconds at speed 1
export const LENGTH = { nap: [45, 75], dream: [18, 28], chase: [36, 54], wake: [14, 20] };
// seconds of the dissolve between the room and the dream, on each side of the cut
export const VEIL = { in: 4, out: 3 };

export function rng(seed) {
  let a = seed >>> 0 || 1;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const smooth = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));

export function createDirector({ seed = 1, speed = 1, start = 'nap', at = 0 } = {}) {
  const r = rng(seed);
  const S = { phase: start, t: 0, dur: 0, cycle: -1, prey: null, lastPrey: null }; // the first nap is cycle 0

  function enter(phase) {
    S.phase = phase;
    S.t = 0;
    const [a, b] = LENGTH[phase];
    S.dur = a + (b - a) * r();
    if (phase === 'chase') {
      const options = PREY.filter((p) => p !== S.lastPrey);
      S.prey = options[Math.floor(r() * options.length)];
      S.lastPrey = S.prey;
    }
    if (phase === 'nap') S.cycle++;
  }
  enter(start);
  if (start !== 'nap') S.cycle = 0;
  if (start === 'wake') { S.prey = PREY[Math.floor(r() * PREY.length)]; S.lastPrey = S.prey; }
  S.t = Math.min(at, S.dur - 0.01);

  function veil() {
    const { phase, t, dur } = S;
    if (phase === 'dream') return smooth((t - (dur - VEIL.in)) / VEIL.in);
    if (phase === 'chase') return Math.max(1 - smooth(t / VEIL.out), smooth((t - (dur - VEIL.in)) / VEIL.in));
    if (phase === 'wake') return 1 - smooth(t / VEIL.out);
    return 0;
  }

  function frame() {
    const p = S.t / S.dur;
    return {
      phase: S.phase, t: S.t, dur: S.dur, p, cycle: S.cycle, prey: S.prey,
      world: S.phase === 'chase' ? 'dream' : 'room',
      veil: veil(),
      // how hard he dreams: paws, lips and eyes twitch more as the dream builds
      twitch: S.phase === 'dream' ? smooth(p * 1.4) : 0,
      // how asleep he is: 1 napping and dreaming, awake in the middle of 'wake', dozing off at its end
      sleep: S.phase === 'wake' ? 1 - smooth((S.t - 2) / 3) + smooth((S.t - (S.dur - 4)) / 4) : 1,
    };
  }

  return {
    update(dt) {
      S.t += dt * speed;
      while (S.t >= S.dur) {
        const over = S.t - S.dur;
        enter(PHASES[(PHASES.indexOf(S.phase) + 1) % PHASES.length]);
        S.t = over;
      }
      return frame();
    },
    frame,
    jump(phase, at = 0) { enter(phase); S.t = Math.min(at, S.dur - 0.01); return frame(); },
    get speed() { return speed; },
    set speed(v) { speed = v; },
  };
}
