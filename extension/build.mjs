import { build, context } from 'esbuild';
import { cp, mkdir } from 'node:fs/promises';

const watch = process.argv.includes('--watch');
const minify = process.argv.includes('--minify');

await mkdir('dist', { recursive: true });

const options = {
  entryPoints: ['src/content.ts'],
  bundle: true,
  format: 'iife',
  target: 'chrome120',
  outfile: 'dist/content.js',
  minify,
  sourcemap: !minify,
  logLevel: 'info',
};

async function copyCss() {
  await cp('src/panel.css', 'dist/panel.css');
}

if (watch) {
  // Rebuild on save. Chrome still needs the extension reloaded from
  // chrome://extensions and the LinkedIn tab refreshed to pick up a new bundle.
  const ctx = await context({
    ...options,
    plugins: [{
      name: 'copy-css',
      setup(b) { b.onEnd(() => copyCss()); },
    }],
  });
  await ctx.watch();
  console.log('watching extension/src — Ctrl+C to stop');
} else {
  await build(options);
  await copyCss();
  console.log('built → extension/dist');
}
