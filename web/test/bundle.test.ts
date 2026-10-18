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

test('the network check catches every primitive it claims to', () => {
  // A check that cannot fail proves nothing; prove this one can.
  for (const bad of ['fetch(url)', 'new XMLHttpRequest()', 'new WebSocket(u)', 'navigator.sendBeacon(u)', 'navigator.connection']) {
    assert.equal(networkPrimitives(`const a = 1;\n${bad};`).length, 1, bad);
  }
  assert.deepEqual(networkPrimitives('const prefetched = refetch;'), []);
});
