import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';

import { buildProfileHtml, type FixtureOptions } from './fixtures/dom.ts';
import { scoreProfile } from '../../packages/engine/src/score.ts';
import { advise } from '../../packages/engine/src/actions.ts';
import { PERSONAS } from '../../packages/engine/src/personas.ts';
import type { PersonaId, Profile } from '../../packages/engine/src/types.ts';
import { kalyan, kalyanLive, strong, empty, median } from '../../packages/engine/test/fixtures/profiles.ts';
import { ARCHETYPES } from '../../packages/engine/test/fixtures/archetypes.ts';

/**
 * The extension's scores, pinned.
 *
 * The web importers needed new things from the engine — a separate observation
 * for portfolio descriptions, an abstention on keyword reinforcement — and every
 * such change is one edit away from moving the number an extension user sees for
 * an unchanged profile, which `version.ts` exists to prevent. This snapshot was
 * taken before those changes; it says they moved nothing on the extension path.
 *
 * Covers every engine fixture and the extractor's output on the DOM fixture in
 * the shapes it is tested in, for every goal. The clock is frozen, because career
 * stage reads "Present" against today and a snapshot that drifts with the
 * calendar is a test that fails in March for no reason.
 *
 * A deliberate rubric change will move it. Regenerate with
 *   UPDATE_SNAPSHOT=1 node --experimental-strip-types --test extension/test/scores-unchanged.test.ts
 * and say so in the commit, alongside the RUBRIC_VERSION bump.
 */

const SNAPSHOT = new URL('./fixtures/score-snapshot.json', import.meta.url);
const FROZEN = Date.UTC(2026, 9, 18, 12);

const DOM_SHAPES: Record<string, FixtureOptions> = {
  default: {},
  withProjects: { withProjects: true },
  noAbout: { withAbout: false },
  noSkillsNoFeatured: { withSkills: false, withFeatured: false },
  unlinkedEmployer: { unlinkedSecondEmployer: true },
  framedOpenToWork: { framedPhoto: true, banner: true, openToWork: true },
  noEducationNoRecs: { withEducation: false, withRecommendations: false },
  // A partial read: the shape a lazy-loading miss or a stranger's profile leaves.
  noAboutNoExperience: { withAbout: false, withExperience: false },
};

async function extract(opts: FixtureOptions): Promise<Profile> {
  const dom = new JSDOM(`<!doctype html><html><body>${buildProfileHtml(opts)}</body></html>`, {
    url: 'https://www.linkedin.com/in/dana-okonkwo/',
  });
  const g = globalThis as Record<string, unknown>;
  g.window = dom.window;
  g.document = dom.window.document;
  g.location = dom.window.location;
  g.HTMLElement = dom.window.HTMLElement;
  g.HTMLImageElement = dom.window.HTMLImageElement;
  const mod = await import(`../src/extract.ts?t=${Math.random()}`);
  try {
    return mod.extractProfile() as Profile;
  } finally {
    dom.window.close();
  }
}

function withFrozenClock<T>(fn: () => T): T {
  const Real = Date;
  class Frozen extends Real {
    constructor(...args: unknown[]) {
      // @ts-expect-error — forwarding whatever Date accepts
      super(...(args.length ? args : [FROZEN]));
    }
    static now() { return FROZEN; }
  }
  globalThis.Date = Frozen as DateConstructor;
  try { return fn(); } finally { globalThis.Date = Real; }
}

async function currentScores(): Promise<Record<string, Record<string, string>>> {
  const profiles: Record<string, Profile> = {
    'engine/kalyan': kalyan, 'engine/kalyanLive': kalyanLive, 'engine/strong': strong,
    'engine/empty': empty, 'engine/median': median,
  };
  for (const [name, p] of Object.entries(ARCHETYPES)) profiles[`archetype/${name}`] = p as Profile;
  for (const [name, opts] of Object.entries(DOM_SHAPES)) profiles[`extension/${name}`] = await extract(opts);

  return withFrozenClock(() => {
    const out: Record<string, Record<string, string>> = {};
    for (const [name, p] of Object.entries(profiles)) {
      out[name] = {};
      for (const id of Object.keys(PERSONAS) as PersonaId[]) {
        const r = scoreProfile(p, id);
        const a = advise(p, id);
        out[name][id] = `${r.score} (uncapped ${r.uncappedScore}, range ${r.range.floor}-${r.range.ceiling}, ` +
          `${r.abstained.length} abstained, lead: ${a.oneThing?.action.id ?? 'none'})`;
      }
    }
    return out;
  });
}

test('extension and engine-fixture scores are unchanged by the web work', async () => {
  const now = await currentScores();
  if (process.env.UPDATE_SNAPSHOT) {
    await writeFile(SNAPSHOT, JSON.stringify(now, null, 2) + '\n');
    return;
  }
  const pinned = JSON.parse(await readFile(SNAPSHOT, 'utf8'));
  assert.deepEqual(now, pinned);
});
