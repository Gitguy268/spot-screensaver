import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// Source lives in src/; the build is one self-contained HTML file (dist/index.html) that
// scripts/finish-build.mjs copies to ./index.html. The same file runs in a browser, from a
// double-click and inside the macOS screen saver bundle.
export default defineConfig({
  root: 'src',
  base: './',
  publicDir: false,
  assetsInclude: ['**/*.glb'],
  plugins: [viteSingleFile()],
  build: { outDir: '../dist', emptyOutDir: true, target: 'es2022', chunkSizeWarningLimit: 8000, assetsInlineLimit: 100_000_000 },
  server: { port: 5210 },
  preview: { port: 4210 },
});
