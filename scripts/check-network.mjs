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

/**
 * Anything that can send bytes off the device, or build something that can.
 *
 * A bare `fetch(` match was the whole check, and a review found fourteen ways
 * round it: `fetch (`, `const f = fetch`, `fetch.call`, `globalThis['fe'+'tch']`,
 * dynamic `import()`, an image's `src`, EventSource, WebRTC, workers,
 * WebTransport, importScripts. So this matches the identifier rather than a call,
 * every other transport by name, the computed-global and code-from-string doors
 * that could spell any of them, and the navigation and element tricks that leak
 * through a URL. A static check is a tripwire, not a proof — the runtime test in
 * web/test/bundle.test.ts, which runs the bundle against a global that refuses
 * everything off an allowlist, is the other half.
 */
export const FORBIDDEN = new RegExp([
  String.raw`\bfetch\b`,
  'XMLHttpRequest', 'WebSocket', 'sendBeacon', String.raw`navigator\.connection`,
  'EventSource', 'RTCPeerConnection', 'RTCDataChannel', 'WebTransport', 'importScripts',
  String.raw`\b(?:Shared|Service)?Worker\b`, 'serviceWorker',
  String.raw`\bImage\s*\(`, String.raw`\.src\s*=(?!=)`, String.raw`\bimport\s*\(`,
  String.raw`\beval\s*\(`, String.raw`\bFunction\s*\(`,
  String.raw`\b(?:globalThis|window|self|top|parent|frames)\s*\[`,
  // Navigation: `location.href =`, `window.location =`, or a bare global
  // `location =`. A property called location (`profile.location = …`) is data.
  String.raw`\blocation\.href\s*=(?!=)`, String.raw`\b(?:window|document|self|top|parent|globalThis)\.location\s*=(?!=)`,
  String.raw`(?<![.\w$])location\s*=(?!=)`, String.raw`\blocation\.(?:assign|replace)\s*\(`,
  String.raw`\bwindow\.open\s*\(`, String.raw`\.submit\s*\(`,
  String.raw`createElement\(\s*['"\x60](?:script|img|iframe|link|form|object|embed)\b`,
].join('|'));

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
    else console.log(`OK  ${file} — no network primitive (fetch, XHR, sockets, beacons, workers, dynamic code)`);
  }
  if (failed) {
    console.error('Profile data must never leave the browser. See README > Guarantees.');
    process.exit(1);
  }
}
