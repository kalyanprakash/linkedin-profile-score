import { build } from 'esbuild';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';

/**
 * The web bundle: one IIFE that assigns `window.ProfileScoreWeb`.
 *
 * Two files, the same code:
 *   profile-score-web.js      readable — what a reviewer, or a site owner
 *                             deciding whether to trust it, actually reads
 *   profile-score-web.min.js  what a page ships
 *
 * No sourcemaps. The readable file is its own map, and a `sourceMappingURL`
 * pointing at a file nobody deploys 404s in the console of every visitor.
 *
 * Exported so the tests bundle the same way the build does, rather than testing a
 * second configuration that only resembles the shipped one.
 */
const here = dirname(fileURLToPath(import.meta.url));
export const OUT_DIR = join(here, 'dist');
export const FILES = { readable: 'profile-score-web.js', minified: 'profile-score-web.min.js' };

async function banner() {
  const src = await readFile(join(here, '../packages/engine/src/version.ts'), 'utf8');
  const version = /RUBRIC_VERSION\s*=\s*'([^']+)'/.exec(src)?.[1] ?? 'unknown';
  // `/*!` survives minification, so the licence and provenance travel with the file.
  return `/*! Profile Score web bundle · rubric ${version} · Apache-2.0 · https://github.com/kalyanprakash/linkedin-profile-score */`;
}

/** Bundle to a string. `minify` selects the shipped variant. */
export async function bundle({ minify = false } = {}) {
  const result = await build({
    entryPoints: [join(here, 'src/index.ts')],
    bundle: true,
    format: 'iife',
    // structuredClone (used by the engine to simulate fixes) sets the floor.
    target: ['chrome100', 'firefox100', 'safari15.4'],
    minify,
    write: false,
    legalComments: 'inline',
    banner: { js: await banner() },
    logLevel: 'silent',
  });
  return result.outputFiles[0].text;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  await mkdir(OUT_DIR, { recursive: true });
  for (const [variant, name] of Object.entries(FILES)) {
    const code = await bundle({ minify: variant === 'minified' });
    // writeFile truncates in place: no unlink, so it works on mounts that refuse deletes.
    await writeFile(join(OUT_DIR, name), code);
    console.log(`web/dist/${name}  ${(Buffer.byteLength(code) / 1024).toFixed(1)} KB`);
  }
}
