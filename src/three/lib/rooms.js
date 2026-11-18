// Copied from spot-light-hd (same author, MIT); the cabin's stockings were removed for the screensaver.
// The three places Spot can play: a living room, a garden and a snowy cabin at Christmas.
// Each room returns its meshes plus what the game needs to know: walls and furniture to bump into
// (colliders), things that block his view (occluders), the floor type underfoot (for grip and
// paw sounds), where his bed is, and how the light changes with the time of day.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { Sky } from 'three/addons/objects/Sky.js';
import * as T from './textures.js';
import portraitUrl from '../../../assets/spot-bandana.webp?inline';

const TAU = Math.PI * 2;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const rng = (seed) => { let s = seed; return () => (s = (s * 16807) % 2147483647) / 2147483647; };

export const ROOMS = {
  living: { label: 'Living room', build: livingRoom },
  garden: { label: 'Garden', build: garden },
  cabin: { label: 'Snowy cabin', build: cabin },
};

// Shared scaffolding: a room object with helpers for boxes, colliders and lights.
function base(name, hw, hd, q) {
  const group = new THREE.Group();
  group.name = name;
  const R = {
    name, group, hw, hd, q, colliders: [], occluders: [], areas: [], floor: 'wood', bed: null, spawn: { x: -1.5, z: 0.8 },
    lights: [], updaters: [], timeHooks: [], outdoor: false, background: new THREE.Color(0x1a1714),
    // surface underfoot: the last matching area wins, else the room's floor
    surface(x, z) { for (let i = this.areas.length - 1; i >= 0; i--) { const a = this.areas[i]; if (x > a.x0 && x < a.x1 && z > a.z0 && z < a.z1) return a.kind; } return this.floor; },
    update(dt, t) { for (const u of this.updaters) u(dt, t); },
    setTime(time) { for (const h of this.timeHooks) h(time); },
    dispose() {
      group.traverse(o => { o.geometry?.dispose(); const m = o.material; (Array.isArray(m) ? m : m ? [m] : []).forEach(x => x.dispose()); });
    },
  };
  R.box = (w, h, d, mat, x, y, z, { round = 0, cast = true, receive = true, parent = group, laser = true } = {}) => {
    const geo = round ? new RoundedBoxGeometry(w, h, d, 3, round) : new THREE.BoxGeometry(w, h, d);
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z); m.castShadow = cast; m.receiveShadow = receive; m.userData.laser = laser;
    parent.add(m);
    return m;
  };
  // an obstacle Spot walks around; h > 0.5 also blocks his line of sight
  R.solid = (x0, z0, x1, z1, h = 0.8) => { R.colliders.push({ x0, z0, x1, z1 }); if (h > 0.5) R.occluders.push({ x0, z0, x1, z1, h }); };
  R.area = (kind, x0, z0, x1, z1) => R.areas.push({ kind, x0, z0, x1, z1 });
  return R;
}

const std = (o) => new THREE.MeshStandardMaterial(o);
const phys = (o) => new THREE.MeshPhysicalMaterial(o);
function texMat(t, extra = {}, repeat) {
  if (repeat) for (const m of [t.map, t.normalMap, t.roughnessMap]) if (m) { m.repeat.set(...repeat); }
  return std({ map: t.map, normalMap: t.normalMap, roughnessMap: t.roughnessMap, roughness: t.roughnessMap ? 1 : 0.85, ...extra });
}
// clone a texture set with its own repeat, so two meshes can tile the same canvas differently
function rep(t, x, y) {
  const c = (m) => { if (!m) return null; const n = m.clone(); n.repeat.set(x, y); n.needsUpdate = true; return n; };
  return { map: c(t.map), normalMap: c(t.normalMap), roughnessMap: c(t.roughnessMap) };
}

function floorPlane(R, w, d, mat) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat);
  m.rotation.x = -Math.PI / 2; m.receiveShadow = true; m.userData.laser = true; m.userData.floor = true;
  R.group.add(m);
  return m;
}

// A wall along x (side = 'back') or z ('left'/'right'), optionally with a window hole.
function wall(R, side, len, height, mat, hole = null, thick = 0.12) {
  const g = new THREE.Group();
  const seg = (a, b, y0, y1) => {
    if (b - a < 0.01 || y1 - y0 < 0.01) return;
    const m = R.box(b - a, y1 - y0, thick, mat, (a + b) / 2, (y0 + y1) / 2, 0, { parent: g });
    const t = m.material.map ? m.material : null;
    if (t) m.geometry.attributes.uv && scaleUV(m.geometry, (b - a) / 2.4, (y1 - y0) / 2.4);
  };
  if (!hole) seg(-len / 2, len / 2, 0, height);
  else {
    const { c, w, y0, y1 } = hole;
    seg(-len / 2, c - w / 2, 0, height); seg(c + w / 2, len / 2, 0, height);
    seg(c - w / 2, c + w / 2, 0, y0); seg(c - w / 2, c + w / 2, y1, height);
  }
  if (side === 'back') g.position.set(0, 0, -R.hd - thick / 2);
  if (side === 'left') { g.rotation.y = Math.PI / 2; g.position.set(-R.hw - thick / 2, 0, 0); }
  if (side === 'right') { g.rotation.y = -Math.PI / 2; g.position.set(R.hw + thick / 2, 0, 0); }
  R.group.add(g);
  return g;
}
function scaleUV(geo, sx, sy) { const uv = geo.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * sx, uv.getY(i) * sy); uv.needsUpdate = true; }

function skirting(R, color = 0xf1ece2) {
  const m = std({ color, roughness: 0.5 });
  R.box(R.hw * 2, 0.1, 0.02, m, 0, 0.05, -R.hd + 0.01, { cast: false });
  R.box(0.02, 0.1, R.hd * 2, m, -R.hw + 0.01, 0.05, 0, { cast: false });
  R.box(0.02, 0.1, R.hd * 2, m, R.hw - 0.01, 0.05, 0, { cast: false });
}

