/**
 * Store packages, reproducibly.
 *
 * Built by a script rather than by hand so the thing uploaded to a store is the
 * thing the repository describes, and so the next release is one command rather
 * than a remembered sequence of zips.
 *
 * Three archives:
 *   chrome   — manifest.json at the root
 *   firefox  — the same, with browser_specific_settings.gecko
 *   source   — what AMO reviewers read, straight from git
 *
 * Deliberately NOT minified: AMO reviews source, and an unreadable bundle turns a
 * one-day review into a correspondence. But the sourcemap comment is stripped,
 * because the .map is not shipped and a dangling pointer 404s in the console of
 * everyone who installs it.
 */
import { execFileSync } from 'node:child_process';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const VERSION = JSON.parse(await readFile('extension/manifest.json', 'utf8')).version;
const OUT = 'dist-store';

const FORBIDDEN = /\bfetch\(|XMLHttpRequest|WebSocket|sendBeacon/;

await mkdir(OUT, { recursive: true });

/**
 * Publish by writing bytes, never by replacing the file.
 *
 * `zip` and `git archive` both want to unlink an existing archive first, which
 * fails with EPERM on mounts that allow writes but not deletes — so packaging
 * worked on one machine and died on another for reasons unrelated to the code.
 * Both now build into a temp dir off the mount, and the result is written over
 * the destination, which truncates in place and needs no delete permission.
 */
async function publish(from, to) {
  await writeFile(to, await readFile(from));
  console.log(`${to}`);
}

const bundle = await readFile('extension/dist/content.js', 'utf8');
if (FORBIDDEN.test(bundle)) {
  throw new Error('bundle contains a network call — the privacy claim is the product, refusing to package');
}
const clean = bundle.replace(/^\/\/# sourceMappingURL=.*$/m, '').trimEnd() + '\n';

for (const target of ['chrome', 'firefox']) {
  const dir = await mkdtemp(join(tmpdir(), `lps-${target}-`));
  await mkdir(join(dir, 'dist'), { recursive: true });
  await cp(
    target === 'chrome' ? 'extension/manifest.json' : 'build/firefox/manifest.json',
    join(dir, 'manifest.json'),
  );
  await writeFile(join(dir, 'dist/content.js'), clean);
  await cp('extension/dist/panel.css', join(dir, 'dist/panel.css'));
  await cp('extension/icons', join(dir, 'icons'), { recursive: true });

  // Built beside the staged files, in the temp dir, so `zip` never touches the
  // destination and never needs to remove a previous build.
  const staged = join(dir, 'package.zip');
  execFileSync('zip', ['-qr', staged, '.'], { cwd: dir });
  await publish(staged, join(OUT, `${target}-profile-score-${VERSION}.zip`));
  await rm(dir, { recursive: true, force: true }).catch(() => {});
}

const srcDir = await mkdtemp(join(tmpdir(), 'lps-src-'));
const srcZip = join(srcDir, 'source.zip');
execFileSync('git', ['archive', '--format=zip', '-o', srcZip, 'HEAD']);
await publish(srcZip, join(OUT, `source-${VERSION}.zip`));
await rm(srcDir, { recursive: true, force: true }).catch(() => {});
console.log('\nPromo tile is checked in at docs/promo-440x280.png');
