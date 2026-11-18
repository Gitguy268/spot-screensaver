// Smoke test, from file:// like a double-click: both styles x every scene, in Chromium and WebKit
// (the macOS screen saver runs the page in WKWebView). Fails on console errors, a scene that does
// not show, or a frame loop that stops. GPU=1 uses the real GPU (local); without it SwiftShader.
// Prints fps per style and browser (with GPU=1 these are real numbers).
import { chromium, webkit } from 'playwright';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const gpu = !!process.env.GPU;
const only = process.env.BROWSERS?.split(',') || ['chromium', 'webkit'];
const url = pathToFileURL(join(root, process.env.SRC === 'dist' ? 'dist/index.html' : 'index.html')).href;
const problems = [];
for (const [name, type] of [['chromium', chromium], ['webkit', webkit]].filter(([n]) => only.includes(n))) {
  const args = name !== 'chromium' ? [] : gpu ? ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] : ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'];
  const browser = await type.launch({ args });
  for (const style of ['3d', 'vector']) {
    const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
    page.on('console', (m) => { if (m.type() === 'error' && !/favicon/.test(m.text())) problems.push(`${name}/${style}: ${m.text().slice(0, 200)}`); });
    page.on('pageerror', (e) => problems.push(`${name}/${style}: pageerror ${e.message}`));
    const quality = gpu ? 'medium' : 'low';
    await page.goto(`${url}?style=${style}&quality=${quality}&caption=0&seed=4`);
    try { await page.waitForFunction(() => window.__spotSaver?.ready, null, { timeout: 180000 }); } catch { problems.push(`${name}/${style}: never ready`); await page.close(); continue; }
    for (const scene of ['nap', 'dream', 'chase', 'wake']) {
      await page.evaluate((s) => window.__spotSaver.jump(s, 5), scene);
      // wait for the frame loop to move on (software rendering in CI can take seconds per frame)
      await page.waitForFunction(() => window.__spotSaver.frame().t > 5.05, null, { timeout: 60000 }).catch(() => {});
      const f = await page.evaluate(() => window.__spotSaver.frame());
      const want = scene === 'chase' ? 'dream' : 'room';
      if (f.phase !== scene || f.world !== want) problems.push(`${name}/${style}/${scene}: got ${f.phase}/${f.world}`);
      if (f.t <= 5) problems.push(`${name}/${style}/${scene}: the loop did not advance (t ${f.t})`);
    }
    if (await page.evaluate(() => window.__spotSaver.style()) !== style) problems.push(`${name}/${style}: wrong style shown`);
    await page.waitForTimeout(1500);
    console.log(`${name} ${style}: ${(await page.evaluate(() => window.__spotSaver.fps())).toFixed(0)} fps (${quality})`);
    await page.close();
  }
  await browser.close();
}
if (problems.length) { console.error(problems.join('\n')); process.exit(1); }
console.log('smoke ok');
