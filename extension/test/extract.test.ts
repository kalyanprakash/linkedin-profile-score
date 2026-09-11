import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

import { buildProfileHtml, type FixtureOptions } from './fixtures/dom.ts';
import type { Profile } from '../../packages/engine/src/types.ts';

/**
 * Extractor tests.
 *
 * `extract.ts` reads globals (document, location), so each case installs a jsdom
 * window, then imports the module fresh. The import is cached per URL, so a cache
 * buster keeps cases independent.
 */
async function extract(opts: FixtureOptions = {}, path = '/in/dana-okonkwo/'): Promise<Profile> {
  const dom = new JSDOM(`<!doctype html><html><body>${buildProfileHtml(opts)}</body></html>`, {
    url: `https://www.linkedin.com${path}`,
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

/**
 * The same, but hands back the module with the window still open — for the helpers
 * that query the live DOM on each call rather than returning a snapshot.
 */
async function load(opts: FixtureOptions = {}, path = '/in/dana-okonkwo/') {
  const dom = new JSDOM(`<!doctype html><html><body>${buildProfileHtml(opts)}</body></html>`, {
    url: `https://www.linkedin.com${path}`,
  });
  const g = globalThis as Record<string, unknown>;
  g.window = dom.window;
  g.document = dom.window.document;
  g.location = dom.window.location;
  g.HTMLElement = dom.window.HTMLElement;
  g.HTMLImageElement = dom.window.HTMLImageElement;
  return await import(`../src/extract.ts?t=${Math.random()}`);
}

// ------------------------------------------------------------------- top card

test('reads name, headline and location from the top card', async () => {
  const p = await extract();
  assert.equal(p.name, 'Dana Okonkwo');
  assert.match(p.headline!, /^Staff Platform Engineer @ Meridian Freight/);
  assert.equal(p.location, 'Bristol, England, United Kingdom');
  assert.equal(p.contactInfoAvailable, true);
});

test('the headline is not the pronouns, the location or the connection count', async () => {
  const p = await extract();
  assert.ok(!/She\/Her/.test(p.headline!));
  assert.ok(!/connections/.test(p.headline!));
  assert.ok(!/Rivertown/.test(p.headline!), 'must not pick the company/school line');
});

test('name is found even though it is an h2, not an h1', async () => {
  const dom = new JSDOM(`<!doctype html><html><body>${buildProfileHtml()}</body></html>`);
  assert.equal(dom.window.document.querySelector('main h1'), null, 'fixture has no h1, by design');
  const p = await extract();
  assert.equal(p.name, 'Dana Okonkwo');
});

// ------------------------------------------------------------------ photo

test('detects an #OpenToWork photo frame and the banner separately', async () => {
  const plain = await extract({ framedPhoto: false, banner: false });
  assert.equal(plain.photo?.present, true);
  assert.equal(plain.photo?.hasFrame, false);
  assert.equal(plain.banner?.present, false);

  const framed = await extract({ framedPhoto: true, banner: true, openToWork: true });
  assert.equal(framed.photo?.hasFrame, true);
  assert.equal(framed.banner?.present, true);
  assert.equal(framed.openToWork?.active, true);
  assert.equal(framed.openToWork?.publicToAll, true);
});

// -------------------------------------------------------------- experience

test('reads every role, including single-role employers that render no <li>', async () => {
  const p = await extract();
  const titles = (p.experience || []).map((e) => e.title);
  // Two grouped under Meridian, one grouped under Halden, two standalone.
  assert.deepEqual(titles, [
    'Staff Platform Engineer',
    'Senior Platform Engineer',
    'Infrastructure Engineer',
    'Systems Engineer',
    'Support Engineer',
  ]);
});

test('a skills badge is not mistaken for a role description', async () => {
  const p = await extract();
  const senior = (p.experience || []).find((e) => e.title === 'Senior Platform Engineer');
  assert.ok(senior, 'role must be found');
  assert.equal(senior!.description, '', '"Leadership, Delivery and +2 skills" is a badge, not prose');

  const staff = (p.experience || []).find((e) => e.title === 'Staff Platform Engineer');
  assert.match(staff!.description!, /release time from 11 hours/);
});

test('the current role is flagged from its date range', async () => {
  const p = await extract();
  const current = (p.experience || []).filter((e) => e.current);
  assert.equal(current.length, 1);
  assert.equal(current[0].title, 'Staff Platform Engineer');
});

test('counts linked vs unlinked employers', async () => {
  const all = await extract();
  assert.equal(all.linkedEmployers, 4, 'four employers carry a /company/ link');
  assert.equal(all.employerCount, 4);

  const one = await extract({ unlinkedSecondEmployer: true });
  assert.equal(one.linkedEmployers, 3);
  assert.equal(one.employerCount, 4, 'the unlinked employer still counts toward the total');
});

// ------------------------------------------------------------------ skills

test('reads skill names from a card that renders no <li>', async () => {
  const p = await extract();
  assert.deepEqual(p.skills, ['Distributed Systems', 'Developer Tooling']);
  assert.equal(p.skillsDeclaredCount, 31, 'declared count comes from the heading');
});

test('provenance rows and "Show all" are not treated as skills', async () => {
  const p = await extract();
  assert.ok(!p.skills!.some((s) => /experiences at/i.test(s)));
  assert.ok(!p.skills!.some((s) => /^Show all$/i.test(s)));
});

// ---------------------------------------------------------------- activity

test('activity timestamps parse even when textContent runs words together', async () => {
  const p = await extract();
  // "Visit my website" + "4mo" becomes "website4mo"; a leading \b would never match.
  assert.equal(p.activity?.lastPostDaysAgo, 122, '4mo ≈ 122 days');
  assert.equal(p.activity?.postsLast30d, 0);
});

// --------------------------------------------------------- other sections

test('reads About with the heading and the truncation affordance stripped', async () => {
  const p = await extract();
  assert.ok(!p.about!.startsWith('About'));
  assert.ok(!/…\s*more$/.test(p.about!));
  assert.match(p.about!, /^Our release train/);
});

test('reads education and recommendations', async () => {
  const p = await extract();
  assert.equal((p.education || []).length, 1);
  assert.equal(p.recommendationsReceived, 3);
});

test('featured items are counted', async () => {
  const p = await extract();
  assert.equal((p.featured || []).length, 1);
});

// --------------------------------------------------------------- vanity URL

test('distinguishes a vanity URL from a generated one', async () => {
  assert.equal((await extract({}, '/in/dana-okonkwo/')).customUrl, true);
  assert.equal((await extract({}, '/in/dana-okonkwo-8a41f2b9/')).customUrl, false);
});

// -------------------------------------------------------------- abstention
// The contract the whole engine rests on: a missing section must be reported as
// unobserved, never as an empty one. Reproduces the out-of-network profile case,
// where LinkedIn renders only the top card.

test('missing sections are omitted from `observed`, not reported as empty', async () => {
  const p = await extract({
    withAbout: false, withSkills: false, withFeatured: false,
    withRecommendations: false, withEducation: false, withExperience: false,
  });
  for (const field of ['about', 'experience', 'skills', 'featured', 'education', 'recommendationsReceived']) {
    assert.ok(!p.observed!.includes(field), `"${field}" was not on the page, so must not be observed`);
  }
  assert.ok(p.observed!.includes('headline'), 'the top card was present');
  assert.equal(p.about, undefined);
  assert.equal(p.experience, undefined);
});

test('a present but empty section IS observed', async () => {
  const p = await extract();
  assert.ok(p.observed!.includes('about'));
  assert.ok(p.observed!.includes('experience'));
});

// ------------------------------------------------------- lazy-load detection
// The live failure this exists to prevent: at `document_idle` a real profile had
// only the top card, About and Activity in the DOM. Six cards were absent, eleven
// checks abstained, and the panel reported a score "really between 35 and 88" —
// computed from a headline and an About. The content script now walks the page to
// provoke hydration before it scores, and this is the signal it acts on.

test('missingCards reports the cards absent from the DOM', async () => {
  const { missingCards } = await load({
    withSkills: false, withFeatured: false, withRecommendations: false,
    withEducation: false, withExperience: false,
  });
  const missing = missingCards();
  for (const name of ['skills', 'featured', 'recommendations', 'education', 'experience']) {
    assert.ok(missing.includes(name), `"${name}" is not on the page and must be reported missing`);
  }
});

test('missingCards is empty once every card is present', async () => {
  const { missingCards } = await load({});
  assert.deepEqual(missingCards(), [], 'a fully rendered profile has nothing left to wait for');
});