// A window in the back wall: frame, glass, a painted view behind it and the light coming through.
function backWindow(R, c, w, y0, y1, kind) {
  const frameMat = std({ color: 0xf4f0e6, roughness: 0.45 });
  const z = -R.hd;
  const t = 0.06;
  R.box(w + 0.12, t, 0.18, frameMat, c, y0 - t / 2, z + 0.04); // sill
  R.box(w + 0.08, t, 0.1, frameMat, c, y1 + t / 2, z);
  R.box(t, y1 - y0, 0.1, frameMat, c - w / 2 - t / 2, (y0 + y1) / 2, z);
  R.box(t, y1 - y0, 0.1, frameMat, c + w / 2 + t / 2, (y0 + y1) / 2, z);
  R.box(0.035, y1 - y0, 0.06, frameMat, c, (y0 + y1) / 2, z);
  R.box(w, 0.035, 0.06, frameMat, c, (y0 + y1) / 2, z);
  const glass = new THREE.Mesh(new THREE.PlaneGeometry(w, y1 - y0), phys({ color: 0xffffff, transparent: true, opacity: 0.08, roughness: 0.02, metalness: 0, envMapIntensity: 1.2 }));
  glass.position.set(c, (y0 + y1) / 2, z - 0.01); glass.userData.laser = false; glass.userData.noAO = true;
  R.group.add(glass);
  const view = new THREE.Mesh(new THREE.PlaneGeometry(w * 3.2, (y1 - y0) * 3.2), new THREE.MeshBasicMaterial({ toneMapped: false }));
  view.position.set(c, (y0 + y1) / 2 + 0.2, z - 1.4); view.userData.laser = false;
  R.group.add(view);
  R.timeHooks.push((time) => { view.material.map = T.windowView(kind, time); view.material.color.setScalar(time === 'night' ? 0.5 : time === 'evening' ? 1.0 : 1.7); view.material.needsUpdate = true; });
  return { c, w, y0, y1 };
}

// Curtains: wavy planes of fabric either side of the window
function curtains(R, c, w, top, color) {
  const geo = new THREE.PlaneGeometry(0.55, top, 24, 1);
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) p.setZ(i, 0.035 * Math.sin(p.getX(i) * 34));
  geo.computeVertexNormals();
  const fab = T.fabric({ tint: color, key: 'curtain' + color });
  const mat = std({ map: fab.map, normalMap: fab.normalMap, side: THREE.DoubleSide, roughness: 0.95 });
  for (const s of [-1, 1]) {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(c + s * (w / 2 + 0.3), top / 2 + 0.02, -R.hd + 0.12);
    m.castShadow = true; m.receiveShadow = true;
    R.group.add(m);
  }
  R.box(w + 1.4, 0.03, 0.03, std({ color: 0x2b2420, metalness: 0.6, roughness: 0.35 }), c, top + 0.04, -R.hd + 0.12);
}

