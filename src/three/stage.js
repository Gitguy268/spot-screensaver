// The 3D screensaver: renderer, the snowy cabin where Spot naps by the fire, the dream garden,
// camera shots, and the post-processing that turns the cut into the dream into a soft dissolve.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { BokehPass } from 'three/addons/postprocessing/BokehPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { ROOMS } from './lib/rooms.js';
import { setTextureSize } from './lib/textures.js';
import { loadNapper } from './napper.js';
import { createDream } from './dream.js';

const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const smooth = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));

// maxPixels caps the drawing buffer (a 5K display at full density would be 14.7 MP)
export const QUALITY = {
  low: { maxPixels: 1.0e6, fur: 0, coat: 0, shadowSize: 1024, shadowRadius: 3, aa: 0, bloom: false, bokeh: false, grass: 0, tex: 512, fireShadow: false, lampShadow: false, gtao: false },
  medium: { maxPixels: 2.3e6, fur: 8, coat: 6, shadowSize: 2048, shadowRadius: 4, aa: 4, bloom: true, bokeh: true, grass: 26000, tex: 1024, fireShadow: false, lampShadow: false, gtao: false },
  high: { maxPixels: 4.2e6, fur: 14, coat: 12, shadowSize: 2048, shadowRadius: 5, aa: 4, bloom: true, bokeh: true, grass: 60000, tex: 1024, fireShadow: true, lampShadow: false, gtao: false },
};

