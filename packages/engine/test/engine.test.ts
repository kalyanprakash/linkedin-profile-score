import test from 'node:test';
import assert from 'node:assert/strict';

import { scoreProfile, scoreAllPersonas } from '../src/score.ts';
import { PERSONAS } from '../src/personas.ts';
import { ALL_RULES } from '../src/rules/index.ts';
import { stem, termPresent } from '../src/rules/util.ts';
import type { PersonaId, Profile } from '../src/types.ts';
import { kalyan, strong, empty, median } from './fixtures/profiles.ts';

const PERSONA_IDS = Object.keys(PERSONAS) as PersonaId[];

// ---------------------------------------------------------------- structure

test('every persona weight key refers to a real rule', () => {
  const ids = new Set(ALL_RULES.map((r) => r.id));
  for (const p of Object.values(PERSONAS)) {
    for (const key of Object.keys(p.weights)) {
      assert.ok(ids.has(key), `persona "${p.id}" weights unknown rule "${key}"`);
    }
  }
});

test('rule ids are unique', () => {
  const ids = ALL_RULES.map((r) => r.id);
  assert.equal(new Set(ids).size, ids.length);
});

// ------------------------------------------------------------------ bounds

test('scores stay within 0..100 and produce no NaN', () => {
  for (const profile of [kalyan, strong, empty, median]) {
    for (const p of PERSONA_IDS) {
      const r = scoreProfile(profile, p);
      assert.ok(Number.isFinite(r.score), 'score is finite');
      assert.ok(r.score >= 0 && r.score <= 100, `score ${r.score} out of range`);
      for (const rule of r.rules) {
        assert.ok(Number.isFinite(rule.earned) && Number.isFinite(rule.available));
        assert.ok(rule.earned <= rule.available + 0.05, `${rule.id} earned more than available`);
      }
    }
  }
});

test('range brackets the point estimate', () => {
  for (const profile of [kalyan, strong, empty, median]) {
    for (const p of PERSONA_IDS) {
      const { score, range } = scoreProfile(profile, p);
      assert.ok(range.floor <= score + 1, `floor ${range.floor} above score ${score}`);
      assert.ok(range.ceiling >= score - 1, `ceiling ${range.ceiling} below score ${score}`);
    }
  }
});

test('a fully observed profile has no uncertainty band', () => {
  const r = scoreProfile(strong, 'job_search');
  assert.equal(r.unobservedPoints, 0);
  assert.equal(r.range.floor, r.score);
  assert.equal(r.range.ceiling, r.score);
});

// ------------------------------------------------------------- calibration
// These are the guard rails. A rule change that moves a fixture out of its band
// is a deliberate recalibration, not a passing build.

test('empty profile scores zero on every persona', () => {
  const all = scoreAllPersonas(empty);
  for (const p of PERSONA_IDS) assert.equal(all[p], 0, `${p} should be 0`);
});

test('strong profile scores 80+ on every persona', () => {
  const all = scoreAllPersonas(strong);
  for (const p of PERSONA_IDS) {
    assert.ok(all[p] >= 80, `${p} scored ${all[p]}, expected >= 80`);
  }
});

test('median profile lands mid-range, not at either extreme', () => {
  const all = scoreAllPersonas(median);
  for (const p of PERSONA_IDS) {
    assert.ok(all[p] >= 25 && all[p] <= 60, `${p} scored ${all[p]}, expected 25..60`);
  }
});

test('ordering holds: strong > median > empty', () => {
  for (const p of PERSONA_IDS) {
    const s = scoreProfile(strong, p).score;
    const m = scoreProfile(median, p).score;
    const e = scoreProfile(empty, p).score;
    assert.ok(s > m && m > e, `${p}: ${s} > ${m} > ${e} failed`);
  }
});

test('a complete average profile outranks a barely-populated one', () => {
  // Regression for the abstention bug: normalising over observed rules alone
  // once made a mostly-invisible profile outscore a complete mediocre one.
  assert.ok(
    scoreProfile(median, 'job_search').score > scoreProfile(kalyan, 'job_search').score,
    'median must outrank the blank-role profile',
  );
});

// --------------------------------------------------------- partial credit

test('partial credit actually happens — scores are not all-or-nothing', () => {
  const r = scoreProfile(median, 'job_search');
  const partial = r.rules.filter((x) => x.ratio > 0 && x.ratio < 1);
  assert.ok(partial.length >= 3, `expected several partial results, got ${partial.length}`);
});

