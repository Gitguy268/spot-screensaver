// The dream: the back garden at golden hour, soft and glowing, where Spot gallops after a
// butterfly, a tennis ball or a red laser dot. Spot here is the procedural dog from spot-light-hd
// (lib/dog.js) with its IK gait; the prey moves on a smooth looping path and he steers after it.
import * as THREE from 'three';
import { ROOMS, worldOf } from './lib/rooms.js';
import { createDog, SPOT } from './lib/dog.js';
import * as T from './lib/textures.js';

const TAU = Math.PI * 2;
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const damp = (a, b, k, dt) => a + (b - a) * (1 - Math.exp(-k * dt));
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

function butterflyTexture() {
  const c = document.createElement('canvas'); c.width = 128; c.height = 128;
  const g = c.getContext('2d');
  // one wing, drawn as the right half; the mesh mirrors it
  const grad = g.createRadialGradient(10, 64, 6, 30, 60, 110);
  grad.addColorStop(0, '#f6a02a'); grad.addColorStop(0.7, '#e36a10'); grad.addColorStop(1, '#2a1406');
  g.fillStyle = grad;
  g.beginPath(); g.moveTo(4, 62); g.bezierCurveTo(40, -6, 128, 4, 120, 46); g.bezierCurveTo(116, 66, 70, 70, 60, 66);
  g.bezierCurveTo(100, 84, 98, 124, 60, 120); g.bezierCurveTo(30, 116, 12, 88, 4, 66); g.fill();
  g.strokeStyle = '#1a0d05'; g.lineWidth = 5; g.stroke();
  g.lineWidth = 2; g.beginPath();
  for (const [x, y] of [[40, 30], [70, 24], [94, 40], [80, 96], [50, 100]]) { g.moveTo(6, 64); g.quadraticCurveTo(x * 0.5, y * 0.9 + 6, x, y); }
  g.stroke();
  g.fillStyle = '#fff7e0';
  for (const [x, y, r] of [[112, 40, 3.5], [104, 52, 3], [92, 60, 2.5], [86, 110, 3], [70, 116, 2.5]]) { g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill(); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

function tennisTexture() {
  const c = document.createElement('canvas'); c.width = 256; c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#cde23a'; g.fillRect(0, 0, 256, 128);
  let s = 7; const r = () => (s = (s * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 3000; i++) { g.fillStyle = `rgba(${200 + r() * 55},${220 + r() * 35},${40 + r() * 60},0.35)`; g.fillRect(r() * 256, r() * 128, 1.5, 1.5); }
  g.strokeStyle = '#f4f6ea'; g.lineWidth = 6; g.beginPath();
  for (let x = 0; x <= 256; x += 2) { const y = 64 + 34 * Math.sin((x / 256) * TAU * 2); x ? g.lineTo(x, y) : g.moveTo(x, y); }
  g.stroke();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

function makePrey(kind, scene) {
  const o = new THREE.Group();
  scene.add(o);
  if (kind === 'butterfly') {
    const mat = new THREE.MeshStandardMaterial({ map: butterflyTexture(), alphaTest: 0.4, side: THREE.DoubleSide, roughness: 0.6, emissive: 0x3a1a00, emissiveIntensity: 0.4 });
    const wingGeo = new THREE.PlaneGeometry(0.11, 0.11).translate(0.055, 0, 0).rotateX(-Math.PI / 2);
    const wings = [1, -1].map((s) => { const w = new THREE.Mesh(wingGeo, mat); w.scale.x = s; o.add(w); return w; });
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.004, 0.04, 4, 8).rotateX(Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x1a120a }));
    o.add(body);
    o.userData.flap = (t) => { const a = 0.15 + 1.1 * (0.5 + 0.5 * Math.sin(t * 34)); wings[0].rotation.z = a; wings[1].rotation.z = -a; };
  } else if (kind === 'ball') {
    const ball = new THREE.Mesh(new THREE.SphereGeometry(0.034, 24, 16), new THREE.MeshStandardMaterial({ map: tennisTexture(), roughness: 0.95 }));
    ball.castShadow = true;
    o.add(ball);
    o.userData.ball = ball;
  } else {
    const dot = new THREE.Mesh(new THREE.CircleGeometry(0.018, 20).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xff2a2a, toneMapped: false }));
    dot.position.y = 0.004;
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: T.glowSprite(), color: 0xff3030, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.85 }));
    glow.scale.setScalar(0.16); glow.position.y = 0.01;
    o.add(dot, glow);
  }
  return o;
}

// Pollen and light motes drifting through the dream
function motes(group, n) {
  const geo = new THREE.BufferGeometry(), pos = new Float32Array(n * 3), seed = new Float32Array(n);
  let s = 3; const r = () => (s = (s * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < n; i++) { pos[i * 3] = (r() * 2 - 1) * 7; pos[i * 3 + 1] = r() * 2.6; pos[i * 3 + 2] = (r() * 2 - 1) * 5; seed[i] = r() * TAU; }
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const pts = new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xfff0c8, size: 0.035, map: T.glowSprite(), transparent: true, opacity: 0.8, depthWrite: false, blending: THREE.AdditiveBlending }));
  group.add(pts);
  return (dt, t) => {
    for (let i = 0; i < n; i++) {
      pos[i * 3] += Math.sin(t * 0.3 + seed[i]) * dt * 0.08;
      pos[i * 3 + 1] += (0.05 + 0.04 * Math.sin(t + seed[i])) * dt;
      if (pos[i * 3 + 1] > 2.6) pos[i * 3 + 1] = 0;
    }
    geo.attributes.position.needsUpdate = true;
  };
}

