import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';

// @ts-expect-error — plain .mjs build script, no type declarations.
import { bundle } from '../build.mjs';
// @ts-expect-error — plain .mjs check script, no type declarations.
import { networkPrimitives } from '../../scripts/check-network.mjs';
import { RUBRIC_VERSION } from '../../packages/engine/src/version.ts';
import { PERSONAS } from '../../packages/engine/src/personas.ts';
import { scoreProfile } from '../../packages/engine/src/score.ts';
import { layout, LONG_CAREER } from './fixtures/linkedin-pdf-synthetic.ts';

/**
 * The shipped artefact, not the source.
 *
 * Each variant is bundled exactly as `npm run build:web` does it and run in a bare
 * VM context — a global object with nothing on it but what a browser would supply
 * that the engine uses. If the IIFE leaned on a Node global, or esbuild dropped
 * something under minification, the source tests would pass and the page would
 * break; these would not.
 *
 * The surface is a contract with the LiveJobs page, so it is asserted exactly:
 * an added key is as much a break as a missing one.
 */

const CONTRACT_KEYS = ['defaultPersona', 'fromLinkedInPdfItems', 'fromPaste', 'personas', 'score', 'version'];

const variants: Record<string, Promise<string>> = {
  readable: bundle({ minify: false }),
  minified: bundle({ minify: true }),
};

async function load(variant: string) {
  const code = await variants[variant];
  const sandbox: Record<string, unknown> = { structuredClone };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(code, sandbox);
  return { api: sandbox.ProfileScoreWeb as any, code };
}

for (const variant of Object.keys(variants)) {
  test(`${variant}: assigns window.ProfileScoreWeb with exactly the contract's keys`, async () => {
    const { api } = await load(variant);
    assert.ok(api, 'ProfileScoreWeb should be on the global');
    assert.deepEqual(Object.keys(api).sort(), CONTRACT_KEYS);
    assert.equal(typeof api.score, 'function');
    assert.equal(typeof api.fromLinkedInPdfItems, 'function');
    assert.equal(typeof api.fromPaste, 'function');
  });

  test(`${variant}: version, personas and default persona come from the engine`, async () => {
    const { api } = await load(variant);
    assert.equal(api.version, RUBRIC_VERSION);
    assert.equal(api.defaultPersona, 'job_search');
    assert.deepEqual(
      JSON.parse(JSON.stringify(api.personas)),
      Object.values(PERSONAS).map((p) => ({ id: p.id, label: p.label })),
    );
  });

  test(`${variant}: score returns the engine's own report and advice for a PDF-derived profile`, async () => {
    const { api } = await load(variant);
    const profile = api.fromLinkedInPdfItems(layout(LONG_CAREER));
    const { report, advice } = api.score(profile, 'recruiter_inbound');
    assert.equal(report.persona, 'recruiter_inbound');
    // Reuse, not re-implementation: the bundle's report is the engine's report.
    assert.deepEqual(JSON.parse(JSON.stringify(report)), JSON.parse(JSON.stringify(scoreProfile(profile, 'recruiter_inbound'))));
    assert.ok(Array.isArray(advice.alsoWorthDoing));
    assert.ok(advice.oneThing === undefined || typeof advice.oneThing.delta === 'number');
  });

  test(`${variant}: score defaults the persona, and falls back on an unknown one`, async () => {
    const { api } = await load(variant);
    const profile = api.fromPaste({ headline: 'Data analyst', about: '' });
    assert.equal(api.score(profile).report.persona, 'job_search');
    assert.equal(api.score(profile, 'astronaut').report.persona, 'job_search');
  });

  test(`${variant}: score refuses a missing profile with a message that says what to pass`, async () => {
    const { api } = await load(variant);
    assert.throws(() => api.score(null), /fromLinkedInPdfItems or fromPaste/);
  });

  test(`${variant}: the surface is frozen`, async () => {
    const { api } = await load(variant);
    assert.ok(Object.isFrozen(api));
    assert.ok(Object.isFrozen(api.personas));
  });

  test(`${variant}: contains no network primitive`, async () => {
    const { code } = await load(variant);
    assert.deepEqual(networkPrimitives(code), []);
  });
}

