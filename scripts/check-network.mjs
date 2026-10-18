/**
 * The no-network guarantee, as a check that can fail.
 *
 * Profile data never leaving the browser is the product's main claim, so it is
 * asserted on every built bundle rather than trusted. One pattern, shared by CI,
 * `npm run check:web` and the store packager, so the three cannot drift apart and
 * leave one door open.
 *
 *   node scripts/check-network.mjs <bundle.js> [more.js …]
 *
 * Exits non-zero naming the file, line and primitive on the first hit, and also
 * when a named bundle is missing — a check that passes because it read nothing is
 * worse than no check.
 */
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

export const FORBIDDEN = /\bfetch\(|XMLHttpRequest|WebSocket|sendBeacon|navigator\.connection/;

/** Every offending line in `code`, as { line, match }. */
export function networkPrimitives(code) {
  const re = new RegExp(FORBIDDEN.source, 'g');
  const hits = [];
  code.split('\n').forEach((text, i) => {
    for (const m of text.matchAll(re)) hits.push({ line: i + 1, match: m[0] });
  });
  return hits;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const files = process.argv.slice(2);
  if (!files.length) {
    console.error('usage: node scripts/check-network.mjs <bundle.js> [more.js …]');
    process.exit(2);
  }
  let failed = false;
  for (const file of files) {
    let code;
    try {
      code = await readFile(file, 'utf8');
    } catch {
      console.error(`::error::${file} not found — build it before checking it.`);
      failed = true;
      continue;
    }
    const hits = networkPrimitives(code);
    for (const h of hits) console.error(`::error file=${file},line=${h.line}::network primitive "${h.match}"`);
    if (hits.length) failed = true;
    else console.log(`OK  ${file} — no fetch, XMLHttpRequest, WebSocket or sendBeacon`);
  }
  if (failed) {
    console.error('Profile data must never leave the browser. See README > Guarantees.');
    process.exit(1);
  }
}