// Fire: logs, layered flame sprites that flicker, embers and a warm light that breathes.
function fire(R, x, y, z, scale = 1) {
  const g = new THREE.Group(); g.position.set(x, y, z); R.group.add(g);
  const logMat = texMat(T.bark(), { roughness: 0.95 });
  for (const [a, dz] of [[0.3, -0.05], [-0.4, 0.05], [1.3, 0]]) {
    const l = new THREE.Mesh(new THREE.CylinderGeometry(0.05 * scale, 0.055 * scale, 0.5 * scale, 10), logMat);
    l.rotation.z = Math.PI / 2; l.rotation.y = a; l.position.set(0, 0.05 * scale + (a > 1 ? 0.07 : 0), dz); l.castShadow = true;
    g.add(l);
  }
  const ember = std({ color: 0x220800, emissive: 0xff5a10, emissiveIntensity: 1.8 });
  const bed = new THREE.Mesh(new THREE.CircleGeometry(0.28 * scale, 20), ember); bed.rotation.x = -Math.PI / 2; bed.position.y = 0.005; g.add(bed);
  // Flames: a few crossed planes with a scrolling-noise flame shader (added for the screensaver)
  const flameU = { uTime: { value: 0 } };
  const flameMat = new THREE.ShaderMaterial({
    uniforms: flameU, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false,
    vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform float uTime; varying vec2 vUv;
      float h(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float n(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(h(i), h(i + vec2(1, 0)), f.x), mix(h(i + vec2(0, 1)), h(i + vec2(1, 1)), f.x), f.y); }
      float fbm(vec2 p) { float s = 0.0, a = 0.5; for (int i = 0; i < 4; i++) { s += a * n(p); p *= 2.03; a *= 0.5; } return s; }
      void main() {
        vec2 uv = vUv; float t = uTime;
        float noise = fbm(vec2(uv.x * 3.0, uv.y * 2.2 - t * 1.6)) + 0.5 * fbm(vec2(uv.x * 6.0 + 3.0, uv.y * 4.0 - t * 2.7));
        float w = 0.42 * (1.0 - uv.y) * (1.0 - uv.y * 0.35) + 0.04;             // teardrop width by height
        float d = abs(uv.x - 0.5 + 0.06 * sin(uv.y * 6.0 - t * 4.0) * uv.y);
        float f = smoothstep(w, w * 0.25, d) * smoothstep(1.0, 0.25, uv.y + noise * 0.55 - 0.25) * smoothstep(0.0, 0.08, uv.y);
        vec3 c = mix(vec3(1.0, 0.18, 0.02), vec3(1.0, 0.62, 0.16), smoothstep(0.15, 0.7, f));
        c = mix(c, vec3(1.0, 0.93, 0.7), smoothstep(0.75, 1.0, f));
        gl_FragColor = vec4(c * f * 2.2, f);
      }`,
  });
  const flameGeo = new THREE.PlaneGeometry(0.62 * scale, 0.62 * scale).translate(0, 0.31 * scale + 0.04 * scale, 0);
  for (let i = 0; i < 3; i++) {
    const m = new THREE.Mesh(flameGeo, flameMat);
    m.rotation.y = (i / 3) * Math.PI; m.position.x = (i - 1) * 0.06 * scale;
    m.userData.laser = false; m.userData.noAO = true; m.renderOrder = 2;
    g.add(m);
  }
  // a soft glow behind the flames
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: T.glowSprite(), color: 0xff7a2a, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.35 }));
  halo.scale.set(0.9 * scale, 0.7 * scale, 1); halo.position.y = 0.25 * scale; halo.userData.laser = false; g.add(halo);
  const light = new THREE.PointLight(0xff8a3a, 3.2 * scale, 6, 1.8);
  light.position.set(0, 0.3 * scale, 0.05);
  light.castShadow = R.q.fireShadow; light.shadow.mapSize.set(512, 512); light.shadow.bias = -0.004;
  g.add(light);
  R.updaters.push((dt, t) => {
    const f = 0.75 + 0.25 * Math.sin(t * 13.1) * Math.sin(t * 7.3 + 1) + 0.1 * Math.sin(t * 29);
    light.intensity = 3.2 * scale * f;
    flameU.uTime.value = t;
    halo.material.opacity = 0.28 + 0.12 * f;
  });
  R.fire = g;
  return g;
}

function dogBed(R, x, z, color = 0x7b3b2a) {
  const fab = T.fabric({ tint: color, key: 'bed' + color });
  const mat = std({ map: fab.map, normalMap: fab.normalMap, roughness: 0.95 });
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.11, 14, 36), mat);
  rim.rotation.x = -Math.PI / 2; rim.position.set(x, 0.1, z); rim.scale.z = 0.8; rim.castShadow = rim.receiveShadow = true;
  const pad = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.44, 0.08, 32), std({ map: T.fabric({ tint: 0xd8cdb8, key: 'pad' }).map, roughness: 1 }));
  pad.position.set(x, 0.04, z); pad.receiveShadow = true;
  R.group.add(rim, pad);
  R.bed = { x, z, r: 0.5 };
  R.area('rug', x - 0.5, z - 0.5, x + 0.5, z + 0.5);
}

function rugMesh(R, x, z, w, d, t) {
  const m = new THREE.Mesh(new RoundedBoxGeometry(w, 0.014, d, 2, 0.006), texMat(t, { roughness: 1 }));
  m.position.set(x, 0.007, z); m.receiveShadow = true; m.userData.laser = true; m.userData.floor = true;
  R.group.add(m);
  // fringe at the short ends
  const n = Math.floor(d / 0.025), fr = new THREE.InstancedMesh(new THREE.BoxGeometry(0.07, 0.004, 0.006), std({ color: 0xece4d2, roughness: 1 }), n * 2);
  const o = new THREE.Object3D(); let k = 0;
  for (const s of [-1, 1]) for (let i = 0; i < n; i++) { o.position.set(x + s * (w / 2 + 0.033), 0.003, z - d / 2 + (i + 0.5) * (d / n)); o.rotation.y = (Math.random() - 0.5) * 0.3; o.updateMatrix(); fr.setMatrixAt(k++, o.matrix); }
  fr.userData.laser = false; R.group.add(fr);
  R.area('rug', x - w / 2, z - d / 2, x + w / 2, z + d / 2);
  return m;
}

function sofa(R, x0, x1, zBack, color) {
  const fab = T.fabric({ tint: color, key: 'sofa' + color });
  const mat = std({ map: fab.map, normalMap: fab.normalMap, roughness: 0.92 });
  const w = x1 - x0, cx = (x0 + x1) / 2, d = 0.92, zc = zBack + d / 2;
  R.box(w, 0.28, d, mat, cx, 0.24, zc, { round: 0.06 });                     // base
  R.box(w, 0.62, 0.24, mat, cx, 0.62, zBack + 0.12, { round: 0.08 });        // back
  for (const s of [-1, 1]) R.box(0.2, 0.32, d, mat, cx + s * (w / 2 - 0.1), 0.54, zc, { round: 0.08 }); // arms
  const n = 3, cw = (w - 0.4) / n;
  for (let i = 0; i < n; i++) {
    R.box(cw - 0.02, 0.14, d - 0.3, mat, x0 + 0.2 + cw * (i + 0.5), 0.45, zc + 0.08, { round: 0.06 });         // seat cushions
    R.box(cw - 0.06, 0.42, 0.16, mat, x0 + 0.2 + cw * (i + 0.5), 0.72, zBack + 0.3, { round: 0.07 }).rotation.x = -0.15; // back cushions
  }
  const legMat = std({ color: 0x2a1a10, roughness: 0.5 });
  for (const sx of [x0 + 0.08, x1 - 0.08]) for (const sz of [zBack + 0.08, zBack + d - 0.08]) R.box(0.05, 0.1, 0.05, legMat, sx, 0.05, sz);
  // a throw cushion in Spot's red
  R.box(0.38, 0.36, 0.12, std({ color: 0xa8242d, roughness: 0.9 }), x0 + 0.38, 0.66, zBack + 0.42, { round: 0.06 }).rotation.set(-0.3, 0.3, 0.1);
  R.solid(x0, zBack, x1, zBack + d, 0.9);
}

function lamp(R, x, z, h = 1.55) {
  const metal = std({ color: 0x1d1d1f, metalness: 0.8, roughness: 0.35 });
  R.box(0.28, 0.03, 0.28, metal, x, 0.015, z, { round: 0.01 });
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, h, 8), metal); pole.position.set(x, h / 2, z); pole.castShadow = true; R.group.add(pole);
  const shadeMat = std({ color: 0xf2e6cf, emissive: 0xffc985, emissiveIntensity: 0, side: THREE.DoubleSide, roughness: 1 });
  const shade = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.22, 0.26, 24, 1, true), shadeMat); shade.position.set(x, h, z); R.group.add(shade);
  const light = new THREE.PointLight(0xffc98a, 0, 7, 1.7); light.position.set(x, h - 0.05, z); light.castShadow = R.q.lampShadow; light.shadow.mapSize.set(512, 512); light.shadow.bias = -0.003;
  R.group.add(light);
  R.timeHooks.push(time => { const on = time !== 'day'; light.intensity = on ? (time === 'night' ? 9 : 8) : 0; shadeMat.emissiveIntensity = on ? 1.4 : 0; });
  R.solid(x - 0.15, z - 0.15, x + 0.15, z + 0.15, 0.2);
}

function bookshelf(R, x, z0, z1) {
  const wood = texMat(rep(T.planks({ key: 'shelf', light: 0x6e4a2e, dark: 0x3a2516, rows: 4 }), 0.5, 0.5), { roughness: 0.6 });
  const h = 1.9, d = 0.34, len = z1 - z0, zc = (z0 + z1) / 2, xc = x - d / 2;
  R.box(d, h, 0.03, wood, xc, h / 2, z0); R.box(d, h, 0.03, wood, xc, h / 2, z1);
  R.box(0.02, h, len, wood, x - 0.01, h / 2, zc);
  const shelves = 5;
  for (let i = 0; i <= shelves; i++) R.box(d, 0.03, len, wood, xc, 0.04 + i * (h - 0.08) / shelves, zc);
  // books
  const r = rng(77), colors = [0x7a2c2c, 0x2c4a6e, 0xc9b98f, 0x335c45, 0x1e1e24, 0xb36b2a, 0x6e5a8a, 0xe8e0cf];
  const count = 160, books = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), std({ roughness: 0.75 }), count);
  const o = new THREE.Object3D(), c = new THREE.Color(); let k = 0;
  for (let s = 0; s < shelves && k < count; s++) {
    let zz = z0 + 0.04;
    while (zz < z1 - 0.08 && k < count) {
      const bw = 0.025 + r() * 0.035, bh = 0.2 + r() * 0.12, bd = 0.2 + r() * 0.08;
      if (r() < 0.08) { zz += 0.08; continue; }
      o.position.set(xc + 0.02, 0.055 + s * (h - 0.08) / shelves + bh / 2, zz + bw / 2); o.scale.set(bd, bh, bw);
      o.rotation.set(r() < 0.06 ? 0.15 : 0, 0, 0); o.updateMatrix();
      books.setMatrixAt(k, o.matrix); books.setColorAt(k, c.setHex(colors[Math.floor(r() * colors.length)])); k++; zz += bw + 0.002;
    }
  }
  books.count = k; books.castShadow = true; books.receiveShadow = true; R.group.add(books);
  R.solid(x - d, z0, x, z1, h);
}

function plant(R, x, z, s = 1) {
  const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.2 * s, 0.15 * s, 0.38 * s, 20), std({ color: 0xb4643c, roughness: 0.8 }));
  pot.position.set(x, 0.19 * s, z); pot.castShadow = pot.receiveShadow = true; R.group.add(pot);
  const leafGeo = new THREE.SphereGeometry(1, 8, 6); leafGeo.scale(0.06, 0.012, 0.22); leafGeo.translate(0, 0, 0.2);
  const leafMat = std({ color: 0x2f6b34, roughness: 0.6, side: THREE.DoubleSide });
  const r = rng(Math.floor(x * 100 + z * 7) + 99), n = 26, leaves = new THREE.InstancedMesh(leafGeo, leafMat, n), o = new THREE.Object3D();
  for (let i = 0; i < n; i++) {
    o.position.set(x, (0.38 + 0.25 * r()) * s, z); o.rotation.set(-0.5 - r() * 0.8, r() * TAU, 0); o.scale.setScalar(s * (0.8 + r() * 0.6)); o.updateMatrix();
    leaves.setMatrixAt(i, o.matrix);
  }
  leaves.castShadow = true; R.group.add(leaves);
  R.solid(x - 0.22 * s, z - 0.22 * s, x + 0.22 * s, z + 0.22 * s, 0.9);
}

function frame(R, x, y, z, w, h, rotY = 0) {
  const tex = new THREE.TextureLoader().load(portraitUrl); tex.colorSpace = THREE.SRGBColorSpace;
  const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = rotY; R.group.add(g);
  R.box(w + 0.08, h + 0.08, 0.03, std({ color: 0x1b1410, roughness: 0.4, metalness: 0.1 }), 0, 0, 0, { parent: g });
  const pic = new THREE.Mesh(new THREE.PlaneGeometry(w, h), std({ map: tex, roughness: 0.35 }));
  pic.position.z = 0.017; g.add(pic);
}

function sun(R, q) {
  const s = new THREE.DirectionalLight(0xfff1dc, 3);
  s.castShadow = true;
  s.shadow.mapSize.set(q.shadowSize, q.shadowSize);
  const ext = Math.max(R.hw, R.hd) + 1.5;
  Object.assign(s.shadow.camera, { left: -ext, right: ext, top: ext, bottom: -ext, near: 0.5, far: 40 });
  s.shadow.bias = -0.0004; s.shadow.normalBias = 0.02; s.shadow.radius = q.shadowRadius;
  R.group.add(s, s.target);
  return s;
}

// ---------------------------------------------------------------- living room
function livingRoom(q) {
  const R = base('living', 3.6, 2.6, q);
  R.background.set(0x14110e);
  const oak = T.planks({});
  floorPlane(R, R.hw * 2, R.hd * 2, texMat(rep(oak, 3.6, 4.4)));
  const pl = T.plaster({ tint: 0xe7dccb });
  const wallMat = texMat(rep(pl, 1, 1), { roughness: 0.92 });
  const H = 2.7;
  const win = { c: -0.4, w: 1.6, y0: 0.9, y1: 2.25 };
  wall(R, 'back', R.hw * 2 + 0.24, H, wallMat, win);
  wall(R, 'left', R.hd * 2, H, wallMat);
  wall(R, 'right', R.hd * 2, H, wallMat);
  skirting(R);
  backWindow(R, win.c, win.w, win.y0, win.y1, 'garden');
  curtains(R, win.c, win.w, 2.4, 0x6b7f8e);

  // Fireplace on the left wall
  const st = T.stone({});
  const stoneMat = texMat(rep(st, 1, 1), { roughness: 0.9 });
  const fx = -R.hw, fz = -0.3, fw = 1.5, fh = 1.15, fd = 0.42;
  R.box(fd, fh, 0.36, stoneMat, fx + fd / 2, fh / 2, fz - fw / 2 + 0.18);
  R.box(fd, fh, 0.36, stoneMat, fx + fd / 2, fh / 2, fz + fw / 2 - 0.18);
  R.box(fd, 0.3, fw, stoneMat, fx + fd / 2, fh - 0.15, fz);
  R.box(0.02, fh, fw, std({ color: 0x0b0806, roughness: 1 }), fx + 0.03, fh / 2, fz);
  R.box(0.24, fh - 0.3, fw - 0.72, std({ color: 0x14100d, roughness: 1 }), fx + 0.12, (fh - 0.3) / 2, fz); // firebox back
  R.box(fd + 0.14, 0.09, fw + 0.2, texMat(rep(T.planks({ key: 'mantel', light: 0x7a4e2c, dark: 0x3d2414, rows: 2 }), 0.4, 0.3)), fx + fd / 2 + 0.04, fh + 0.045, fz);
  R.box(0.55, 0.05, fw + 0.4, stoneMat, fx + 0.42 + 0.2, 0.025, fz); // hearth slab
  R.area('stone', fx, fz - fw / 2 - 0.2, fx + 0.9, fz + fw / 2 + 0.2);
  fire(R, fx + 0.2, 0.0, fz, 1);
  R.solid(fx, fz - fw / 2, fx + fd + 0.1, fz + fw / 2, 1.1);
  // things on the mantel
  const brass = std({ color: 0xc9a24a, metalness: 1, roughness: 0.3 });
  for (const dz of [-0.55, 0.55]) { const c = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.04, 0.16, 16), brass); c.position.set(fx + 0.2, fh + 0.17, fz + dz); c.castShadow = true; R.group.add(c); }
  frame(R, fx + 0.07, fh + 0.62, fz, 0.52, 0.52, Math.PI / 2);

  rugMesh(R, 0.2, 0.25, 3.1, 2.1, T.rug({}));
  sofa(R, 1.0, 3.25, -R.hd, 0x50634f);
  lamp(R, 3.32, -2.25);
  bookshelf(R, R.hw, 0.4, 2.0);
  plant(R, -3.15, -2.2, 1.2);
  plant(R, 3.15, 2.25, 0.9);
  dogBed(R, -2.75, 1.65);
  R.spawn = { x: -1.6, z: 0.9 };

  const sunL = sun(R, q);
  const hemi = new THREE.HemisphereLight(0xdfe8f2, 0x5a4232, 0.6); R.group.add(hemi);
  R.timeHooks.push(time => {
    const S = { day: [0xfff0d8, 3.4, [-2.2, 4.8, -7]], evening: [0xffa860, 1.6, [-5, 1.9, -6]], night: [0x9fb4ff, 0.18, [1, 5, -6]] }[time];
    sunL.color.setHex(S[0]); sunL.intensity = S[1]; sunL.position.set(...S[2]); sunL.target.position.set(0, 0, 0);
    hemi.intensity = { day: 0.55, evening: 0.3, night: 0.26 }[time];
    R.exposure = { day: 1.0, evening: 1.1, night: 1.55 }[time];
  });
  R.cams = { room: { pos: [0, 4.3, 5.3], at: [0, 0, -0.2] } };
  return R;
}

// ---------------------------------------------------------------- garden
function garden(q) {
  const R = base('garden', 6, 4.5, q);
  R.outdoor = true; R.floor = 'grass';
  floorPlane(R, 40, 30, texMat(T.lawn(), { roughness: 1 })).position.z = 4;
  grassBlades(R, q.grass);

  // Patio and the back of the house
  const tl = T.tiles();
  const patio = new THREE.Mesh(new THREE.BoxGeometry(R.hw * 2, 0.012, 1.6), texMat(rep(tl, 3, 0.8)));
  patio.position.set(0, 0.006, -R.hd + 0.8); patio.receiveShadow = true; patio.userData.laser = true; patio.userData.floor = true; R.group.add(patio);
  R.area('stone', -R.hw, -R.hd, R.hw, -R.hd + 1.6);
  const brickish = texMat(rep(T.plaster({ tint: 0xd9ccb6, key: 'house' }), 3, 1.5), { roughness: 0.95 });
  const win = { c: 1.8, w: 1.6, y0: 0.9, y1: 2.2 };
  wall(R, 'back', R.hw * 2 + 6, 3.2, brickish, win, 0.3);
  const door = R.box(1.0, 2.1, 0.06, std({ color: 0x2c4a3e, roughness: 0.55 }), -1.6, 1.05, -R.hd - 0.01);
  door.userData.laser = true;
  const winGlass = new THREE.Mesh(new THREE.PlaneGeometry(win.w, win.y1 - win.y0), phys({ color: 0x223040, roughness: 0.05, metalness: 0.2, envMapIntensity: 1.5 }));
  winGlass.position.set(win.c, (win.y0 + win.y1) / 2, -R.hd - 0.1); R.group.add(winGlass);
  const glow = std({ color: 0x000000, emissive: 0xffc070, emissiveIntensity: 0 });
  const inside = new THREE.Mesh(new THREE.PlaneGeometry(win.w, win.y1 - win.y0), glow); inside.position.set(win.c, (win.y0 + win.y1) / 2, -R.hd - 0.25); R.group.add(inside);
  R.timeHooks.push(time => { glow.emissiveIntensity = time === 'night' ? 1.6 : time === 'evening' ? 0.8 : 0; winGlass.visible = time === 'day'; });

  // Fences left and right
  const fenceWood = texMat(rep(T.planks({ key: 'fence', light: 0x8a6a48, dark: 0x5a4028, rows: 6 }), 0.3, 1), { roughness: 0.9 });
  for (const s of [-1, 1]) {
    for (let z = -R.hd; z <= R.hd + 0.01; z += 0.16) R.box(0.025, 1.4, 0.13, fenceWood, s * (R.hw + 0.05), 0.7, z, { round: 0.005 });
    for (const y of [0.35, 1.1]) R.box(0.04, 0.08, R.hd * 2, fenceWood, s * (R.hw + 0.02), y, 0);
  }

  // Tree, flower bed, bench, bed
  tree(R, 3.9, 2.4);
  const soil = std({ color: 0x3b2a1c, roughness: 1 });
  R.box(0.8, 0.18, 3.2, soil, -R.hw + 0.45, 0.09, 0.6, { round: 0.03 });
  flowers(R, -R.hw + 0.45, 0.6, 0.7, 3.0);
  R.solid(-R.hw, -1, -R.hw + 0.85, 2.2, 0.4);
  const benchWood = texMat(rep(T.planks({ key: 'bench', light: 0x9b7552, dark: 0x5c4129, rows: 5 }), 0.5, 0.2), { roughness: 0.8 });
  R.box(1.6, 0.05, 0.42, benchWood, 3.6, 0.45, -R.hd + 0.55); R.box(1.6, 0.4, 0.05, benchWood, 3.6, 0.75, -R.hd + 0.33);
  for (const dx of [-0.7, 0.7]) R.box(0.06, 0.45, 0.4, std({ color: 0x222222, metalness: 0.7, roughness: 0.4 }), 3.6 + dx, 0.225, -R.hd + 0.55);
  R.solid(2.8, -R.hd + 0.3, 4.4, -R.hd + 0.78, 0.9);
  dogBed(R, -3.6, -R.hd + 0.8, 0x2f4e6e);
  R.spawn = { x: 0, z: 1.5 };

  // Sky and sun
  const sky = new Sky(); sky.scale.setScalar(400); sky.userData.laser = false; R.group.add(sky);
  const U = sky.material.uniforms; U.turbidity.value = 4; U.rayleigh.value = 1.4; U.mieCoefficient.value = 0.004; U.mieDirectionalG.value = 0.85;
  const sunL = sun(R, q);
  const hemi = new THREE.HemisphereLight(0xcfe3ff, 0x4a6a32, 0.8); R.group.add(hemi);
  R.sky = sky;
  R.timeHooks.push(time => {
    const elev = { day: 52, evening: 6, night: -8 }[time], az = { day: 150, evening: 250, night: 200 }[time];
    const sunDir = new THREE.Vector3().setFromSphericalCoords(1, THREE.MathUtils.degToRad(90 - elev), THREE.MathUtils.degToRad(az));
    U.sunPosition.value.copy(sunDir);
    sunL.position.copy(sunDir).multiplyScalar(14); sunL.target.position.set(0, 0, 0);
    sunL.color.setHex({ day: 0xfff2de, evening: 0xff9a50, night: 0x8aa4ff }[time]);
    sunL.intensity = { day: 3.6, evening: 1.8, night: 0.25 }[time];
    hemi.intensity = { day: 0.8, evening: 0.35, night: 0.12 }[time];
    R.exposure = { day: 0.75, evening: 0.95, night: 1.6 }[time];
    R.envFromSky = true;
  });
  R.cams = { room: { pos: [0, 5.4, 7.4], at: [0, 0, -0.4] } };
  return R;
}

// Instanced grass blades that sway in the wind (vertex shader); none on the Low preset.
function grassBlades(R, count) {
  if (!count) return;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute([-0.012, 0, 0, 0.012, 0, 0, 0, 0.16, 0], 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1, 0, 0, 1], 3));
  const mat = std({ color: 0x5a8a3a, roughness: 0.8, side: THREE.DoubleSide });
  const shader = { t: { value: 0 } };
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = shader.t;
    sh.vertexShader = 'uniform float uTime;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      vec4 ip = instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
      float sway = sin(uTime * 1.7 + ip.x * 0.9 + ip.z * 0.6) * 0.5 + sin(uTime * 3.1 + ip.x * 2.3) * 0.25;
      transformed.x += sway * 0.05 * position.y / 0.16;
      transformed.z += sway * 0.03 * position.y / 0.16;`);
  };
  const m = new THREE.InstancedMesh(geo, mat, count), o = new THREE.Object3D(), c = new THREE.Color(), r = rng(5);
  let k = 0;
  while (k < count) {
    const x = (r() * 2 - 1) * (R.hw + 4), z = -R.hd + 1.6 + r() * (R.hd * 2 + 6);
    if (x > -R.hw - 0.1 && x < -R.hw + 0.9 && z > -1 && z < 2.2) continue; // flower bed
    o.position.set(x, 0, z); o.rotation.set((r() - 0.5) * 0.4, r() * TAU, 0); o.scale.set(1, 0.6 + r() * 0.9, 1); o.updateMatrix();
    m.setMatrixAt(k, o.matrix); m.setColorAt(k, c.setHSL(0.24 + r() * 0.06, 0.45 + r() * 0.2, 0.25 + r() * 0.15)); k++;
  }
  m.receiveShadow = true; m.userData.laser = false;
  R.group.add(m);
  R.updaters.push((dt, t) => { shader.t.value = t; });
}

