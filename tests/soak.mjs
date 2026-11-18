// Soak test: runs the 3D screensaver for MINUTES (default 10) at 2560x1440 on the real GPU and
// samples the JS heap and the renderer's GPU object counts once a minute; fails if they keep growing.
import { chromium } from 'playwright';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const minutes = +(process.env.MINUTES || 10), style = process.env.STYLE || '3d';
const browser = await chromium.launch({ args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--enable-precise-memory-info'] });
const page = await browser.newPage({ viewport: { width: 2560, height: 1440 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(pathToFileURL(join(root, 'index.html')).href + `?style=${style}&quality=high&saver=1&speed=4&seed=9`);
await page.waitForFunction(() => window.__spotSaver?.ready, null, { timeout: 180000 });
const samples = [];
for (let m = 0; m <= minutes; m++) {
  if (m) await page.waitForTimeout(60000);
  const s = await page.evaluate(() => { const i = window.__spotSaver.stage()?.renderer?.info; return { heap: performance.memory.usedJSHeapSize / 1e6, geo: i?.memory.geometries, tex: i?.memory.textures, fps: window.__spotSaver.fps(), phase: window.__spotSaver.frame().phase, cycle: window.__spotSaver.frame().cycle }; });
  samples.push(s);
  console.log(`min ${m}: heap ${s.heap.toFixed(1)} MB, geometries ${s.geo}, textures ${s.tex}, ${s.fps.toFixed(0)} fps, ${s.phase} (cycle ${s.cycle})`);
}
await browser.close();
const first = samples[1] || samples[0], last = samples.at(-1);
const grew = last.heap > first.heap * 1.5 + 20 || (last.geo ?? 0) > (first.geo ?? 0) + 20 || (last.tex ?? 0) > (first.tex ?? 0) + 10;
if (errors.length || grew) { console.error('soak failed', errors, { first, last }); process.exit(1); }
console.log('soak ok');