test('no populated profile collapses to zero the way the competitor scored it', () => {
  for (const p of PERSONA_IDS) {
    assert.ok(scoreProfile(kalyan, p).score > 10, `${p} produced a near-zero score on a real profile`);
  }
});

// ---------------------------------------------------------------- abstention

test('unobserved fields abstain rather than scoring zero', () => {
  const r = scoreProfile(kalyan, 'job_search');
  const abstainedIds = new Set(r.abstained.map((a) => a.id));
  assert.ok(abstainedIds.has('about.present'), 'About was never captured, so it must abstain');
  assert.ok(r.unobservedPoints > 0);
  assert.ok(!r.rules.some((x) => x.id.startsWith('about.')), 'no About rule should be scored');
});

test('an observed-but-empty field does score zero', () => {
  const r = scoreProfile(empty, 'job_search');
  const about = r.rules.find((x) => x.id === 'about.present');
  assert.ok(about, 'About was observed, so it must be scored');
  assert.equal(about!.ratio, 0);
});

test('keyword reinforcement is not circular', () => {
  // Terms are harvested from titles and skills; if reinforcement were measured
  // against a corpus containing those, an empty profile would score full marks.
  const thin: Profile = {
    headline: 'Software Development Manager @ Amazon Web Services',
    experience: [{ title: 'Software Development Manager', company: 'AWS', description: '' }],
    skills: ['Distributed Systems', 'Kubernetes', 'Go', 'Terraform', 'Observability'],
    observed: ['headline', 'experience', 'skills'],
  };
  const rule = scoreProfile(thin, 'job_search').rules.find((r) => r.id === 'keywords.reinforcement');
  assert.ok(rule, 'rule should run with five terms available');
  assert.equal(rule!.ratio, 0, 'nothing is written, so nothing is reinforced');
});

// ------------------------------------------------------------ persona shape

test('personas disagree — the same profile scores differently by goal', () => {
  const all = scoreAllPersonas(kalyan);
  const spread = Math.max(...Object.values(all)) - Math.min(...Object.values(all));
  assert.ok(spread >= 5, `personas produced near-identical scores (spread ${spread})`);
});

test('marketing furniture is weighted down for job search', () => {
  // No banner and no Featured should cost a salesperson far more than a job seeker.
  const withAssets: Profile = { ...strong };
  const withoutAssets: Profile = {
    ...strong,
    banner: { present: false },
    featured: [],
  };
  const jobHit = scoreProfile(withAssets, 'job_search').score - scoreProfile(withoutAssets, 'job_search').score;
  const salesHit = scoreProfile(withAssets, 'sales').score - scoreProfile(withoutAssets, 'sales').score;
  assert.ok(salesHit > jobHit, `sales penalty ${salesHit} should exceed job-search penalty ${jobHit}`);
});

// -------------------------------------------------------------- determinism

test('scoring is deterministic', () => {
  const a = JSON.stringify(scoreProfile(median, 'job_search'));
  const b = JSON.stringify(scoreProfile(median, 'job_search'));
  assert.equal(a, b);
});

test('every failing rule offers a fix', () => {
  for (const profile of [median, kalyan, empty]) {
    for (const rule of scoreProfile(profile, 'job_search').rules) {
      if (rule.ratio < 1) {
        assert.ok(rule.fix && rule.fix.length > 10, `${rule.id} scored ${rule.ratio} with no usable fix`);
      }
    }
  }
});

test('every scored rule reports what it actually saw', () => {
  for (const rule of scoreProfile(median, 'job_search').rules) {
    assert.ok(rule.observed && rule.observed.length > 3, `${rule.id} has no observation`);
  }
});

// ------------------------------------------------------------------ stemming

test('stemming is stable across inflections', () => {
  const pairs: [string, string][] = [
    ['engineering', 'engineers'],
    ['management', 'manager'],
    ['development', 'developer'],
    ['systems', 'system'],
    ['operations', 'operation'],
  ];
  for (const [a, b] of pairs) {
    assert.equal(stem(a), stem(b), `"${a}" and "${b}" must stem alike`);
  }
});

test('multi-word terms match prose that uses their words separately', () => {
  const prose = 'Own platform, infrastructure and developer productivity across 6 teams and 84 engineers.';
  assert.ok(termPresent(prose, 'Platform Engineering'), 'should match across inflections');
  assert.ok(termPresent(prose, 'Developer Productivity'));
  assert.ok(!termPresent(prose, 'Kubernetes'), 'absent term must not match');
});