function tree(R, x, z) {
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.24, 2.6, 14), texMat(T.bark()));
  trunk.position.set(x, 1.3, z); trunk.castShadow = trunk.receiveShadow = true; trunk.userData.laser = true; R.group.add(trunk);
  const leafMat = std({ color: 0x3f6e2e, roughness: 1, vertexColors: true, side: THREE.DoubleSide });
  const r = rng(321);
  const crown = new THREE.Group(); crown.position.set(x, 2.9, z); R.group.add(crown);
  for (let i = 0; i < 9; i++) {
    const g = new THREE.IcosahedronGeometry(0.7 + r() * 0.4, 4);
    const p = g.attributes.position, col = [];
    for (let j = 0; j < p.count; j++) {
      const x = p.getX(j), y = p.getY(j), z = p.getZ(j), k = 1 + 0.12 * Math.sin(x * 9 + i) * Math.sin(y * 11) * Math.sin(z * 7) + 0.06 * (r() - 0.5);
      p.setXYZ(j, x * k, y * k, z * k);
      const shade = 0.75 + 0.35 * (y > 0 ? y : 0) + 0.15 * (r() - 0.5);
      col.push(0.85 * shade, 1.0 * shade, 0.7 * shade);
    }
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.computeVertexNormals();
    const m = new THREE.Mesh(g, leafMat); m.position.set((r() - 0.5) * 1.6, (r() - 0.3) * 1.1, (r() - 0.5) * 1.6);
    m.castShadow = true; m.receiveShadow = true; crown.add(m);
  }
  // leaf cards scattered over the crown, so its outline is leafy rather than faceted
  const blobs = crown.children.slice();
  blobs.forEach(b => b.scale.setScalar(0.88));
  const n = R.q.grass ? 2600 : 900;
  const leaves = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.16, 0.16), std({ map: T.leafCard(), alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.8 }), n);
  const o = new THREE.Object3D(), c = new THREE.Color(), dir = new THREE.Vector3();
  for (let i = 0; i < n; i++) {
    const b = blobs[i % blobs.length], rad = b.geometry.parameters.radius * 0.95;
    dir.set(r() * 2 - 1, r() * 1.6 - 0.5, r() * 2 - 1).normalize();
    o.position.copy(b.position).addScaledVector(dir, rad * (0.9 + r() * 0.25));
    o.rotation.set(r() * 6.28, r() * 6.28, r() * 6.28); o.scale.setScalar(0.7 + r() * 0.7); o.updateMatrix();
    leaves.setMatrixAt(i, o.matrix); leaves.setColorAt(i, c.setHSL(0.25 + r() * 0.06, 0.45, 0.28 + r() * 0.16));
  }
  leaves.castShadow = true; leaves.receiveShadow = true; leaves.userData.laser = false; crown.add(leaves);
  R.updaters.push((dt, t) => { crown.rotation.z = 0.015 * Math.sin(t * 0.9); crown.rotation.x = 0.01 * Math.sin(t * 0.7 + 1); });
  R.solid(x - 0.26, z - 0.26, x + 0.26, z + 0.26, 2.5);
}

