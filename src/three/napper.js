// Spot dozing by the fire: the 3D scan of him sitting in his blanket, brought to life without a
// skeleton. At load every vertex gets weights for a few soft regions (neck, head, chest, paws,
// tail, ears, cheeks), worked out from where it sits on the scan and how dark the texture is there
// (black fur vs. the light blanket), then smoothed over the mesh so nothing tears. Each frame the
// CPU moves the vertices: a slow head nod as he dozes off, breathing, paw and lip twitches while he
// dreams, eyelids, a look around and a tail thump when he wakes.
// Scan axes after export: +y up, he faces +z, the origin is on the floor under him.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import scanUrl from '../../assets/spot-blanket.glb?url';

const TAU = Math.PI * 2;
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const damp = (a, b, k, dt) => a + (b - a) * (1 - Math.exp(-k * dt));

// Landmarks on the scan, measured from orthographic renders (metres, scan space).
export const SCAN = {
  neckPivot: new THREE.Vector3(-0.015, 0.482, -0.023),
  headPivot: new THREE.Vector3(-0.015, 0.572, 0.013),
  eyes: [[-0.068, 0.693], [0.040, 0.693]], // x, y; z is found by a ray from the front
  eyeRadius: 0.0145,
  tailRoot: new THREE.Vector3(0.04, 0.05, -0.24),
};

// Samples the base colour at each vertex's UV: 0 = black fur, 1 = light blanket.
function lightness(geo, image) {
  const W = 256, c = document.createElement('canvas');
  c.width = c.height = W;
  const g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(image, 0, 0, W, W);
  const px = g.getImageData(0, 0, W, W).data, uv = geo.attributes.uv, out = new Float32Array(uv.count);
  for (let i = 0; i < uv.count; i++) {
    const x = clamp(Math.floor(uv.getX(i) * W), 0, W - 1), y = clamp(Math.floor(uv.getY(i) * W), 0, W - 1), k = (y * W + x) * 4;
    out[i] = smooth(0.12, 0.3, (0.3 * px[k] + 0.59 * px[k + 1] + 0.11 * px[k + 2]) / 255);
  }
  return out;
}

// Averages each weight with its neighbours a few times (positions are welded first, because the
// scan's UV seams split vertices), so neighbouring vertices never move apart.
function smoothWeights(geo, weights, rounds) {
  const pos = geo.attributes.position, n = pos.count, key = new Map(), id = new Int32Array(n);
  for (let i = 0; i < n; i++) {
    const k = `${Math.round(pos.getX(i) * 2e4)},${Math.round(pos.getY(i) * 2e4)},${Math.round(pos.getZ(i) * 2e4)}`;
    if (!key.has(k)) key.set(k, key.size);
    id[i] = key.get(k);
  }
  const m = key.size, nb = Array.from({ length: m }, () => new Set()), idx = geo.index.array;
  for (let t = 0; t < idx.length; t += 3) {
    const a = id[idx[t]], b = id[idx[t + 1]], c = id[idx[t + 2]];
    nb[a].add(b).add(c); nb[b].add(a).add(c); nb[c].add(a).add(b);
  }
  const lists = nb.map((s) => Int32Array.from(s));
  for (const w of weights) {
    let cur = new Float32Array(m);
    const cnt = new Float32Array(m);
    for (let i = 0; i < n; i++) { cur[id[i]] += w[i]; cnt[id[i]]++; }
    for (let j = 0; j < m; j++) cur[j] /= cnt[j];
    for (let r = 0; r < rounds; r++) {
      const next = new Float32Array(m);
      for (let j = 0; j < m; j++) { let s = cur[j]; const l = lists[j]; for (let k = 0; k < l.length; k++) s += cur[l[k]]; next[j] = s / (l.length + 1); }
      cur = next;
    }
    for (let i = 0; i < n; i++) w[i] = cur[id[i]];
  }
}

export function loadNapper({ furLayers = 0 } = {}) {
  return new GLTFLoader().loadAsync(scanUrl).then((gltf) => buildNapper(gltf, furLayers));
}

