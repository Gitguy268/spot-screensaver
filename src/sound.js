// Optional sound, off by default: the fire crackling, Spot's slow sleepy breathing, a muffled
// "wuf" now and then while he dreams, and a soft breeze in the dream. All synthesised.
export function createSound() {
  let ctx = null, master = null, on = false, noise = null;
  let breathPh = 0, crackleT = 0, wufT = 4, lastWorld = null;
  const nodes = {};

  function init() {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain(); master.gain.value = 0; master.connect(ctx.destination);
    const len = ctx.sampleRate * 2, buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
    let b = 0;
    for (let i = 0; i < len; i++) { const w = Math.random() * 2 - 1; b = 0.98 * b + 0.02 * w; d[i] = b * 6; } // brown-ish noise
    noise = buf;
    const loop = (freq, q, gain) => {
      const src = ctx.createBufferSource(); src.buffer = noise; src.loop = true;
      const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = q;
      const g = ctx.createGain(); g.gain.value = gain;
      src.connect(f).connect(g).connect(master); src.start();
      return { f, g };
    };
    nodes.fire = loop(500, 0.6, 0.25);
    nodes.breath = loop(900, 0.9, 0);
    nodes.wind = loop(350, 0.4, 0);
  }

  function pop(t, freq, gain, dur) {
    const src = ctx.createBufferSource(); src.buffer = noise;
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = 4;
    const g = ctx.createGain(); g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(master); src.start(t, Math.random()); src.stop(t + dur + 0.05);
  }

  function wuf(t) {
    const o = ctx.createOscillator(); o.type = 'triangle';
    o.frequency.setValueAtTime(190, t); o.frequency.exponentialRampToValueAtTime(110, t + 0.18);
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 420;
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.18, t + 0.03); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
    o.connect(f).connect(g).connect(master); o.start(t); o.stop(t + 0.3);
  }

  return {
    get on() { return on; },
    toggle(force) {
      on = force ?? !on;
      if (on && !ctx) { try { init(); } catch { on = false; return; } }
      if (!ctx) return;
      if (on) ctx.resume?.();
      master.gain.setTargetAtTime(on ? 0.8 : 0, ctx.currentTime, 0.3);
    },
    update(dt, f) {
      if (!on || !ctx) return;
      const t = ctx.currentTime, inRoom = f.world === 'room', mute = 1 - f.veil;
      nodes.fire.g.gain.setTargetAtTime(inRoom ? 0.22 * mute : 0, t, 0.5);
      nodes.wind.g.gain.setTargetAtTime(inRoom ? 0 : 0.12 * mute, t, 0.5);
      // breathing: in through the nose (higher), out slower
      breathPh += dt * 2 * Math.PI * (0.22 + 0.18 * (1 - f.sleep));
      const s = Math.sin(breathPh);
      nodes.breath.f.frequency.setTargetAtTime(s > 0 ? 1100 : 650, t, 0.2);
      nodes.breath.g.gain.setTargetAtTime(inRoom ? Math.max(0, Math.abs(s) - 0.2) * 0.12 * mute : 0, t, 0.15);
      if (inRoom) {
        crackleT -= dt;
        if (crackleT <= 0) { crackleT = 0.08 + Math.random() * 0.6; pop(t, 1500 + Math.random() * 3000, 0.05 + Math.random() * 0.12, 0.03 + Math.random() * 0.05); }
        wufT -= dt;
        if (f.twitch > 0.3 && wufT <= 0) { wufT = 2 + Math.random() * 4; wuf(t); if (Math.random() < 0.5) wuf(t + 0.25); }
      }
      lastWorld = f.world;
    },
  };
}