function flowers(R, x, z, w, d) {
  const r = rng(44), n = 140, geo = new THREE.SphereGeometry(0.035, 8, 6), m = new THREE.InstancedMesh(geo, std({ roughness: 0.6 }), n);
  const stem = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.004, 0.004, 1, 4), std({ color: 0x2f5a24 }), n);
  const o = new THREE.Object3D(), c = new THREE.Color(), cols = [0xe23b4b, 0xf2c14e, 0xf7f3e8, 0x8a5ad8, 0xff8a3d];
  for (let i = 0; i < n; i++) {
    const px = x + (r() - 0.5) * w, pz = z + (r() - 0.5) * d, h = 0.25 + r() * 0.3;
    o.position.set(px, 0.18 + h, pz); o.scale.setScalar(0.8 + r() * 0.6); o.rotation.set(0, 0, 0); o.updateMatrix(); m.setMatrixAt(i, o.matrix); m.setColorAt(i, c.setHex(cols[Math.floor(r() * cols.length)]));
    o.position.set(px, 0.18 + h / 2, pz); o.scale.set(1, h, 1); o.updateMatrix(); stem.setMatrixAt(i, o.matrix);
  }
  m.castShadow = true; R.group.add(m, stem);
}

// ---------------------------------------------------------------- cabin
function cabin(q) {
  const R = base('cabin', 3.3, 2.6, q);
  R.background.set(0x0e0c0b);
  floorPlane(R, R.hw * 2, R.hd * 2, texMat(rep(T.planks({ key: 'pine', light: 0xb07a48, dark: 0x5e3a1e, rows: 7, seed: 31 }), 3.2, 3.6)));
  const lg = texMat(rep(T.logs(), 1.4, 1.2), { roughness: 0.85 });
  const H = 2.6, win = { c: -0.2, w: 1.3, y0: 0.95, y1: 2.0 };
  wall(R, 'back', R.hw * 2 + 0.3, H, lg, win, 0.15);
  wall(R, 'left', R.hd * 2, H, lg, null, 0.15);
  wall(R, 'right', R.hd * 2, H, lg, null, 0.15);
  backWindow(R, win.c, win.w, win.y0, win.y1, 'cabin');
  curtains(R, win.c, win.w, 2.2, 0x8a2a2a);
  snowfall(R, win);

  // Big stone fireplace with a chimney breast
  const stoneMat = texMat(rep(T.stone({ key: 'cabinstone', a: 0x9a9184, b: 0x5d564d, seed: 9 }), 1, 1.6), { roughness: 0.9 });
  const fx = -R.hw, fz = -0.2, fw = 1.7, fd = 0.5;
  R.box(fd, H, 0.45, stoneMat, fx + fd / 2, H / 2, fz - fw / 2 + 0.22);
  R.box(fd, H, 0.45, stoneMat, fx + fd / 2, H / 2, fz + fw / 2 - 0.22);
  R.box(fd, H - 1.0, fw, stoneMat, fx + fd / 2, 1.0 + (H - 1.0) / 2, fz);
  R.box(0.3, 1.0, fw - 0.9, std({ color: 0x120e0b, roughness: 1 }), fx + 0.15, 0.5, fz);
  R.box(fd + 0.2, 0.1, fw + 0.2, texMat(rep(T.planks({ key: 'mantel2', light: 0x6a4024, dark: 0x2e1a0c, rows: 2 }), 0.4, 0.3)), fx + fd / 2 + 0.05, 1.05, fz);
  R.box(0.6, 0.06, fw + 0.5, stoneMat, fx + 0.5 + 0.25, 0.03, fz);
  R.area('stone', fx, fz - fw / 2 - 0.25, fx + 1.05, fz + fw / 2 + 0.25);
  fire(R, fx + 0.24, 0, fz, 1.15);
  R.solid(fx, fz - fw / 2, fx + fd + 0.12, fz + fw / 2, 2);
  frame(R, fx + fd + 0.02, 1.6, fz, 0.48, 0.48, Math.PI / 2);

  rugMesh(R, 0.1, 0.4, 2.6, 1.8, T.rug({ key: 'cabinrug', field: 0x2f5a3a, border: 0x7a1f22, accent: 0xe8d9b0, seed: 8 }));
  christmasTree(R, 2.45, -1.75);
  rockingChair(R, 2.4, 1.3);
  dogBed(R, -2.35, 1.6, 0x8a2a2a);
  R.spawn = { x: -1, z: 1 };

  const moon = sun(R, q);
  const hemi = new THREE.HemisphereLight(0xc8d6ff, 0x3a2a1e, 0.3); R.group.add(hemi);
  R.timeHooks.push(time => {
    const S = { day: [0xe8f0ff, 2.2, [-1.5, 4, -7]], evening: [0xffb27a, 0.9, [-4, 1.6, -6]], night: [0x8fa6ff, 0.15, [1, 5, -6]] }[time];
    moon.color.setHex(S[0]); moon.intensity = S[1]; moon.position.set(...S[2]); moon.target.position.set(0, 0, 0);
    hemi.intensity = { day: 0.35, evening: 0.18, night: 0.1 }[time];
    R.exposure = { day: 1.05, evening: 1.2, night: 1.6 }[time];
  });
  R.cams = { room: { pos: [0, 4.1, 5.1], at: [0, 0, -0.2] } };
  return R;
}