export function createDream(q) {
  const room = ROOMS.garden.build(q);
  const world = worldOf(room);
  room.setTime('day');
  const scene = new THREE.Scene();
  scene.add(room.group);
  scene.fog = new THREE.FogExp2(0xf6dcb0, 0.022);
  const dog = createDog(SPOT, q.fur);
  scene.add(dog.group);
  const drift = motes(room.group, q.grass ? 500 : 180);
  const preys = {};
  let prey = null, kind = null;

  // Spot's state for dog.js
  const s = { x: 0, z: 1, vx: 0, vz: 0, heading: 0, speed: 0, hop: 0, air: 0, jumpT: -1, cool: 2 };
  const d = { pos: { x: 0, z: 0 }, heading: 0, speed: 0, pose: 'stand', look: { x: 0, y: 0, z: 0 }, headDown: 0, sniff: 0, pant: 0.7, wag: 0.9, alert: 0.6, crouch: 0, hop: 0, air: 0, rear: 0, carrying: false };
  const p = new THREE.Vector3();
  let clock = 0, preyY = 0;

  // Where the prey is at time t: a smooth loop over the lawn, clear of the tree and the patio.
  function path(t, out) {
    const w = 0.55;
    out.x = 3.4 * Math.sin(w * t) + 0.9 * Math.sin(w * 2.3 * t + 1.3);
    out.z = 0.9 + 1.7 * Math.sin(w * 1.4 * t + 0.6) + 0.45 * Math.sin(w * 3.1 * t);
    return out;
  }

  function start(preyKind, seed = 0) {
    if (prey) prey.visible = false;
    kind = preyKind || 'butterfly';
    prey = preys[kind] ??= makePrey(kind, scene);
    prey.visible = true;
    clock = seed * 7.3;
    path(clock - 1.6, s);
    path(clock, p);
    s.heading = Math.atan2(p.x - s.x, p.z - s.z);
    s.speed = 3; s.air = 0; s.hop = 0; s.jumpT = -1; s.cool = 2;
    for (let i = 0; i < 4; i++) step(0.05); // settle the legs
  }

  function step(dt) {
    clock += dt;
    room.update(dt, clock);
    drift(dt, clock);
    path(clock, p);
    if (kind === 'butterfly') { preyY = 0.55 + 0.35 * Math.sin(clock * 1.7) + 0.12 * Math.sin(clock * 5.3); prey.userData.flap(clock); prey.rotation.y = 0.55 * clock + 0.4 * Math.sin(clock * 3); }
    else if (kind === 'ball') { preyY = 0.034 + 0.42 * Math.abs(Math.sin(clock * 2.6)) * (0.6 + 0.4 * Math.sin(clock * 0.4)); prey.userData.ball.rotation.x += dt * 14; }
    else preyY = 0;
    prey.position.set(p.x, preyY, p.z);

    // Steer toward the prey, gallop when far, ease off close
    const dx = p.x - s.x, dz = p.z - s.z, dist = Math.hypot(dx, dz);
    s.heading += clamp(wrap(Math.atan2(dx, dz) - s.heading), -3.2 * dt, 3.2 * dt);
    s.speed = damp(s.speed, clamp(dist * 2.4 - 0.4, 0.6, 6.2), 2.2, dt);
    // leap at it now and then when close
    s.cool -= dt;
    if (s.jumpT < 0 && s.cool < 0 && dist < 1.4 && dist > 0.5) { s.jumpT = 0; s.cool = 2.5 + 2 * Math.abs(Math.sin(clock * 12.9)); }
    if (s.jumpT >= 0) {
      s.jumpT += dt / 0.55;
      const k = clamp(s.jumpT, 0, 1);
      s.hop = (kind === 'butterfly' ? 0.45 : 0.28) * Math.sin(Math.PI * k);
      s.air = Math.sin(Math.PI * k);
      if (s.jumpT >= 1) { s.jumpT = -1; s.hop = 0; s.air = 0; }
    }
    s.vx = Math.sin(s.heading) * s.speed; s.vz = Math.cos(s.heading) * s.speed;
    s.x += s.vx * dt; s.z += s.vz * dt;
    world.collide(s, 0.3);
    d.pos.x = s.x; d.pos.z = s.z; d.heading = s.heading; d.speed = s.speed;
    d.hop = s.hop; d.air = s.air;
    d.look.x = p.x; d.look.y = preyY; d.look.z = p.z;
    d.wag = 0.8 + 0.2 * Math.sin(clock);
    dog.update(dt, d);
  }

  return {
    scene, room, dog, start, step,
    get spot() { return s; },
    preyPosition: (v = new THREE.Vector3()) => v.copy(prey.position),
    dispose() { room.dispose(); },
  };
}
