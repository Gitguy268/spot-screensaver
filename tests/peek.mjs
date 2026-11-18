// Dev screenshots: node tests/peek.mjs <out.png> "<query>" [step seconds] [width] [height]
// Steps the director by hand (deterministic) before the shot. GPU=0 uses SwiftShader.
import { chromium } from 'playwright';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const [out = 'peek.png', query = '', step = '0', w = '1280', h = '720'] = process.argv.slice(2);
const gpu = process.env.GPU !== '0';
const args = gpu ? ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] : ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'];
const browser = await chromium.launch({ args });
const page = await browser.newPage({ viewport: { width: +w, height: +h } });
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning' || m.type() === 'debug') console.log(m.type(), m.text().slice(0, 300)); });
page.on('pageerror', (e) => console.log('pageerror', e.message));
const file = process.env.SRC === 'root' ? join(root, 'index.html') : join(root, 'dist/index.html');
await page.goto(pathToFileURL(file).href + (query ? '?' + query : ''));
await page.waitForFunction(() => window.__spotSaver?.ready, null, { timeout: 120000 });
await page.evaluate(() => window.__spotSaver.stop());
await page.waitForTimeout(1300);
// step can be a list ("2,4,4"): one shot after each, named out-0.png, out-1.png, …
const steps = step.split(',').map(Number);
for (const [i, s] of steps.entries()) {
  if (s) await page.evaluate((x) => window.__spotSaver.step(x), s);
  await page.evaluate(() => window.__spotSaver.step(0.05));
  console.log(JSON.stringify(await page.evaluate(() => ({ frame: window.__spotSaver.frame(), info: window.__spotSaver.info() }))));
  await page.screenshot({ path: steps.length > 1 ? out.replace(/\.png$/, `-${i}.png`) : out });
}
await browser.close();