function christmasTree(R, x, z) {
  const needles = std({ color: 0x1f4a2c, roughness: 0.9, flatShading: true });
  const tree = new THREE.Group(); tree.position.set(x, 0, z); R.group.add(tree);
  const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.18, 0.3, 18), std({ color: 0x8a2a2a, roughness: 0.6 })); pot.position.y = 0.15; tree.add(pot);
  const r = rng(12);
  for (let i = 0; i < 5; i++) {
    const rad = 0.75 - i * 0.13, h = 0.7 - i * 0.06, y = 0.45 + i * 0.36;
    const g = new THREE.ConeGeometry(rad, h, 20, 3, true);
    const p = g.attributes.position;
    for (let j = 0; j < p.count; j++) { const k = 1 + 0.14 * (r() - 0.5); p.setX(j, p.getX(j) * k); p.setZ(j, p.getZ(j) * k); }
    g.computeVertexNormals();
    const m = new THREE.Mesh(g, needles); m.position.y = y + h / 2; m.castShadow = true; m.receiveShadow = true; m.userData.laser = true; tree.add(m);
  }
  const star = new THREE.Mesh(new THREE.OctahedronGeometry(0.09), std({ color: 0xffe28a, emissive: 0xffd060, emissiveIntensity: 3 })); star.position.y = 2.45; tree.add(star);
  // fairy lights in a spiral, twinkling
  const n = 120, bulbs = new THREE.InstancedMesh(new THREE.SphereGeometry(0.018, 8, 6), new THREE.MeshBasicMaterial({ toneMapped: false }), n);
  const o = new THREE.Object3D(), base = [], c = new THREE.Color(), cols = [0xffc870, 0xff5050, 0x60a0ff, 0x70ff90, 0xffe0a0];
  for (let i = 0; i < n; i++) {
    const t = i / n, y = 0.5 + t * 1.85, rad = (0.72 - t * 0.62) + 0.02, a = t * TAU * 7;
    o.position.set(Math.cos(a) * rad, y, Math.sin(a) * rad); o.updateMatrix(); bulbs.setMatrixAt(i, o.matrix);
    base.push(new THREE.Color(cols[i % cols.length]).multiplyScalar(3));
  }
  bulbs.userData.laser = false; tree.add(bulbs);
  const glow = new THREE.PointLight(0xffb070, 1.2, 3, 2); glow.position.set(0, 1.2, 0.4); tree.add(glow);
  R.updaters.push((dt, t) => {
    for (let i = 0; i < n; i++) bulbs.setColorAt(i, c.copy(base[i]).multiplyScalar(0.35 + 0.65 * (0.5 + 0.5 * Math.sin(t * (1.3 + (i % 7) * 0.4) + i))));
    bulbs.instanceColor.needsUpdate = true;
  });
  // presents
  const wrap = [[0xb3202a, 0xf2d06b], [0x2a5a8a, 0xffffff], [0x2f6a3a, 0xd23a3a], [0xf2efe6, 0xb3202a]];
  [[-0.55, 0.35, 0.34], [0.1, 0.62, 0.28], [0.55, 0.3, 0.3], [-0.2, 0.75, 0.22]].forEach(([dx, dz, s], i) => {
    const [a, b] = wrap[i];
    const bx = R.box(s, s * 0.8, s, std({ color: a, roughness: 0.55 }), x + dx, s * 0.4, z + dz, { round: 0.01 });
    R.box(s * 1.02, s * 0.82, 0.04, std({ color: b, roughness: 0.4 }), x + dx, s * 0.4, z + dz);
    R.box(0.04, s * 0.82, s * 1.02, std({ color: b, roughness: 0.4 }), x + dx, s * 0.4, z + dz);
    bx.rotation.y = i * 0.4;
  });
  R.solid(x - 0.8, z - 0.8, x + 0.8, z + 1.0, 2.4);
}

