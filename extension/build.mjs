import { build } from 'esbuild';
import { cp, mkdir } from 'node:fs/promises';

await mkdir('dist', { recursive: true });

await build({
  entryPoints: ['src/content.ts'],
  bundle: true,
  format: 'iife',
  target: 'chrome120',
  outfile: 'dist/content.js',
  minify: process.argv.includes('--minify'),
  sourcemap: !process.argv.includes('--minify'),
  logLevel: 'info',
});

await cp('src/panel.css', 'dist/panel.css');
console.log('built → extension/dist');
