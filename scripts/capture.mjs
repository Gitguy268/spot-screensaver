// Regenerates the pictures in docs/: stills of both styles and short animated demos (WebP via
// ffmpeg). Uses the real GPU: node scripts/capture.mjs
import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const url = pathToFileURL(join(root, 'index.html')).href;
const browser = await chromium.launch({ args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });

async function open(query, w = 1440, h = 810) {
  const page = await browser.newPage({ viewport: { width: w, height: h } });
  page.on('pageerror', (e) => console.error('pageerror', e.message));
  await page.goto(`${url}?caption=0&${query}`);
  await page.waitForFunction(() => window.__spotSaver?.ready, null, { timeout: 120000 });
  await page.evaluate(() => window.__spotSaver.stop());
  await page.waitForTimeout(1300); // the loading screen fades out
  return page;
}
const step = (page, s) => page.evaluate((x) => window.__spotSaver.step(x), s);

const stills = [
  ['screenshot.jpg', 'style=3d&quality=high&seed=5&scene=nap&at=2', 2],
  ['closeup.jpg', 'style=3d&quality=high&seed=5&scene=dream&at=12', 1],
  ['dream.jpg', 'style=3d&quality=high&seed=3&scene=chase&at=3', 9],
  ['vector.jpg', 'style=vector&quality=high&seed=5&scene=nap&at=5', 1],
  ['vector-dream.jpg', 'style=vector&quality=high&seed=2&scene=chase&at=4', 1],
];
for (const [name, q, s] of stills) {
  const page = await open(q);
  await step(page, s);
  await page.screenshot({ path: join(root, 'docs', name), type: 'jpeg', quality: 86 });
  await page.close();
  console.log('docs/' + name);
}

// demos: frames stepped at 1/fps, then one animated WebP each
async function demo(name, query, clips, fps = 12) {
  const dir = mkdtempSync(join(tmpdir(), 'spot-demo-'));
  const page = await open(query, 960, 540);
  let n = 0;
  for (const [phase, at, seconds, speed = 1] of clips) {
    await page.evaluate(([p, a]) => window.__spotSaver.jump(p, a), [phase, at]);
    for (let i = 0; i < seconds * fps; i++) {
      await step(page, speed / fps);
      await page.screenshot({ path: join(dir, `f${String(n++).padStart(4, '0')}.png`) });
    }
  }
  await page.close();
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(fps), '-i', join(dir, 'f%04d.png'), '-vf', 'scale=720:-2', '-loop', '0', '-quality', '62', '-compression_level', '6', join(root, 'docs', name)]);
  rmSync(dir, { recursive: true, force: true });
  console.log('docs/' + name, n, 'frames');
}
// nap with a head nod → dreaming, paws twitching → the dissolve → the chase → waking up
await demo('demo.webp', 'style=3d&quality=high&seed=3', [['nap', 25, 2, 3], ['dream', 13, 3, 2], ['chase', 2, 3.5], ['wake', 4, 2.5, 2]]);
await demo('vector-demo.webp', 'style=vector&quality=high&seed=2', [['nap', 20, 1.5, 3], ['dream', 12, 2, 2], ['chase', 4, 3]]);
await browser.close();
