import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { buildProfileHtml } from './fixtures/dom.ts';

/**
 * Panel smoke tests. The content script reads globals and appends to document.body,
 * so each case installs a jsdom window and imports the module fresh.
 */
async function mountPanel(opts = {}, stubStorage?: (g: Record<string, unknown>) => void) {
  const dom = new JSDOM(`<!doctype html><html><body>${buildProfileHtml(opts)}</body></html>`, {
    url: 'https://www.linkedin.com/in/dana-okonkwo/',
  });
  const g = globalThis as Record<string, unknown>;
  g.window = dom.window;
  g.document = dom.window.document;
  g.location = dom.window.location;
  g.HTMLElement = dom.window.HTMLElement;
  g.HTMLImageElement = dom.window.HTMLImageElement;
  g.MutationObserver = dom.window.MutationObserver;
  g.chrome = undefined; // storage unavailable by default; the panel must still work
  stubStorage?.(g);
  // NB: do not alias global setTimeout to jsdom's — jsdom calls back into the
  // global one and the two recurse until the stack blows.

  await import(`../src/content.ts?t=${Math.random()}`);
  // whenReady runs synchronously when the top card already exists, but persona
  // loading is async, so yield.
  await new Promise((r) => setTimeout(r, 30));
  return dom;
}

test('the panel mounts and leads with one action', async () => {
  const dom = await mountPanel();
  const panel = dom.window.document.getElementById('lps-panel');
  assert.ok(panel, 'panel should mount');
  const score = panel!.querySelector('.lps-score');
  assert.ok(score && /^\d+$/.test(score.textContent!), `expected a numeric score, got "${score?.textContent}"`);
  assert.ok(panel!.querySelector('.lps-onething'), 'should render a single lead action');
  assert.ok(panel!.querySelector('.lps-ot-title')!.textContent!.length > 10);
  dom.window.close();
});

test('the panel works with chrome.storage unavailable', async () => {
  // Firefox, a locked-down profile, or a page where the API throws. The choice
  // just will not persist; the panel must still render.
  const dom = await mountPanel();
  assert.ok(dom.window.document.getElementById('lps-panel'));
  dom.window.close();
});

test('a goal selector is present with every persona', async () => {
  const dom = await mountPanel();
  const options = dom.window.document.querySelectorAll('.lps-select option');
  assert.equal(options.length, 5, 'all five goals should be selectable');
  dom.window.close();
});

test('the panel never renders an empty score or a bare rule id', async () => {
  const dom = await mountPanel();
  const text = dom.window.document.getElementById('lps-panel')!.textContent ?? '';
  assert.ok(!/undefined|NaN|\[object/.test(text), 'panel leaked a placeholder value');
  assert.ok(!/\b[a-z_]+\.[a-z_]+\b/.test(text.replace(/linkedin\.com|\d\.\d/g, '')), 'panel shows a raw rule id');
  dom.window.close();
});

test('the uncertainty note names the unread sections instead of counting checks', async () => {
  // "11 checks could not read their section" is not something a person can act on,
  // and it reads as a fault in the tool rather than a fact about the page. The
  // sections have LinkedIn's own names so they can be checked against the page.
  const dom = await mountPanel({
    withSkills: false, withFeatured: false, withRecommendations: false,
    withEducation: false, withExperience: false,
  });
  const note = dom.window.document.querySelector('.lps-note');
  assert.ok(note, 'a partial reading must carry the uncertainty note');
  const text = note!.textContent ?? '';
  for (const section of ['Experience', 'Education', 'Skills', 'Featured', 'Recommendations']) {
    assert.ok(text.includes(section), `the note should name ${section}; got "${text}"`);
  }
  assert.ok(!/\d+ checks could not read/.test(text), 'the note should not count checks');
  assert.ok(/between \d+ and \d+/.test(text), 'the note must still carry the range');
  dom.window.close();
});

test('a fully read profile shows no uncertainty note', async () => {
  const dom = await mountPanel();
  assert.equal(dom.window.document.querySelector('.lps-note'), null,
    'nothing was unread, so there is no uncertainty to report');
  dom.window.close();
});

test('the panel shows progress when there is a history to compare against', async () => {
  const { RUBRIC_VERSION } = await import('../../packages/engine/src/version.ts');
  const stored: Record<string, string> = {
    'lps.persona': 'job_search',
    'lps.history': JSON.stringify({
      job_search: [{ s: 40, d: '2026-09-01', v: RUBRIC_VERSION }],
    }),
  };
  const dom = await mountPanel({}, (g) => {
    g.chrome = {
      storage: {
        local: {
          get: (key: string) => Promise.resolve({ [key]: stored[key] }),
          set: (items: Record<string, string>) => { Object.assign(stored, items); return Promise.resolve(); },
        },
      },
    };
  });
  const moved = dom.window.document.querySelector('.lps-moved');
  assert.ok(moved, 'a comparable earlier reading must produce a progress line');
  assert.match(moved!.textContent ?? '', /you were 40/i);
  dom.window.close();
});

test('a reading under a different rubric produces no progress line', async () => {
  // The scoring changed, not the profile. Saying "-8" here would be a false claim
  // about the person's own work.
  const stored: Record<string, string> = {
    'lps.history': JSON.stringify({ job_search: [{ s: 90, d: '2026-09-01', v: 'some-older-rubric' }] }),
  };
  const dom = await mountPanel({}, (g) => {
    g.chrome = {
      storage: {
        local: {
          get: (key: string) => Promise.resolve({ [key]: stored[key] }),
          set: () => Promise.resolve(),
        },
      },
    };
  });
  assert.equal(dom.window.document.querySelector('.lps-moved'), null);
  dom.window.close();
});

test('a panel from an earlier page never redraws into a later one', async () => {
  // The lazy-load observer re-scans after a mutation. Under test every case swaps
  // the global document, so an earlier panel's observer used to count cards on the
  // NEW page, see a difference, and redraw into it 600ms later — replacing the
  // panel the current case was asserting on. That was the intermittent failure of
  // the progress test above. A run is now bound to the document it started on.
  const first = await mountPanel({ withFeatured: false, withRecommendations: false });
  const stored: Record<string, string> = {
    'lps.history': JSON.stringify({ job_search: [{ s: 40, d: '2026-09-01', v: (await import('../../packages/engine/src/version.ts')).RUBRIC_VERSION }] }),
  };
  const second = await mountPanel({}, (g) => {
    g.chrome = {
      storage: {
        local: {
          get: (key: string) => Promise.resolve({ [key]: stored[key] }),
          set: (items: Record<string, string>) => { Object.assign(stored, items); return Promise.resolve(); },
        },
      },
    };
  });
  assert.ok(second.window.document.querySelector('.lps-moved'), 'precondition: the second panel shows progress');

  // Provoke the first page's observer, then wait past its re-scan delay.
  first.window.document.body.append(first.window.document.createElement('p'));
  await new Promise((r) => setTimeout(r, 750));
  assert.ok(second.window.document.querySelector('.lps-moved'),
    'the second page was redrawn by the first page\'s observer');
  first.window.close();
  second.window.close();
});
