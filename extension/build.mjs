import { build, context } from 'esbuild';
import { cp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';

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

/**
 * A loadable Firefox package under build/firefox.
 *
 * Firefox needs `browser_specific_settings.gecko.id` to sign an add-on, and
 * Chrome's store validator is unhappy about unknown top-level manifest keys — so
 * the two manifests are emitted separately rather than merged into one that
 * neither store is entirely happy with.
 *
 * Nothing else differs: there is no background script (Firefox MV3 has no service
 * workers) and no remote code, which is most of what usually makes a port painful.
 */
async function buildFirefox() {
  const manifest = JSON.parse(await readFile('manifest.json', 'utf8'));
  manifest.browser_specific_settings = {
    gecko: { id: 'profile-score@kalyanprakash.github.io', strict_min_version: '128.0' },
  };
  await rm('../build/firefox', { recursive: true, force: true });
  await mkdir('../build/firefox/dist', { recursive: true });
  await writeFile('../build/firefox/manifest.json', JSON.stringify(manifest, null, 2) + '\n');
  await cp('dist', '../build/firefox/dist', { recursive: true });
  await cp('icons', '../build/firefox/icons', { recursive: true });
  console.log('firefox package -> build/firefox');
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
  await buildFirefox();
}