// Grade, vignette, grain, the dream glow and the veil between the worlds (runs after tone mapping)
const DreamShader = {
  uniforms: { tDiffuse: { value: null }, veil: { value: 0 }, dream: { value: 0 }, dip: { value: 0 }, time: { value: 0 }, resolution: { value: new THREE.Vector2(1, 1) } },
  vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform float veil, dream, dip, time; uniform vec2 resolution; varying vec2 vUv;
    float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    vec3 soft(vec2 uv, float r) {
      vec2 px = vec2(r) / resolution * (resolution.y / 900.0);
      vec3 s = vec3(0.0);
      for (int i = 0; i < 8; i++) { float a = float(i) * 0.785398 + 0.3; float k = mod(float(i), 2.0) + 1.0; s += texture2D(tDiffuse, uv + vec2(cos(a), sin(a)) * px * k).rgb; }
      return s / 8.0;
    }
    void main() {
      vec3 c = texture2D(tDiffuse, vUv).rgb;
      float glow = max(dream * 0.3, veil);
      if (glow > 0.001) {
        vec3 b = soft(vUv, 6.0 + 40.0 * veil);
        c = mix(c, max(c, b), glow);             // Orton-style dreamy glow
      }
      if (dream > 0.0) {
        float l = dot(c, vec3(0.299, 0.587, 0.114));
        vec3 g = mix(vec3(l), c, 0.92) * vec3(1.05, 1.0, 0.9) * 0.96 + vec3(0.03, 0.022, 0.012);
        c = mix(c, g, dream);
      }
      c = mix(c, vec3(1.0, 0.93, 0.82), veil * 0.82);
      vec2 q = vUv - 0.5;
      float r = length(q * vec2(resolution.x / resolution.y, 1.0));
      float vig = smoothstep(0.95, 0.2, r * mix(0.9, 1.1, dream));
      c *= mix(mix(0.72, 0.86, dream), 1.0, vig);
      c *= 1.0 - dip;
      c += (hash(vUv * resolution + fract(time) * 91.0) - 0.5) * 0.022;
      gl_FragColor = vec4(c, 1.0);
    }`,
};

// Room shots in Spot's own frame (he faces +z): camera, look-at, field of view, drift per shot
export const SHOTS = {
  portrait: { cam: [0.22, 0.64, 1.05], at: [-0.01, 0.6, 0.08], fov: 30, drift: [-0.25, 0.02, -0.1] },
  hearth: { cam: [1.15, 0.85, 1.7], at: [-0.05, 0.42, 0], fov: 36, drift: [-0.3, 0.05, 0.1] },
  low: { cam: [0.85, 0.32, 2.3], at: [-0.45, 0.5, -0.75], fov: 34, drift: [0.35, 0, -0.2] },
  dream: { cam: [0.14, 0.64, 0.98], at: [-0.015, 0.58, 0.1], fov: 28, drift: [-0.08, -0.03, -0.22] },
  wide: { cam: [2.4, 1.45, 2.6], at: [-0.4, 0.45, -0.3], fov: 40, drift: [-0.4, -0.1, 0] },
};
const PLAN = { nap: ['hearth', 'portrait', 'low'], dream: ['dream'], wake: ['portrait', 'wide'] };
const DIP = 0.7; // seconds of the dip to dark around a cut
const DREAM_SHOT = 11; // seconds per camera in the dream

export async function createStage3D({ canvas, quality = 'high', preview = false }) {
  const q = QUALITY[quality] ?? QUALITY.high;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  setTextureSize(q.tex);

  const camera = new THREE.PerspectiveCamera(34, 1, 0.03, 600);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const roomEnv = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

  // ---- the cabin at night, fire lit
  const room = ROOMS.cabin.build(q);
  room.setTime('night');
  const roomScene = new THREE.Scene();
  roomScene.add(room.group);
  roomScene.background = room.background;
  roomScene.environment = roomEnv;
  roomScene.environmentIntensity = 0.08;
  const spot = await loadNapper({ furLayers: q.coat });
  spot.group.position.set(-1.85, 0, 0.55);
  spot.group.rotation.y = 0.75;
  roomScene.add(spot.group);
  // a warm bounce from the fire on his face, so a black dog still reads at night
  const bounce = new THREE.PointLight(0xffa860, 1.6, 2.4, 2);
  bounce.position.set(0.35, 0.32, 0.95); // in his frame: low in front, like firelight off the floor
  spot.group.add(bounce);

  // ---- the dream
  const dream = createDream(q);
  const skyScene = new THREE.Scene(); skyScene.add(dream.room.sky.clone());
  dream.scene.environment = pmrem.fromScene(skyScene).texture;
  dream.scene.environmentIntensity = 0.3;

  // ---- post
  let composer;
  const P = {};
  function buildComposer() {
    const size = renderer.getDrawingBufferSize(new THREE.Vector2());
    const rt = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: q.aa });
    composer = new EffectComposer(renderer, rt);
    P.render = new RenderPass(roomScene, camera);
    composer.addPass(P.render);
    if (q.bokeh) { P.bokeh = new BokehPass(roomScene, camera, { focus: 1, aperture: 0.004, maxblur: 0.01 }); composer.addPass(P.bokeh); }
    if (q.bloom) { P.bloom = new UnrealBloomPass(new THREE.Vector2(size.x, size.y), 0.4, 0.5, 1.6); composer.addPass(P.bloom); }
    composer.addPass(new OutputPass());
    P.dream = new ShaderPass(DreamShader);
    composer.addPass(P.dream);
  }

  function resize() {
    const w = canvas.clientWidth || innerWidth, h = canvas.clientHeight || innerHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, 2, Math.sqrt((preview ? 0.3e6 : q.maxPixels) / (w * h)));
    renderer.setPixelRatio(Math.max(0.5, dpr));
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    if (!composer) buildComposer(); else composer.setSize(w, h);
    const db = renderer.getDrawingBufferSize(new THREE.Vector2());
    P.dream.uniforms.resolution.value.set(db.x, db.y);
  }
  resize();

  // ---- cameras
  const camPos = new THREE.Vector3(), camAt = new THREE.Vector3(), v = new THREE.Vector3(), head = new THREE.Vector3(), preyPos = new THREE.Vector3();
  let currentWorld = null, lastShot = null, dreamCam = null, dreamSide = 1, camHeading = 0, snap = true;
  const local = (arr, out) => out.set(arr[0], arr[1], arr[2]).applyMatrix4(spot.group.matrixWorld);

  function roomCamera(f, dt) {
    const plan = PLAN[f.phase] || PLAN.nap;
    const len = f.dur / plan.length, i = Math.min(plan.length - 1, Math.floor(f.t / len)), k = (f.t - i * len) / len;
    const name = plan[i], shot = SHOTS[name];
    // dip to dark across each cut inside a phase (cuts between phases hide in the veil)
    const since = f.t - i * len, until = (i + 1) * len - f.t;
    P.dream.uniforms.dip.value = Math.max(i > 0 ? 1 - smooth(since / DIP) : 0, i < plan.length - 1 ? 1 - smooth(until / DIP) : 0);
    spot.group.updateMatrixWorld(true);
    const e = k - 0.5;
    local([shot.cam[0] + shot.drift[0] * e, shot.cam[1] + shot.drift[1] * e, shot.cam[2] + shot.drift[2] * e], camPos);
    local(shot.at, camAt);
    if (name !== lastShot || snap) { camera.position.copy(camPos); lastShot = name; }
    camera.position.lerp(camPos, 1 - Math.exp(-6 * dt));
    camera.fov = shot.fov;
    camera.lookAt(camAt);
    return spot.headWorld(head);
  }

  function dreamCamera(f, dt) {
    const s = dream.spot;
    dream.preyPosition(preyPos);
    const slot = Math.floor(f.t / DREAM_SHOT) % 2;
    const want = slot ? 'lead' : 'side';
    camHeading = snap ? s.heading : camHeading + Math.atan2(Math.sin(s.heading - camHeading), Math.cos(s.heading - camHeading)) * (1 - Math.exp(-1.2 * dt));
    const fx = Math.sin(camHeading), fz = Math.cos(camHeading);
    // pick the side of him that keeps the camera inside the garden, once per shot
    if (want !== dreamCam || snap) {
      const fit = (k) => { const x = s.x + k * fz * 4.4, z = s.z - k * fx * 4.4; return Math.max(-4.3 - x, x - 5.5, 0) + Math.max(-2.8 - z, z - 7, 0); };
      dreamSide = fit(1) <= fit(-1) ? 1 : -1;
    }
    const k = dreamSide;
    if (want === 'side') v.set(s.x + k * fz * 4.4 - fx * 1.2, 0.55, s.z - k * fx * 4.4 - fz * 1.2);
    else v.set(s.x + fx * 4.8 + k * fz * 0.8, 0.32, s.z + fz * 4.8 - k * fx * 0.8);
    v.x = clamp(v.x, -4.3, 5.5); v.z = clamp(v.z, -2.8, 7); // clear of the flower bed and the fences
    if (want !== dreamCam || snap) { camera.position.copy(v); dreamCam = want; }
    camera.position.lerp(v, 1 - Math.exp(-6 * dt));
    camera.position.y = v.y;
    head.set(s.x, 0.42 + s.hop, s.z);
    camAt.lerpVectors(head, preyPos, 0.3).setY(0.35 + 0.3 * s.hop);
    camera.fov = want === 'side' ? 30 : 26;
    camera.lookAt(camAt);
    const cut = f.t % DREAM_SHOT;
    P.dream.uniforms.dip.value = f.t > DREAM_SHOT ? Math.max(0, 1 - smooth(cut / DIP)) * (1 - f.veil) : 0;
    const next = DREAM_SHOT - cut;
    if (f.dur - f.t > DREAM_SHOT * 0.5) P.dream.uniforms.dip.value = Math.max(P.dream.uniforms.dip.value, (1 - smooth(next / DIP)) * (1 - f.veil));
    return head;
  }

  function setWorld(w, f) {
    currentWorld = w;
    const scn = w === 'dream' ? dream.scene : roomScene;
    P.render.scene = scn;
    if (P.bokeh) P.bokeh.scene = scn;
    renderer.toneMappingExposure = w === 'dream' ? (dream.room.exposure ?? 0.75) * 1.1 : room.exposure ?? 1.6;
    if (w === 'dream') dream.start(f.prey, f.cycle);
    snap = true;
  }

  let time = 0;
  function update(dt, f) {
    time += dt;
    if (f.world !== currentWorld) setWorld(f.world, f);
    const inDream = currentWorld === 'dream';
    let target;
    if (inDream) { dream.step(dt); target = dreamCamera(f, dt); }
    else { room.update(dt, time); spot.update(dt, f); target = roomCamera(f, dt); }
    snap = false;
    camera.updateProjectionMatrix();
    const veil = f.veil;
    if (P.bokeh) {
      P.bokeh.uniforms.focus.value = camera.position.distanceTo(target);
      P.bokeh.uniforms.aperture.value = (inDream ? 0.012 : 0.009) + veil * 0.02;
      P.bokeh.uniforms.maxblur.value = (inDream ? 0.012 : 0.008) + veil * 0.025;
    }
    if (P.bloom) {
      // the dream sky is far brighter than the room in HDR; bloom there only while the veil is up
      P.bloom.enabled = !inDream || veil > 0.02;
      P.bloom.strength = (inDream ? 0.28 : 0.35) + veil * 1.2;
      P.bloom.threshold = inDream ? 2.2 : 1.6;
      P.bloom.radius = 0.5;
    }
    P.dream.uniforms.veil.value = veil;
    P.dream.uniforms.dream.value = inDream ? 1 : 0;
    P.dream.uniforms.time.value = time;
    composer.render(dt);
  }

  return {
    update, resize, renderer, camera, spot, passes: P, dream,
    info: () => ({ world: currentWorld, calls: renderer.info.render.calls, triangles: renderer.info.render.triangles, pixels: renderer.getDrawingBufferSize(new THREE.Vector2()).toArray(), lidsHit: spot.lids.map((l) => l.hit) }),
    dispose() { composer?.dispose(); room.dispose(); dream.dispose(); renderer.dispose(); },
  };
}
