import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { buildProfileHtml } from './fixtures/dom.ts';

/**
 * Panel smoke tests. The content script reads globals and appends to document.body,
 * so each case installs a jsdom window and imports the module fresh.
 */
async function mountPanel(opts = {}) {
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
  g.chrome = undefined; // storage unavailable; the panel must still work
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
