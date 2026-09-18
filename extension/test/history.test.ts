import test from 'node:test';
import assert from 'node:assert/strict';

import { record, progress, ago, type History } from '../src/history.ts';
import { RUBRIC_VERSION } from '../../packages/engine/src/version.ts';

/**
 * Local score history — the answer to "does the loop work" that does not require
 * telling anyone anything. Pure functions, so they test without storage.
 */

const day = (d: string) => new Date(`${d}T12:00:00Z`);

test('a first reading is kept and shows no progress yet', () => {
  const h = record({}, 'job_search', 49, day('2026-09-01'));
  assert.equal(h.job_search?.length, 1);
  assert.equal(progress(h, 'job_search', 49), undefined, 'nothing to compare against');
});

test('progress is measured from the earliest comparable reading', () => {
  let h: History = {};
  h = record(h, 'job_search', 49, day('2026-09-01'));
  h = record(h, 'job_search', 56, day('2026-09-05'));
  const p = progress(h, 'job_search', 61);
  assert.ok(p);
  assert.deepEqual({ from: p!.from, to: p!.to, delta: p!.delta }, { from: 49, to: 61, delta: 12 });
  assert.equal(p!.since, '2026-09-01', 'measured from the start, not the last reading');
});

test('rescanning without changing anything adds nothing', () => {
  let h: History = {};
  h = record(h, 'job_search', 49, day('2026-09-01'));
  for (let i = 0; i < 20; i++) h = record(h, 'job_search', 49, day('2026-09-01'));
  assert.equal(h.job_search?.length, 1, 'an unchanged rescan is not an event');
});

test('an afternoon of edits reads as one move, not a dozen', () => {
  let h: History = {};
  h = record(h, 'job_search', 49, day('2026-09-01'));
  h = record(h, 'job_search', 52, day('2026-09-05'));
  h = record(h, 'job_search', 55, day('2026-09-05'));
  h = record(h, 'job_search', 61, day('2026-09-05'));
  assert.equal(h.job_search?.length, 2, 'same-day readings collapse to the latest');
  assert.equal(h.job_search?.[1].s, 61);
});

test('a rubric change is never reported as the profile getting worse', () => {
  // The case this exists for. This profile went 57 → 49 in one afternoon because a
  // lazy-loading bug was fixed, not because anything about it changed. Telling its
  // owner they lost eight points would be a lie the tool told itself first.
  const stale: History = { job_search: [{ s: 57, d: '2026-09-10', v: 'older-rubric' }] };
  assert.equal(progress(stale, 'job_search', 49), undefined,
    'readings from a different rubric are not comparable');

  // And once a reading exists under the current rubric, comparison resumes.
  const fresh = record(stale, 'job_search', 49, day('2026-09-11'));
  const p = progress(fresh, 'job_search', 61);
  assert.ok(p && p.from === 49, `expected to compare against the current-rubric reading, got ${JSON.stringify(p)}`);
});

test('each goal keeps its own history', () => {
  let h: History = {};
  h = record(h, 'job_search', 49, day('2026-09-01'));
  h = record(h, 'sales', 30, day('2026-09-01'));
  assert.equal(progress(h, 'job_search', 60)?.delta, 11);
  assert.equal(progress(h, 'sales', 60)?.delta, 30);
});

test('history stays small', () => {
  let h: History = {};
  for (let i = 0; i < 200; i++) h = record(h, 'job_search', i % 90, new Date(Date.UTC(2026, 0, 1 + i, 12)));
  assert.ok((h.job_search?.length ?? 0) <= 20, `history grew to ${h.job_search?.length}`);
});

test('a drop is reported honestly, not hidden', () => {
  // If someone deletes half their profile the number should say so. A progress
  // feature that only ever shows good news is a flattery feature.
  let h: History = {};
  h = record(h, 'job_search', 70, day('2026-09-01'));
  const p = progress(h, 'job_search', 55);
  assert.equal(p?.delta, -15);
});

test('every stored reading carries the current rubric version', () => {
  const h = record({}, 'job_search', 49, day('2026-09-01'));
  assert.equal(h.job_search?.[0].v, RUBRIC_VERSION);
});

test('elapsed time reads as a person would say it', () => {
  const now = new Date('2026-09-18T12:00:00Z');
  assert.equal(ago('2026-09-18', now), 'earlier today');
  assert.equal(ago('2026-09-17', now), 'yesterday');
  assert.equal(ago('2026-09-15', now), '3 days ago');
  assert.match(ago('2026-08-20', now), /weeks ago/);
  assert.match(ago('2026-06-18', now), /months ago/);
});
