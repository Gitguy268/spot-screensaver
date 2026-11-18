// Spot himself: shape, coat and animation, built in code from tubes with a layered fur coat.
// The legs stand on fixed footholds with two-bone IK, so the paws never slide.
// Ported from spot-fetch's dogModel.js (same author, MIT) and extended with a pounce (airborne
// legs), a crouch with a butt wiggle, rearing up at a dot on the wall, and sleeping.
// Dog axes: +z is forward, +y up, the origin is on the ground under the middle of the body.
import * as THREE from 'three';
import { furMesh } from './fur.js';

const TAU = Math.PI * 2;
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const lerp = (a, b, t) => a + (b - a) * t;
const damp = (a, b, k, dt) => a + (b - a) * (1 - Math.exp(-k * dt));
const frac = (x) => x - Math.floor(x);
const ease = (t) => t * t * (3 - 2 * t);

// A tube along +z with elliptical cross-sections [z, rx, ry, cy], smooth (Catmull-Rom) between keys.
function tube(keys, radial = 14, sub = 4) {
  const cr = (a, b, c, d, t) => 0.5 * (2 * b + (c - a) * t + (2 * a - 5 * b + 4 * c - d) * t * t + (3 * b - a - 3 * c + d) * t * t * t);
  const key = (i) => keys[clamp(i, 0, keys.length - 1)];
  const rings = [];
  for (let i = 0; i < keys.length - 1; i++)
    for (let s = 0; s < sub; s++)
      rings.push([0, 1, 2, 3].map((c) => cr(key(i - 1)[c] || 0, key(i)[c] || 0, key(i + 1)[c] || 0, key(i + 2)[c] || 0, s / sub)));
  rings.push([0, 1, 2, 3].map((c) => keys.at(-1)[c] || 0));

  const pos = [], uv = [], idx = [], n = radial + 1;
  rings.forEach(([z, rx, ry, cy], i) => {
    for (let j = 0; j <= radial; j++) {
      const a = (j / radial) * TAU;
      pos.push(Math.max(rx, 1e-4) * Math.cos(a), cy + Math.max(ry, 1e-4) * Math.sin(a), z);
      uv.push(j / radial, i / (rings.length - 1));
    }
  });
  for (let i = 0; i < rings.length - 1; i++)
    for (let j = 0; j < radial; j++) {
      const a = i * n + j;
      idx.push(a, a + 1, a + n, a + 1, a + n + 1, a + n);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  // The seam (first and last column coincide) gets a single normal.
  const nr = g.attributes.normal, va = new THREE.Vector3(), vb = new THREE.Vector3();
  for (let i = 0; i < rings.length; i++) {
    va.fromBufferAttribute(nr, i * n).add(vb.fromBufferAttribute(nr, i * n + radial)).normalize();
    nr.setXYZ(i * n, va.x, va.y, va.z);
    nr.setXYZ(i * n + radial, va.x, va.y, va.z);
  }
  const circumference = (Math.PI * keys.reduce((s, k) => s + k[1] + k[2], 0)) / keys.length;
  g.userData.size = [circumference, keys.at(-1)[0] - keys[0][0]];
  return g;
}
const legTube = (keys) => tube(keys, 12, 3).rotateX(Math.PI / 2); // points down; ry becomes front-back

const H = 0.455; // height of the middle of the body above the ground
// Metres a paw covers per stance phase. The step rate follows from it, so the stance always stays
// within reach of the legs and they never float or slide.
const STRIDE = 0.4;
const FRONT = {
  joint: [0.085, -0.07, 0.2], L: [0.18, 0.21, 0.075], home: [0.09, 0.21], lie: [0.1, 0.46], bend: -1, angle: -0.2,
  upper: [[-0.04, 0.02, 0.03], [0, 0.036, 0.052], [0.09, 0.032, 0.042], [0.18, 0.027, 0.03], [0.2, 0.015, 0.018]],
  lower: [[-0.02, 0.018, 0.02], [0, 0.027, 0.03], [0.11, 0.022, 0.024], [0.21, 0.02, 0.021], [0.225, 0.012, 0.012]],
  foot: [[-0.015, 0.014, 0.014], [0, 0.02, 0.021], [0.05, 0.02, 0.021], [0.07, 0.016, 0.016]],
};
const HIND = {
  joint: [0.08, -0.03, -0.24], L: [0.2, 0.2, 0.13], home: [0.085, -0.3], lie: [0.17, -0.2], bend: 1, angle: -0.25,
  upper: [[-0.05, 0.02, 0.04], [0, 0.045, 0.08, -0.005], [0.1, 0.04, 0.062], [0.2, 0.03, 0.036], [0.22, 0.015, 0.018]],
  lower: [[-0.02, 0.02, 0.022], [0, 0.03, 0.036], [0.1, 0.023, 0.027], [0.2, 0.018, 0.02], [0.215, 0.01, 0.01]],
  foot: [[-0.015, 0.012, 0.013], [0, 0.018, 0.02], [0.08, 0.016, 0.017], [0.115, 0.018, 0.018], [0.125, 0.012, 0.012]],
};
// Phase per leg [left front, right front, left hind, right hind] and the part of the stride a paw stands.
const WALK = { off: [0.25, 0.75, 0, 0.5], duty: 0.6 };
const TROT = { off: [0, 0.5, 0.5, 0], duty: 0.45 };
const GALLOP = { off: [0.55, 0.45, 0, 0.1], duty: 0.24 };

export const SPOT = { coat: 0x17161b, sheen: 0x8a909e, hair: 0.016, collar: 0xc81d1d, scale: 1 };

// layers: number of fur shells (quality setting). onStep(legIndex, worldPos) fires when a paw lands.
export function createDog(cfg = SPOT, layers = 16, onStep = null) {
  const fur = (geo, k = 1) =>
    furMesh(geo, { color: cfg.coat, sheen: cfg.sheen, length: cfg.hair * k, cell: 0.0028, layers, size: geo.userData.size });

  const root = new THREE.Group();
  root.scale.setScalar(cfg.scale);
  const body = new THREE.Group();
  root.add(body);

  const torso = fur(tube([
    [-0.34, 0.02, 0.02, 0.03], [-0.31, 0.085, 0.09, 0.02], [-0.22, 0.105, 0.115, 0], [-0.08, 0.1, 0.105, 0.01],
    [0.08, 0.115, 0.135, -0.015], [0.2, 0.115, 0.14, -0.02], [0.29, 0.09, 0.115, 0], [0.33, 0.02, 0.03, 0.02],
  ], 18));
  body.add(torso);

  // Neck and head
  const neck = new THREE.Group();
  neck.position.set(0, 0.055, 0.25);
  neck.rotation.order = 'YXZ';
  body.add(neck);
  neck.add(fur(tube([[-0.05, 0.06, 0.07], [0, 0.074, 0.085], [0.08, 0.066, 0.074], [0.16, 0.056, 0.06], [0.2, 0.045, 0.048]])));
  const collar = new THREE.Mesh(
    new THREE.TorusGeometry(0.077, 0.007, 10, 28),
    new THREE.MeshStandardMaterial({ color: cfg.collar, roughness: 0.55 }),
  );
  collar.position.z = 0.075;
  collar.scale.set(1, 1.1, 2.2); // flattened into a strap
  collar.castShadow = true;
  const tag = new THREE.Mesh(
    new THREE.CylinderGeometry(0.014, 0.014, 0.003, 16).rotateX(Math.PI / 2),
    new THREE.MeshStandardMaterial({ color: 0xd9b24a, roughness: 0.25, metalness: 1 }),
  );
  tag.position.set(0, -0.1, 0.085);
  neck.add(collar, tag);

  const head = new THREE.Group();
  head.position.z = 0.17;
  head.rotation.order = 'YXZ';
  neck.add(head);
  head.add(fur(tube([
    [-0.08, 0.01, 0.01, 0.015], [-0.065, 0.055, 0.058, 0.015], [0, 0.07, 0.072, 0.018], [0.05, 0.064, 0.062, 0.012],
    [0.085, 0.045, 0.047, -0.01], [0.135, 0.04, 0.04, -0.016], [0.178, 0.035, 0.035, -0.018], [0.195, 0.014, 0.014, -0.016],
  ], 16), 0.4));
  const nose = new THREE.Mesh(new THREE.SphereGeometry(0.017, 16, 12), new THREE.MeshPhysicalMaterial({ color: 0x050505, roughness: 0.18, clearcoat: 0.8, clearcoatRoughness: 0.2 }));
  nose.position.set(0, -0.006, 0.19);
  nose.scale.set(1.15, 0.9, 0.8);
  head.add(nose);
  // Amber-brown eyes with a clear-coat catch-light, and lids that close when he sleeps.
  const eyeMat = new THREE.MeshPhysicalMaterial({ color: 0x3a1c08, roughness: 0.05, clearcoat: 1 });
  const lidMat = new THREE.MeshStandardMaterial({ color: 0x0b0b0e, roughness: 0.8 });
  const lids = [];
  for (const side of [1, -1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.011, 14, 10), eyeMat);
    eye.position.set(0.04 * side, 0.036, 0.072);
    const lid = new THREE.Mesh(new THREE.SphereGeometry(0.0125, 14, 10, 0, TAU, 0, Math.PI / 2), lidMat);
    lid.position.copy(eye.position);
    lid.rotation.x = -Math.PI * 0.5;
    lid.scale.set(1, 1, 0.01);
    head.add(eye, lid);
    lids.push(lid);
  }
  const jaw = new THREE.Group();
  jaw.position.set(0, -0.052, 0.06);
  head.add(jaw);
  jaw.add(fur(tube([[-0.01, 0.02, 0.01], [0, 0.03, 0.014], [0.07, 0.027, 0.012], [0.12, 0.022, 0.01, 0.002], [0.132, 0.008, 0.005, 0.002]], 10, 3), 0.3));
  const tongue = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 8), new THREE.MeshPhysicalMaterial({ color: 0xd9667a, roughness: 0.35, clearcoat: 0.5 }));
  tongue.scale.set(0.017, 0.004, 0.05);
  jaw.add(tongue);
  const mouth = new THREE.Object3D(); // where a carried ball or sock sits
  mouth.position.set(0, -0.055, 0.165);
  head.add(mouth);

  const earGeo = tube([[0, 0.022, 0.005], [0.03, 0.038, 0.007], [0.075, 0.034, 0.006], [0.115, 0.012, 0.004]], 10, 3)
    .rotateX(Math.PI / 2).rotateY(Math.PI / 2);
  const ears = [1, -1].map((side) => {
    const ear = new THREE.Group();
    ear.position.set(0.058 * side, 0.04, -0.01);
    ear.add(fur(earGeo, 0.5));
    ear.userData.side = side;
    head.add(ear);
    return ear;
  });

  // Tail: four segments, pointing back (the otter tail of a lab: thick at the root)
  const tailRoot = new THREE.Group();
  tailRoot.position.set(0, 0.05, -0.31);
  tailRoot.rotation.y = Math.PI;
  body.add(tailRoot);
  const tail = [];
  [[0.034, 0.028], [0.028, 0.022], [0.022, 0.016], [0.016, 0.006]].reduce((parent, [r0, r1], i) => {
    const seg = new THREE.Group();
    seg.position.z = i ? 0.085 : 0;
    seg.add(fur(tube([[-0.015, r0 * 0.8, r0 * 0.8], [0, r0, r0], [0.085, r1, r1], [0.1, r1 * 0.5, r1 * 0.5]], 8, 2)));
    parent.add(seg);
    tail.push(seg);
    return seg;
  }, tailRoot);

  // Legs
  const pawGeo = tube([[-0.035, 0.008, 0.008], [-0.02, 0.026, 0.018], [0.01, 0.03, 0.02], [0.035, 0.022, 0.014, -0.004], [0.045, 0.006, 0.006, -0.006]], 10, 3);
  const legs = [[FRONT, 1], [FRONT, -1], [HIND, 1], [HIND, -1]].map(([spec, side]) => {
    const hip = new THREE.Group();
    hip.position.set(spec.joint[0] * side, spec.joint[1], spec.joint[2]);
    hip.rotation.order = 'ZXY';
    const knee = new THREE.Group();
    knee.position.y = -spec.L[0];
    const ankle = new THREE.Group();
    ankle.position.y = -spec.L[1];
    const paw = fur(pawGeo, 0.4);
    paw.position.set(0, -spec.L[2] + 0.02, 0.012);
    paw.rotation.x = -spec.angle;
    hip.add(fur(legTube(spec.upper)), knee);
    knee.add(fur(legTube(spec.lower), 0.6), ankle);
    ankle.add(fur(legTube(spec.foot), 0.5), paw);
    body.add(hip);
    return { spec, side, hip, knee, ankle, pos: new THREE.Vector3(1e3, 0, 0), from: new THREE.Vector3(), swing: false, st: null, sw0: 0, lift: 0 };
  });

  const S = { t: 0, clock: 0, off: [...WALK.off], duty: WALK.duty, sit: 0, lie: 0, sleep: 0, crouch: 0, rear: 0, air: 0,
    hd: 0, yaw: 0, up: 0, wag: 0, breath: 0, bark: 0 };
  const home = new THREE.Vector3(), target = new THREE.Vector3(), loc = new THREE.Vector3();

  // Two-bone IK in the plane of the leg, plus a sideways tilt from the hip.
  function solve(leg, ankleAt, pawPitch, bodyPitch) {
    const [L1, L2] = leg.spec.L;
    const dx = ankleAt.x - leg.hip.position.x, dy = Math.min(ankleAt.y - leg.hip.position.y, -0.02), dz = ankleAt.z - leg.hip.position.z;
    const down = Math.hypot(dx, dy);
    const d = clamp(Math.hypot(down, dz), Math.abs(L1 - L2) + 0.02, L1 + L2 - 0.002);
    const A = Math.acos(clamp((L1 * L1 + d * d - L2 * L2) / (2 * L1 * d), -1, 1));
    const K = Math.acos(clamp((L1 * L1 + L2 * L2 - d * d) / (2 * L1 * L2), -1, 1));
    const t1 = Math.atan2(dz, down) + leg.spec.bend * A;
    const t2 = -leg.spec.bend * (Math.PI - K);
    leg.hip.rotation.set(-t1, 0, Math.atan2(dx, -dy));
    leg.knee.rotation.x = -t2;
    leg.ankle.rotation.x = pawPitch + t1 + t2 - bodyPitch;
  }

  // d (from brain.js): pos {x,z}, heading, speed, pose ('stand'|'sit'|'lie'|'sleep'), look {x,y,z},
  // headDown, sniff, pant, wag, alert, crouch, hop (m above ground), air (0..1 legs stretched), rear, carrying.
  function update(dt, d) {
    S.t += dt;
    const v = d.speed;
    root.position.set(d.pos.x, d.hop || 0, d.pos.z);
    root.rotation.y = d.heading;
    S.sit = damp(S.sit, d.pose === 'sit' ? 1 : 0, 7, dt);
    S.lie = damp(S.lie, d.pose === 'lie' || d.pose === 'sleep' ? 1 : 0, 4, dt);
    S.sleep = damp(S.sleep, d.pose === 'sleep' ? 1 : 0, 2, dt);
    S.crouch = damp(S.crouch, d.crouch || 0, 12, dt);
    S.rear = damp(S.rear, d.rear || 0, 6, dt);
    S.air = damp(S.air, d.air || 0, 18, dt);
    S.hd = damp(S.hd, d.headDown, 9, dt);

    // Gait: walk, trot or gallop by speed
    const gait = v < 1.5 ? WALK : v < 3 ? TROT : GALLOP;
    const f = Math.max(1.2, (v * S.duty) / STRIDE);
    const moving = v > 0.15 && S.air < 0.3;
    if (moving) S.clock += f * dt;
    const k = 1 - Math.exp(-8 * dt);
    S.duty += (gait.duty - S.duty) * k;
    for (let i = 0; i < 4; i++) S.off[i] += (frac(gait.off[i] - S.off[i] + 0.5) - 0.5) * k;
    const gal = clamp((v - 2.8) / 1, 0, 1);
    const c = S.clock * TAU;
    const bob = (1 - gal) * 0.012 * Math.min(v / 2, 1) * Math.sin(2 * c) + gal * 0.035 * Math.sin(c + 1);
    const standing = (1 - S.sit) * (1 - S.lie);
    const wiggle = S.crouch * 0.05 * Math.sin(S.t * 22); // the butt wiggle before a pounce
    body.position.set(wiggle * 0.3, H + bob - 0.2 * S.sit - 0.3 * S.lie - 0.08 * S.hd * standing - 0.12 * S.crouch + 0.08 * S.rear, -0.04 * S.sit - 0.06 * S.rear);
    body.rotation.x = -0.6 * S.sit + gal * 0.1 * Math.sin(c - 0.6) + 0.35 * S.hd * standing + 0.12 * S.crouch - 0.85 * S.rear - 0.25 * S.air * Math.sin(Math.PI * clamp(d.air || 0, 0, 1));
    body.rotation.z = (1 - gal) * 0.025 * Math.sin(c) * Math.min(v, 1);
    body.rotation.y = wiggle * 0.6;
    root.updateMatrixWorld(true);
    const bp = body.rotation.x;

    // Paws: planted during stance, swinging to the next foothold, stretched out in the air during a pounce
    const fx = Math.sin(d.heading), fz = Math.cos(d.heading);
    const standT = S.duty / f, swingT = (1 - S.duty) / f;
    let stepping = legs.some((l) => l.swing);
    legs.forEach((leg, i) => {
      const sp = leg.spec;
      const isFront = sp === FRONT;
      home.set(leg.side * lerp(sp.home[0], sp.lie[0], S.lie), 0, lerp(sp.home[1], sp.lie[1], S.lie) + (isFront ? 0.04 : -0.03) * S.crouch);
      root.localToWorld(home);
      const reared = isFront && S.rear > 0.05;
      if (S.air > 0.05 || reared) {
        // In the air: front paws reach forward, hind legs push back. Rearing lifts only the front paws.
        const a = reared ? S.rear : S.air;
        const reach = isFront ? 0.2 * a : -0.2 * a;
        leg.pos.set(leg.side * sp.home[0], (reared ? 0.32 * a : 0.1 * a), sp.home[1] + reach);
        root.localToWorld(leg.pos);
        leg.pos.y = Math.max(0, leg.pos.y);
        leg.swing = false;
        leg.lift = 0.6 * a;
      } else if (leg.pos.distanceToSquared(home) > 1.2) {
        leg.pos.copy(home); // first frame, or teleported
        leg.swing = false;
      } else if (moving) {
        const ph = frac(S.clock + S.off[i]);
        if (ph >= S.duty) {
          const sw = (ph - S.duty) / (1 - S.duty);
          if (!leg.swing || leg.st !== null) {
            leg.swing = true;
            leg.st = null;
            leg.sw0 = Math.min(sw, 0.9);
            leg.from.copy(leg.pos).setY(0);
          }
          const s = clamp((sw - leg.sw0) / (1 - leg.sw0), 0, 1);
          const ahead = (1 - sw) * swingT + standT * 0.5; // so the paw is under the hip halfway through the stance
          target.set(home.x + fx * v * ahead, 0, home.z + fz * v * ahead);
          leg.lift = Math.sin(Math.PI * s);
          leg.pos.lerpVectors(leg.from, target, ease(s)).setY((0.035 + 0.012 * Math.min(v, 6) + 0.03 * gal) * leg.lift);
        } else if (leg.swing) {
          leg.swing = false;
          leg.pos.y = 0;
          leg.lift = 0;
          onStep?.(i, leg.pos, v);
        }
      } else {
        // Standing: only step when a paw is too far from its place, one at a time
        if (!leg.swing && !stepping && Math.hypot(leg.pos.x - home.x, leg.pos.z - home.z) > 0.07) leg.swing = stepping = true;
        if (leg.swing) {
          if (leg.st === null) {
            leg.st = 0;
            leg.from.copy(leg.pos).setY(0);
          }
          leg.st += dt / 0.2;
          const s = Math.min(leg.st, 1);
          leg.lift = Math.sin(Math.PI * s);
          leg.pos.lerpVectors(leg.from, home, ease(s)).setY(0.03 * leg.lift);
          if (s >= 1) {
            leg.swing = false;
            leg.st = null;
            onStep?.(i, leg.pos, 0.3);
          }
        } else leg.lift = 0;
      }

      // The ankle sits a foot length above the foothold; convert to body coordinates.
      const angle = sp.angle + (isFront ? 0.7 : 0.5) * leg.lift;
      const oy = sp.L[2] * Math.cos(angle), oz = sp.L[2] * Math.sin(angle);
      body.worldToLocal(loc.copy(leg.pos));
      loc.y += oy * Math.cos(bp) + oz * Math.sin(bp);
      loc.z += -oy * Math.sin(bp) + oz * Math.cos(bp);
      solve(leg, loc, angle, bp);
    });

    // The head follows what he looks at; sniffing and picking up put the nose on the ground
    let yaw = 0, up = 0;
    if (d.look) {
      body.worldToLocal(loc.set(d.look.x, d.look.y ?? 0.1, d.look.z)).sub(neck.position);
      yaw = clamp(Math.atan2(loc.x, loc.z), -1.4, 1.4);
      up = clamp(Math.atan2(loc.y - 0.12, Math.hypot(loc.x, loc.z)), -0.8, 0.9);
    }
    if (d.sniff) yaw += 0.25 * Math.sin(S.t * 7);
    S.yaw = damp(S.yaw, yaw * (1 - S.hd * 0.7) * (1 - S.sleep), 8, dt);
    S.up = damp(S.up, up * (1 - S.sleep), 8, dt);
    const neckUp = lerp(lerp(0.75 + 0.3 * S.up - 0.3 * gal - 0.35 * S.crouch, -0.9, S.hd), -0.35, S.sleep);
    const headUp = lerp(lerp(S.up - 0.1, -1.15 + bp, S.hd), -0.2, S.sleep); // relative to the body
    neck.rotation.set(-neckUp, S.yaw * 0.5, 0);
    head.rotation.set(neckUp - headUp, S.yaw * 0.5, 0);

    // Eyelids: a blink now and then, closed when asleep
    const blink = frac(S.t / 4.3) > 0.97 ? 1 : 0;
    for (const lid of lids) lid.scale.z = Math.max(0.01, Math.max(blink, S.sleep));

    // Mouth: carrying, panting, barking
    S.bark = Math.max(0, S.bark - dt * 4);
    jaw.rotation.x = Math.max(d.carrying ? 0.3 : 0, d.pant * (0.2 + 0.05 * Math.sin(S.t * 26)) * (1 - S.sleep), S.bark * 0.5);
    tongue.visible = d.pant > 0.3 && !d.carrying && S.sleep < 0.5;
    tongue.position.set(0, 0.014, 0.07 + 0.03 * d.pant);

    // Breathing: faster and deeper with effort, slow and deep asleep
    S.breath += dt * TAU * (0.35 + 2.4 * d.pant * (1 - S.sleep) - 0.15 * S.sleep);
    const breath = Math.sin(S.breath) * (1 + d.pant + S.sleep);
    torso.scale.set(1 + 0.012 * breath, 1 + 0.008 * breath, 1);

    const flap = 0.14 * Math.min(v / 5, 1) * Math.max(0, Math.sin(2 * c + 0.5)) + 0.25 * S.air;
    for (const ear of ears) {
      ear.rotation.z = ear.userData.side * (0.22 + flap + 0.2 * d.alert);
      ear.rotation.x = -0.3 * d.alert - 0.4 * S.air;
    }

    // Tail: wags with his mood, stretched in a gallop, flat on the ground when he sits or sleeps
    S.wag += dt * (5 + 9 * d.wag + 10 * S.crouch);
    const amp = (0.55 * d.wag + 0.3 * S.crouch) * (1 - 0.6 * gal) * (1 - S.sleep);
    tail[0].rotation.x = -(lerp(0.1 + 0.45 * d.wag, 0.05, gal) * (1 - S.lie) + 0.6 * S.sit) + 0.3 * S.air;
    tail.forEach((seg, i) => {
      seg.rotation.y = amp * Math.sin(S.wag - i * 0.6) * (i ? 0.65 : 1);
      if (i) seg.rotation.x = -0.06;
    });
  }

  const headWorld = new THREE.Vector3();
  return {
    group: root, body, head, mouth, update,
    bark: () => (S.bark = 1),
    headPosition: () => head.getWorldPosition(headWorld),
    state: S,
  };
}