function buildNapper(gltf, furLayers) {
  let mesh;
  gltf.scene.traverse((o) => { if (o.isMesh && !mesh) mesh = o; });
  // bake the node transform (the export may carry a rotation) into the vertices
  gltf.scene.updateMatrixWorld(true);
  mesh.geometry.applyMatrix4(mesh.matrixWorld);
  mesh.removeFromParent();
  mesh.position.set(0, 0, 0); mesh.rotation.set(0, 0, 0); mesh.scale.set(1, 1, 1);
  const geo = mesh.geometry;
  geo.computeBoundingBox();
  console.debug('scan bounds', geo.boundingBox.min.toArray().map((v) => v.toFixed(3)), geo.boundingBox.max.toArray().map((v) => v.toFixed(3)));
  if (!geo.index) geo.setIndex([...Array(geo.attributes.position.count).keys()]);
  const mat = mesh.material;
  mat.side = THREE.FrontSide;
  mat.envMapIntensity = 0.6;
  // the scan's specular is set to 2x; tone it down so his fur doesn't look wet
  if (mat.specularIntensity !== undefined) { mat.specularIntensity = 0.35; mat.specularColor?.setScalar(1); }

  const pos = geo.attributes.position, nor = geo.attributes.normal, n = pos.count;
  pos.setUsage(THREE.DynamicDrawUsage); nor.setUsage(THREE.DynamicDrawUsage);
  const rest = Float32Array.from(pos.array), restN = Float32Array.from(nor.array);
  const light = lightness(geo, mat.map.image);

  // Region weights
  const W = { neck: new Float32Array(n), head: new Float32Array(n), chest: new Float32Array(n), pawL: new Float32Array(n), pawR: new Float32Array(n),
    tail: new Float32Array(n), earL: new Float32Array(n), earR: new Float32Array(n), cheek: new Float32Array(n) };
  for (let i = 0; i < n; i++) {
    const x = rest[i * 3], y = rest[i * 3 + 1], z = rest[i * 3 + 2], fur = 1 - light[i];
    // the blanket bunched behind his head follows the neck only a little
    const behind = smooth(-0.02, -0.1, z) * light[i];
    W.neck[i] = smooth(0.44, 0.56, y) * smooth(-0.16, -0.06, z) * (1 - 0.75 * behind);
    W.head[i] = smooth(0.55, 0.62, y) * smooth(-0.1, -0.02, z) * (1 - 0.9 * behind);
    W.chest[i] = smooth(0.12, 0.3, y) * smooth(0.55, 0.36, y);
    const front = smooth(0.1, 0.16, z) * smooth(0.11, 0.05, y) * fur;
    W.pawL[i] = front * smooth(-0.01, 0.03, x);
    W.pawR[i] = front * smooth(0.01, -0.03, x);
    W.tail[i] = smooth(-0.24, -0.34, z) * smooth(0.14, 0.07, y) * fur;
    const earBand = smooth(0.57, 0.62, y) * smooth(0.76, 0.7, y) * smooth(-0.04, 0.02, z) * smooth(0.14, 0.08, z) * fur;
    W.earR[i] = earBand * smooth(-0.095, -0.12, x);
    W.earL[i] = earBand * smooth(0.075, 0.1, x);
    W.cheek[i] = smooth(0.14, 0.18, z) * smooth(0.57, 0.6, y) * smooth(0.68, 0.64, y) * fur;
  }
  smoothWeights(geo, Object.values(W), 6);
  for (let i = 0; i < n; i++) W.head[i] = Math.min(W.head[i], W.neck[i]); // the head rides on the neck

  // Eyes: find the surface in front of each eye with a ray, and put a lid over it.
  const probe = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
  probe.updateMatrixWorld(true);
  const ray = new THREE.Raycaster();
  const group = new THREE.Group();
  const headSpace = new THREE.Group(); // follows the head transform; the lids live here
  headSpace.matrixAutoUpdate = false;
  group.add(mesh, headSpace);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.frustumCulled = false;
  const lidMat = new THREE.MeshStandardMaterial({ color: 0x141317, roughness: 0.85 });
  const lashMat = new THREE.MeshStandardMaterial({ color: 0x030303, roughness: 0.5, transparent: true });
  const lids = SCAN.eyes.map(([x, y]) => {
    ray.set(new THREE.Vector3(x, y, 1), new THREE.Vector3(0, 0, -1));
    const hit = ray.intersectObject(probe)[0];
    const zs = hit ? hit.point.z : 0.157;
    const r = SCAN.eyeRadius;
    const side = x < -0.015 ? -1 : 1;
    // the eye looks forward and a little outward
    const look = new THREE.Vector3(side * 0.3, 0.05, 1).normalize();
    const pivot = new THREE.Group();
    pivot.position.set(x, y, zs).addScaledVector(look, -r * 0.55);
    pivot.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), look);
    const lid = new THREE.Mesh(new THREE.SphereGeometry(r * 1.02, 24, 12, 0, TAU, 0, Math.PI * 0.58), lidMat);
    // the crease where the closed lids meet: a thin dark arc across the eye, a little below centre
    const arc = [];
    for (let k = 0; k <= 12; k++) { const a = -1.15 + (2.3 * k) / 12, yy = -0.18 * r; const rr = Math.sqrt(Math.max(0, (r * 1.06) ** 2 - yy * yy)); arc.push(new THREE.Vector3(Math.sin(a) * rr, yy + 0.06 * r * Math.cos(a), Math.cos(a) * rr)); }
    const lash = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(arc), 24, r * 0.07, 6), lashMat);
    pivot.add(lid, lash);
    headSpace.add(pivot);
    return { lid, lash, side, z: zs, hit: !!hit };
  });

  // Optional fur shells over the black coat (not the blanket), using 3D noise on the rest pose.
  let coat = null;
  if (furLayers > 0) {
    geo.setAttribute('restPos', new THREE.BufferAttribute(rest.slice(), 3));
    geo.setAttribute('furMask', new THREE.BufferAttribute(Float32Array.from(light, (l) => 1 - l), 1));
    coat = makeCoat(geo, mat, furLayers);
    group.add(coat);
  }

  // Bones (as matrices): neck and head pivots, rotated by nod and look.
  const Mn = new THREE.Matrix4(), Mh = new THREE.Matrix4(), tmp = new THREE.Matrix4(), Rq = new THREE.Matrix4();
  const e = new THREE.Euler(0, 0, 0, 'YXZ');
  const pivotM = (out, p, pitch, yaw, roll) => {
    e.set(pitch, yaw, roll);
    Rq.makeRotationFromEuler(e);
    return out.makeTranslation(p.x, p.y, p.z).multiply(Rq).multiply(tmp.makeTranslation(-p.x, -p.y, -p.z));
  };
  const hp = new THREE.Vector3();

  // Motion state
  const S = { t: 0, nod: 0.25, nodTarget: 0.25, nodTimer: 3, look: 0, lookT: 0, lid: 1, ear: [0, 0], earTimer: 4, tailWag: 0, puff: 0, puffTimer: 2,
    paw: [0, 0], pawTimer: 1, breath: 0 };
  let rand = 0.5;
  const rnd = () => (rand = (rand * 9301 + 49297) % 233280) / 233280;

  function update(dt, f) {
    S.t += dt;
    const asleep = clamp(f.sleep, 0, 1), twitch = f.twitch;
    const awake = 1 - asleep;

    // Dozing nod: the head sinks slowly, then a small catch back up. Deeper while dreaming.
    S.nodTimer -= dt;
    if (S.nodTimer <= 0) {
      const deep = 0.32 + 0.12 * twitch;
      const low = S.nodTarget > deep * 0.7;
      S.nodTarget = low ? deep * (0.35 + 0.2 * rnd()) : deep * (0.85 + 0.25 * rnd());
      S.nodTimer = low ? 1.2 + rnd() : 6 + 6 * rnd();
    }
    const sinking = S.nodTarget * asleep > S.nod;
    S.nod = damp(S.nod, S.nodTarget * asleep - 0.06 * awake, sinking ? 0.35 : 3.5, dt);

    // Awake: a slow look around, left and right
    S.lookT += dt * awake;
    S.look = damp(S.look, awake * 0.35 * Math.sin(S.lookT * 0.7), 3, dt);

    // Breathing: slow and deep asleep, quicker awake
    S.breath += dt * TAU * (0.22 + 0.18 * awake + 0.05 * twitch);
    const breath = Math.sin(S.breath);

    // Dream twitches: paws paddle in little bursts, lips puff (a muffled woof), ears flick
    S.pawTimer -= dt;
    if (S.pawTimer <= 0) S.pawTimer = twitch > 0.2 ? 0.6 + 1.6 * rnd() * (1.2 - twitch) : 3 + 4 * rnd();
    const burst = twitch * smooth(0.1, 0, Math.abs(S.pawTimer - 0.35) - 0.25);
    S.paw[0] = burst * Math.max(0, Math.sin(S.t * 19));
    S.paw[1] = burst * Math.max(0, Math.sin(S.t * 19 + 2.4));
    S.puffTimer -= dt;
    if (S.puffTimer <= 0) S.puffTimer = twitch > 0.3 ? 1.5 + 3 * rnd() : 8 + 6 * rnd();
    S.puff = Math.max(twitch, 0.3) * smooth(0.25, 0, Math.abs(S.puffTimer - 0.2));
    S.earTimer -= dt;
    if (S.earTimer <= 0) S.earTimer = 3 + 6 * rnd() * (1 - 0.6 * twitch);
    const flick = smooth(0.18, 0, Math.abs(S.earTimer - 0.15)) * Math.sin(S.t * 40);
    S.ear[0] = flick; S.ear[1] = (Math.floor(S.t / 7) % 2 ? flick : 0) * 0.8;

    // Tail: a few thumps when he wakes and sees you
    S.tailWag = damp(S.tailWag, awake, 1.5, dt);

    // Eyelids: shut asleep, the odd blink awake
    const blink = (S.t % 5.3) > 5.15 ? 1 : 0;
    S.lid = damp(S.lid, Math.max(asleep, blink), asleep > 0.5 ? 2.5 : 14, dt);

    // Head transforms
    const pitchN = S.nod * 0.45, pitchH = S.nod * 0.6 + 0.02 * breath * asleep;
    const yaw = S.look, roll = 0.04 * Math.sin(S.t * 0.13) * asleep;
    pivotM(Mn, SCAN.neckPivot, pitchN, yaw * 0.5, roll * 0.5);
    hp.copy(SCAN.headPivot).applyMatrix4(Mn);
    pivotM(Mh, hp, pitchH, yaw * 0.5, roll * 0.5).multiply(Mn);
    const tailA = S.tailWag * 0.28 * Math.sin(S.t * 9) + 0.03 * Math.sin(S.t * 0.6);
    const bA = 0.0055 * (1 + 0.5 * twitch) * breath;
    const tr = SCAN.tailRoot, ct = Math.cos(tailA), st = Math.sin(tailA);
    const mn = Mn.elements, mh = Mh.elements;

    const P = pos.array, N = nor.array;
    for (let i = 0; i < n; i++) {
      const j = i * 3;
      let x = rest[j], y = rest[j + 1], z = rest[j + 2];
      let nx = restN[j], ny = restN[j + 1], nz = restN[j + 2];
      // breathing: the ribcage swells outward from his middle
      const wc = W.chest[i];
      if (wc > 0.001) { const dx = x, dz = z + 0.02, d = Math.hypot(dx, dz) || 1; x += (dx / d) * bA * wc; z += (dz / d) * bA * wc; }
      // paws lift and paddle
      const pl = W.pawL[i] * S.paw[0] + W.pawR[i] * S.paw[1];
      if (pl > 0.001) { y += 0.012 * pl; z += 0.008 * pl; }
      // tail sweeps around its root
      const wt = W.tail[i];
      if (wt > 0.001) {
        const dx = x - tr.x, dz = z - tr.z, a = wt;
        x = tr.x + dx * (1 - a + a * ct) - dz * a * st;
        z = tr.z + dz * (1 - a + a * ct) + dx * a * st;
        y += 0.02 * S.tailWag * wt * Math.max(0, Math.sin(S.t * 9 + 1));
      }
      // ears flick up and out a touch; cheeks puff
      const we = W.earL[i] * S.ear[0] + W.earR[i] * S.ear[1];
      if (we > 0.001 || we < -0.001) { y += 0.008 * we; x += 0.004 * we * Math.sign(x + 0.015); }
      const wk = W.cheek[i] * S.puff;
      if (wk > 0.001) { x += 0.005 * wk * Math.sign(x + 0.015); y -= 0.002 * wk; }
      // neck and head (linear blend of root, neck and head)
      const wn = W.neck[i], wh = W.head[i];
      if (wn > 0.001) {
        const a = 1 - wn, b = wn - wh, c = wh;
        const X = a * x + b * (mn[0] * x + mn[4] * y + mn[8] * z + mn[12]) + c * (mh[0] * x + mh[4] * y + mh[8] * z + mh[12]);
        const Y = a * y + b * (mn[1] * x + mn[5] * y + mn[9] * z + mn[13]) + c * (mh[1] * x + mh[5] * y + mh[9] * z + mh[13]);
        const Z = a * z + b * (mn[2] * x + mn[6] * y + mn[10] * z + mn[14]) + c * (mh[2] * x + mh[6] * y + mh[10] * z + mh[14]);
        const NX = a * nx + b * (mn[0] * nx + mn[4] * ny + mn[8] * nz) + c * (mh[0] * nx + mh[4] * ny + mh[8] * nz);
        const NY = a * ny + b * (mn[1] * nx + mn[5] * ny + mn[9] * nz) + c * (mh[1] * nx + mh[5] * ny + mh[9] * nz);
        const NZ = a * nz + b * (mn[2] * nx + mn[6] * ny + mn[10] * nz) + c * (mh[2] * nx + mh[6] * ny + mh[10] * nz);
        x = X; y = Y; z = Z; nx = NX; ny = NY; nz = NZ;
      }
      P[j] = x; P[j + 1] = y; P[j + 2] = z;
      N[j] = nx; N[j + 1] = ny; N[j + 2] = nz;
    }
    pos.needsUpdate = true;
    nor.needsUpdate = true;

    headSpace.matrix.copy(Mh);
    headSpace.matrixWorldNeedsUpdate = true;
    // lid rotation: closed covers the eye (pole forward), open is tucked up under the brow;
    // while dreaming the closed lids ripple a little (eye movement under the lids)
    const ripple = twitch * 0.06 * Math.sin(S.t * 23) * Math.sin(S.t * 3.1);
    for (const L of lids) {
      L.lid.rotation.x = Math.PI / 2 - (1 - S.lid) * 1.25 + ripple;
      L.lid.visible = S.lid > 0.04;
      L.lash.visible = S.lid > 0.85;
      L.lash.material.opacity = smooth(0.85, 1, S.lid);
    }
  }

  return {
    group, update, lids,
    headWorld: (v = new THREE.Vector3()) => v.set(-0.015, 0.64, 0.12).applyMatrix4(Mh).applyMatrix4(group.matrixWorld),
    state: S,
    weights: W,
  };
}