function rockingChair(R, x, z) {
  const wood = std({ color: 0x6a4024, roughness: 0.55 });
  const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = -2.2; R.group.add(g);
  const seat = R.box(0.5, 0.05, 0.48, wood, 0, 0.45, 0, { parent: g });
  for (let i = 0; i < 5; i++) R.box(0.05, 0.6, 0.03, wood, -0.2 + i * 0.1, 0.78, -0.22, { parent: g });
  R.box(0.55, 0.06, 0.05, wood, 0, 1.1, -0.22, { parent: g });
  for (const s of [-1, 1]) {
    const rg = new THREE.BoxGeometry(0.035, 0.03, 0.9, 1, 1, 18), rp = rg.attributes.position;
    for (let j = 0; j < rp.count; j++) rp.setY(j, rp.getY(j) + rp.getZ(j) * rp.getZ(j) * 0.45);
    rg.computeVertexNormals();
    const rocker = new THREE.Mesh(rg, wood); rocker.position.set(s * 0.22, 0.02, 0.02); rocker.castShadow = true; g.add(rocker);
    for (const dz of [-0.2, 0.2]) R.box(0.04, 0.42, 0.04, wood, s * 0.22, 0.24, dz, { parent: g });
  }
  const plaid = T.fabric({ tint: 0x9a3030, key: 'plaid' });
  R.box(0.5, 0.04, 0.6, std({ map: plaid.map, roughness: 1 }), 0, 0.5, 0.05, { parent: g, round: 0.015 }).rotation.x = 0.2;
  seat.userData.laser = true;
  R.updaters.push((dt, t) => { g.rotation.x = 0.04 * Math.sin(t * 1.1); });
  R.solid(x - 0.45, z - 0.45, x + 0.45, z + 0.45, 1.1);
}