test('the network check catches the ways round a plain fetch( match', () => {
  // Each of these reached the network, or could build something that does, and
  // slipped past the original pattern.
  for (const bad of [
    "globalThis['fe'+'tch'](u)", 'const f=fetch; f(u)', 'fetch (u)', 'fetch.call(null, u)', 'window.fetch(u)',
    "import('https://x.example/m.js')", 'new Image().src = u', 'img.src=u', 'new EventSource(u)',
    'new RTCPeerConnection()', "new Worker('w.js')", 'new SharedWorker(u)', 'navigator.serviceWorker.register(u)',
    'new WebTransport(u)', "importScripts('x.js')", "self['XMLHttp'+'Request']", "eval('fe'+'tch')",
    "Function('return fetch')()", "location.href = u", 'location.assign(u)', 'form.submit()',
    "document.createElement('script')", "window.open(u)",
  ]) {
    assert.ok(networkPrimitives(`const a = 1;\n${bad};`).length >= 1, bad);
  }
});

test('the network check catches every primitive it claims to', () => {
  // A check that cannot fail proves nothing; prove this one can.
  for (const bad of ['fetch(url)', 'new XMLHttpRequest()', 'new WebSocket(u)', 'navigator.sendBeacon(u)', 'navigator.connection']) {
    assert.equal(networkPrimitives(`const a = 1;\n${bad};`).length, 1, bad);
  }
  assert.deepEqual(networkPrimitives('const prefetched = refetch;'), []);
});

/**
 * Every global the bundle may touch. Plain ECMAScript intrinsics, plus
 * structuredClone (the engine copies a profile to simulate a fix) and its own
 * export. Nothing that talks to anything.
 */
const GLOBAL_ALLOWLIST = new Set([
  'Array', 'Boolean', 'Date', 'Error', 'Infinity', 'JSON', 'Map', 'Math', 'NaN', 'Number', 'Object',
  'RangeError', 'Reflect', 'RegExp', 'Set', 'String', 'Symbol', 'TypeError', 'WeakMap', 'WeakSet',
  'globalThis', 'isFinite', 'isNaN', 'parseFloat', 'parseInt', 'undefined',
  'structuredClone', 'ProfileScoreWeb',
]);

const NETWORK_GLOBALS = [
  'fetch', 'XMLHttpRequest', 'WebSocket', 'navigator', 'Image', 'EventSource', 'Worker', 'SharedWorker',
  'RTCPeerConnection', 'WebTransport', 'importScripts', 'location', 'document', 'window', 'self', 'open',
  'eval', 'Function',
];

for (const variant of Object.keys(variants)) {
  test(`${variant}: at run time, touches no global off the allowlist`, async () => {
    // The static check reads text; this watches behaviour. The bundle runs against
    // a global object that records every name looked up on it and answers only for
    // allowlisted ones, then every entry point is exercised.
    const code = await variants[variant];
    const touched = new Set<string>();
    const store: Record<string, unknown> = {};
    const g = globalThis as Record<string, unknown>;
    let sandbox: object;
    sandbox = new Proxy(store, {
      get(t, k) {
        if (typeof k !== 'string') return undefined;
        touched.add(k);
        if (k in t) return t[k];
        if (k === 'globalThis') return sandbox;
        return GLOBAL_ALLOWLIST.has(k) ? g[k] : undefined;
      },
      has(_t, k) {
        if (typeof k === 'string') touched.add(k);
        return true;
      },
      set(t, k, v) {
        if (typeof k === 'string') touched.add(k);
        (t as Record<string | symbol, unknown>)[k] = v;
        return true;
      },
    });
    const ctx = vm.createContext(sandbox);
    vm.runInContext(code, ctx);
    const api = store.ProfileScoreWeb as any;
    const pdf = api.fromLinkedInPdfItems(layout(LONG_CAREER));
    const pasted = api.fromPaste({
      name: 'A', headline: 'Data analyst | SQL', about: 'I build dashboards. Message me.',
      experience: 'Analyst\nAcme · Full-time\nJan 2020 - Present · 6 yrs 10 mos\nCut reporting time by 40%.',
      education: 'Leeds\nBSc, Maths', skills: 'SQL, Python', certifications: 'PMP', projects: 'Tracker\nBuilt a tracker.',
    });
    for (const p of [pdf, pasted, { observed: [] }]) {
      for (const persona of api.personas) api.score(p, persona.id);
    }
    assert.throws(() => api.score(null));

    const offList = [...touched].filter((k) => !GLOBAL_ALLOWLIST.has(k));
    assert.deepEqual(offList, [], `globals touched outside the allowlist: ${offList.join(', ')}`);
    for (const name of NETWORK_GLOBALS) assert.ok(!touched.has(name), `${name} was touched`);
  });
}