// Fur shells on the scan: each shell is the mesh pushed out along its normals; a 3D value noise on
// the rest position decides where a hair still reaches, so the hairs stay put as he moves.
function makeCoat(geo, baseMat, layers) {
  const mat = new THREE.MeshStandardMaterial({ map: baseMat.map, color: 0xffffff, roughness: 0.75 });
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.furLen = { value: 0.006 };
    sh.uniforms.furLayers = { value: layers };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec3 restPos; attribute float furMask;\nuniform float furLen, furLayers;\nvarying float vLayer; varying vec3 vRest; varying float vMask;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vLayer = (float(gl_InstanceID) + 1.0) / furLayers;
        vRest = restPos; vMask = furMask;
        transformed += normalize(objectNormal) * furLen * vLayer * furMask;
        transformed.y -= furLen * 0.35 * vLayer * vLayer * furMask;`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        varying float vLayer; varying vec3 vRest; varying float vMask;
        float h3(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
        float n3(vec3 p) { vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
          return mix(mix(mix(h3(i), h3(i + vec3(1,0,0)), f.x), mix(h3(i + vec3(0,1,0)), h3(i + vec3(1,1,0)), f.x), f.y),
                     mix(mix(h3(i + vec3(0,0,1)), h3(i + vec3(1,0,1)), f.x), mix(h3(i + vec3(0,1,1)), h3(i + vec3(1,1,1)), f.x), f.y), f.z); }`)
      .replace('#include <map_fragment>', `#include <map_fragment>
        if (vMask < 0.5) discard;
        float hair = n3(vRest * 1400.0) * 0.7 + n3(vRest * 380.0) * 0.3;
        if (hair < vLayer * 0.85 + 0.12) discard;
        diffuseColor.rgb *= mix(0.55, 1.15, vLayer);`);
  };
  const coat = new THREE.InstancedMesh(geo, mat, layers);
  coat.frustumCulled = false;
  coat.castShadow = false;
  coat.receiveShadow = true;
  return coat;
}