// Snow falling outside the window (and only there)
function snowfall(R, win) {
  const n = 500, geo = new THREE.BufferGeometry(), pos = new Float32Array(n * 3), r = rng(3);
  for (let i = 0; i < n; i++) { pos[i * 3] = win.c + (r() - 0.5) * 4; pos[i * 3 + 1] = r() * 3.5; pos[i * 3 + 2] = -R.hd - 0.3 - r() * 1.0; }
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const pts = new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xffffff, size: 0.03, map: T.glowSprite(), transparent: true, depthWrite: false }));
  pts.userData.laser = false; R.group.add(pts);
  R.updaters.push((dt, t) => {
    for (let i = 0; i < n; i++) { let y = pos[i * 3 + 1] - dt * (0.35 + (i % 5) * 0.06); if (y < 0) y += 3.5; pos[i * 3 + 1] = y; pos[i * 3] += Math.sin(t + i) * dt * 0.05; }
    geo.attributes.position.needsUpdate = true;
  });
}

// ---------------------------------------------------------------- weather (garden)
export function weather(R, kind) {
  if (R.weatherPts) { R.group.remove(R.weatherPts); R.weatherPts.geometry.dispose(); R.weatherPts = null; R.updaters = R.updaters.filter(u => !u.weather); }
  R.wet = kind === 'rain';
  if (!R.outdoor || kind === 'clear') return;
  const n = kind === 'rain' ? 2600 : 1600, geo = new THREE.BufferGeometry(), pos = new Float32Array(n * 3), r = rng(9);
  for (let i = 0; i < n; i++) { pos[i * 3] = (r() * 2 - 1) * (R.hw + 2); pos[i * 3 + 1] = r() * 6; pos[i * 3 + 2] = (r() * 2 - 1) * (R.hd + 2); }
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const mat = new THREE.PointsMaterial({ color: kind === 'rain' ? 0xaabbd0 : 0xffffff, size: kind === 'rain' ? 0.025 : 0.05, map: T.glowSprite(), transparent: true, opacity: kind === 'rain' ? 0.55 : 0.9, depthWrite: false });
  const pts = new THREE.Points(geo, mat); pts.userData.laser = false; R.group.add(pts); R.weatherPts = pts;
  const v = kind === 'rain' ? 7 : 0.6;
  const up = (dt, t) => {
    for (let i = 0; i < n; i++) { let y = pos[i * 3 + 1] - dt * v * (0.8 + (i % 4) * 0.1); if (y < 0) y += 6; pos[i * 3 + 1] = y; if (kind === 'snow') pos[i * 3] += Math.sin(t * 0.8 + i) * dt * 0.15; }
    geo.attributes.position.needsUpdate = true;
  };
  up.weather = true; R.updaters.push(up);
}

// ---------------------------------------------------------------- the world interface for brain.js
export function worldOf(R) {
  const seg = (ax, az, bx, bz, o) => { // does segment a-b cross box o (in x/z)?
    let t0 = 0, t1 = 1; const dx = bx - ax, dz = bz - az;
    for (const [p, d, lo, hi] of [[ax, dx, o.x0, o.x1], [az, dz, o.z0, o.z1]]) {
      if (Math.abs(d) < 1e-9) { if (p < lo || p > hi) return false; continue; }
      let a = (lo - p) / d, b = (hi - p) / d; if (a > b) [a, b] = [b, a];
      t0 = Math.max(t0, a); t1 = Math.min(t1, b); if (t0 > t1) return false;
    }
    return true;
  };
  const pushOut = (s, r) => {
    for (const o of R.colliders) {
      const cx = clamp(s.x, o.x0, o.x1), cz = clamp(s.z, o.z0, o.z1), dx = s.x - cx, dz = s.z - cz, d = Math.hypot(dx, dz);
      if (d < r) {
        if (d > 1e-6) { s.x = cx + dx / d * r; s.z = cz + dz / d * r; const nx = dx / d, nz = dz / d, vn = s.vx * nx + s.vz * nz; if (vn < 0) { s.vx -= vn * nx; s.vz -= vn * nz; } }
        else { // inside: leave by the nearest side
          const opts = [[o.x0 - r - s.x, 0], [o.x1 + r - s.x, 0], [0, o.z0 - r - s.z], [0, o.z1 + r - s.z]].sort((a, b) => Math.hypot(...a) - Math.hypot(...b));
          s.x += opts[0][0]; s.z += opts[0][1];
        }
      }
    }
  };
  return {
    collide(s, r) { s.x = clamp(s.x, -R.hw + r, R.hw - r); s.z = clamp(s.z, -R.hd + r, R.hd - r); pushOut(s, r); },
    surface: (x, z) => R.wet && R.surface(x, z) === 'stone' ? 'tile' : R.surface(x, z),
    sees(ax, az, bx, by, bz) {
      const eye = 0.55;
      for (const o of R.occluders) {
        if (o.h < Math.min(eye, by) + 0.05) continue;
        if (bx > o.x0 && bx < o.x1 && bz > o.z0 && bz < o.z1) continue; // the dot is on this thing
        if (seg(ax, az, bx, bz, o)) return false;
      }
      return true;
    },
    clampWalk(p) {
      const q = { x: p.x, z: p.z, vx: 0, vz: 0 };
      for (let i = 0; i < 3; i++) { q.x = clamp(q.x, -R.hw + 0.35, R.hw - 0.35); q.z = clamp(q.z, -R.hd + 0.35, R.hd - 0.35); pushOut(q, 0.3); }
      q.x = clamp(q.x, -R.hw + 0.35, R.hw - 0.35); q.z = clamp(q.z, -R.hd + 0.35, R.hd - 0.35);
      return q;
    },
    get bed() { return R.bed; },
  };
}
