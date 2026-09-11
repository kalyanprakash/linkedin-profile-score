import test from 'node:test';
import assert from 'node:assert/strict';

import { scoreProfile, scoreAllPersonas } from '../src/score.ts';
import { PERSONAS } from '../src/personas.ts';
import { ALL_RULES } from '../src/rules/index.ts';
import { stem, termPresent, candidateTerms } from '../src/rules/util.ts';
import type { PersonaId, Profile } from '../src/types.ts';
import { kalyan, kalyanLive, strong, empty, median } from './fixtures/profiles.ts';

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
      // Brackets the UNCAPPED score: a cap is a separate adjustment, not uncertainty.
      const { uncappedScore, range } = scoreProfile(profile, p);
      assert.ok(range.floor <= uncappedScore + 1, `floor ${range.floor} above ${uncappedScore}`);
      assert.ok(range.ceiling >= uncappedScore - 1, `ceiling ${range.ceiling} below ${uncappedScore}`);
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
  // Regression for the abstention bug. Compared on `floor`, not the point
  // estimate: the point estimate normalises over what was seen, so a profile with
  // six observed fields is not on the same scale as a fully-read one. The floor —
  // which charges every unread check as a miss — is the comparable number, and it
  // is why `range` exists.
  const complete = scoreProfile(median, 'job_search');
  const partial = scoreProfile(kalyan, 'job_search');
  assert.equal(partial.unobservedPoints > 0, true, 'fixture must be a partial extraction');
  assert.ok(
    complete.range.floor > partial.range.floor,
    `median floor ${complete.range.floor} must exceed partial floor ${partial.range.floor}`,
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

test('candidate terms exclude seniority words from job titles', () => {
  const p: Profile = {
    experience: [
      { title: 'Director of Engineering', company: 'X' },
      { title: 'Senior Engineering Manager', company: 'X' },
    ],
    skills: ['Kubernetes'],
    observed: ['experience', 'skills'],
  };
  const terms = candidateTerms(p);
  for (const noise of ['director', 'senior', 'manager']) {
    assert.ok(!terms.includes(noise), `"${noise}" is rank, not expertise — should not be a candidate term`);
  }
  assert.ok(terms.includes('engineering'), 'the domain word should survive');
});

// ----------------------------------------------------------- observations

test('observations are reported but never move the score', () => {
  const withSignal: Profile = { ...kalyanLive };
  const withoutSignal: Profile = {
    ...kalyanLive,
    photo: { ...kalyanLive.photo, hasFrame: false },
    openToWork: { active: false },
  };
  for (const p of PERSONA_IDS) {
    const a = scoreProfile(withSignal, p);
    const b = scoreProfile(withoutSignal, p);
    assert.equal(a.score, b.score, `${p}: an unscored observation changed the score`);
  }
  assert.ok(
    scoreProfile(withSignal, 'job_search').observations.some((o) => o.id === 'observation.open_to_work'),
    'the signal should still be reported',
  );
  assert.equal(scoreProfile(withoutSignal, 'job_search').observations.length, 0);
});

test('no rule prices a contested claim', () => {
  // Guard: if a future rule scores the open-to-work signal, this fails.
  assert.ok(!ALL_RULES.some((r) => /frame|open_to_work|opentowork/i.test(r.id)));
});

// ------------------------------------------------------------- archetypes
// Calibration guards for career shapes unlike the reference profiles. These catch
// a rubric that works on one kind of career and misjudges another.

test('every archetype lands in a defensible band', async () => {
  const { ARCHETYPES } = await import('./fixtures/archetypes.ts');
  for (const [name, profile] of Object.entries(ARCHETYPES)) {
    for (const p of PERSONA_IDS) {
      const s = scoreProfile(profile, p).score;
      assert.ok(s >= 45 && s <= 90, `${name}/${p} scored ${s}; these are decent profiles, expected 45..90`);
    }
  }
});

test('a thin description scores above a blank one', async () => {
  // Regression: description coverage used a hard 20-word threshold, so an 18-word
  // description scored identically to an empty string. That hit short histories
  // hardest, where one partly-written role is the whole section.
  const base: Profile = {
    experience: [{ title: 'Engineer', company: 'X', current: true, description: '' }],
    observed: ['experience'],
  };
  const thin: Profile = {
    experience: [{ ...base.experience![0], description: 'Ran analysis across forty load cases and rewrote the reporting template the team still uses.' }],
    observed: ['experience'],
  };
  const blankRatio = scoreProfile(base, 'job_search').rules.find((r) => r.id === 'experience.description_coverage')!.ratio;
  const thinRatio = scoreProfile(thin, 'job_search').rules.find((r) => r.id === 'experience.description_coverage')!.ratio;
  assert.equal(blankRatio, 0);
  assert.ok(thinRatio > 0.2 && thinRatio < 1, `thin description should earn partial credit, got ${thinRatio}`);
});

test('repeated similar roles are not punished for verb variety', async () => {
  // Regression: outcome language counted DISTINCT verbs across the whole section,
  // so a contractor doing the same job twelve times scored as if none of it were
  // an outcome.
  const desc = 'Rebuilt the ingestion layer and cut warehouse spend 38% while halving nightly run time.';
  const repeated: Profile = {
    experience: Array.from({ length: 5 }, (_, i) => ({
      title: 'Data Engineer (contract)', company: `Client ${i}`, dateRange: '2024 - 2024', description: desc,
    })),
    observed: ['experience'],
  };
  const rule = scoreProfile(repeated, 'job_search').rules.find((r) => r.id === 'experience.outcome_language')!;
  assert.equal(rule.ratio, 1, `all five roles lead with an outcome, got ${rule.ratio}`);
});

test('keyword reinforcement is reachable without naming every skill', async () => {
  const p: Profile = {
    headline: 'Data Engineer | Airflow and dbt',
    experience: [{ title: 'Data Engineer', company: 'X', description: 'Rebuilt the airflow and dbt pipelines feeding the snowflake warehouse for the analytics team.' }],
    skills: ['Airflow', 'dbt', 'Snowflake', 'Python', 'SQL', 'Terraform', 'ETL', 'Data Engineering'],
    observed: ['headline', 'experience', 'skills'],
  };
  const rule = scoreProfile(p, 'job_search').rules.find((r) => r.id === 'keywords.reinforcement')!;
  // The property that matters is reachability: naming a realistic share of your
  // skills in prose must score well, not be treated as near-total failure.
  assert.ok(rule.ratio >= 0.7, `naming 3 of 8 skills in prose should score well, got ${rule.ratio}`);
});

// ------------------------------------------------------------------- caps

test('a blocking gap caps the score and says why', () => {
  // Strong everywhere except that no role is described. Points alone read this as
  // "solid"; a recruiter cannot shortlist it.
  const blankExperience: Profile = {
    ...strong,
    experience: strong.experience!.map((e) => ({ ...e, description: '' })),
  };
  const r = scoreProfile(blankExperience, 'job_search');
  assert.ok(r.caps.length > 0, 'a blank experience section must cap job search');
  assert.equal(r.caps[0].ruleId, 'experience.description_coverage');
  assert.ok(r.score < r.uncappedScore, `capped ${r.score} should be below uncapped ${r.uncappedScore}`);
  assert.ok(r.score <= 55, `expected the floor to bind, got ${r.score}`);
  assert.ok(r.caps[0].because.length > 20, 'a cap must explain itself in plain language');
});

test('a complete profile is never capped', () => {
  for (const p of PERSONA_IDS) {
    const r = scoreProfile(strong, p);
    assert.equal(r.caps.length, 0, `${p} capped a profile with no blocking gap`);
    assert.equal(r.score, r.uncappedScore);
  }
});

test('caps are graded, not a cliff', () => {
  // Halfway-written experience must cap roughly halfway, not fall off an edge.
  const half: Profile = {
    ...strong,
    experience: strong.experience!.map((e, i) => (i === 0 ? { ...e, description: '' } : e)),
  };
  const none: Profile = {
    ...strong,
    experience: strong.experience!.map((e) => ({ ...e, description: '' })),
  };
  const halfScore = scoreProfile(half, 'job_search');
  const noneScore = scoreProfile(none, 'job_search');
  assert.ok(
    noneScore.score < halfScore.score,
    `no descriptions (${noneScore.score}) must score below some (${halfScore.score})`,
  );
  if (halfScore.caps.length) {
    assert.ok(halfScore.caps[0].ceiling > noneScore.caps[0].ceiling, 'ceiling must scale with the ratio');
  }
});

test('an abstained blocking check never caps', () => {
  // The out-of-network case: experience could not be read at all. We cannot claim
  // it is missing, so no cap — the range carries the uncertainty instead.
  const unreadable: Profile = {
    headline: 'Chief Executive Officer at Someone Else Ltd',
    photo: { present: true },
    observed: ['headline', 'photo'],
  };
  const r = scoreProfile(unreadable, 'job_search');
  assert.equal(r.caps.length, 0, 'an unreadable section must not be treated as an absent one');
  assert.ok(r.unobservedPoints > 0);
});

test('a cap worth less than three points is not reported at all', async () => {
  const { ARCHETYPES } = await import('./fixtures/archetypes.ts');
  const ALL_FIXTURES: Profile[] = [
    ...Object.values(ARCHETYPES), strong, median, kalyan, kalyanLive, empty,
    // The live reading that produced the one-point cap: everything below About
    // unread, which is what the lazy-load bug left the extractor with.
    (() => {
      const p: Profile = structuredClone(kalyanLive);
      const unread = ['experience', 'employerCount', 'education', 'skills', 'featured', 'recommendationsReceived'];
      p.observed = (kalyanLive.observed ?? []).filter((k) => !unread.includes(k));
      return p;
    })(),
  ];
  // From the live panel: "Capped at 58 — would otherwise be 59". A one-point
  // ceiling given a red block and first position in the advice reads as a crisis
  // and is noise. Dropped rather than applied quietly, because a cap the panel
  // does not explain is the invisible limit this whole design exists to avoid.
  for (const profile of ALL_FIXTURES) {
    for (const p of PERSONA_IDS) {
      const r = scoreProfile(profile, p);
      for (const cap of r.caps) {
        assert.ok(
          r.uncappedScore - cap.ceiling >= 3,
          `${p}: reported a cap at ${cap.ceiling} against an uncapped ${r.uncappedScore} — too small to mean anything`,
        );
      }
      // And whenever no cap is reported, the score must be the uncapped one.
      // Otherwise dropping the cap would leave a ceiling with nothing explaining it.
      if (r.caps.length === 0) {
        assert.equal(r.score, r.uncappedScore, `${p}: score is capped but no cap is reported`);
      }
    }
  }
});

test('every blocking gap names a rule that exists', () => {
  const ids = new Set(ALL_RULES.map((r) => r.id));
  for (const p of Object.values(PERSONAS)) {
    for (const gap of p.blocking ?? []) {
      assert.ok(ids.has(gap.ruleId), `persona "${p.id}" blocks on unknown rule "${gap.ruleId}"`);
      assert.ok(gap.floor >= 40 && gap.floor <= 75, `floor ${gap.floor} for ${gap.ruleId} is outside 40..75`);
    }
  }
});

test('blocking stays rare — at most two per persona', () => {
  // If everything blocks, nothing does. Importance belongs in weights.
  for (const p of Object.values(PERSONAS)) {
    assert.ok((p.blocking ?? []).length <= 2, `persona "${p.id}" declares ${(p.blocking ?? []).length} blocking gaps`);
  }
});

test('CTA detection covers the indirect phrasings people actually use', async () => {
  // Regression: a narrow pattern list capped the sales score of profiles closing
  // with a plain invitation. Once a check is a blocking gap, a false negative is
  // no longer a couple of points — it drags the whole score to a ceiling.
  const { hasCta } = await import('../src/text.ts');
  for (const yes of [
    'Always glad to hear from people working on ICU staffing or clinical education.',
    'Happy to talk to anyone considering the same switch.',
    'If you run a practice and your recall list lives in a spreadsheet, I would like to hear from you.',
    'Feel free to drop me a line.',
  ]) assert.ok(hasCta(yes), `should detect a CTA in: ${yes.slice(0, 50)}`);

  for (const no of [
    'Looking for a graduate role in thermal or structural engineering.',
    'My expertise lies in fostering high-performing teams.',
  ]) assert.ok(!hasCta(no), `should not see a CTA in: ${no.slice(0, 50)}`);
});

// ----------------------------------------------------------------- actions

test('every action references rules that exist', async () => {
  const { ACTIONS } = await import('../src/actions.ts');
  const ids = new Set(ALL_RULES.map((r) => r.id));
  for (const a of ACTIONS) {
    assert.ok(a.rules.length > 0, `${a.id} moves no rules`);
    for (const id of a.rules) assert.ok(ids.has(id), `action "${a.id}" names unknown rule "${id}"`);
    assert.equal(typeof a.consequence, 'function', `${a.id} consequence must adapt to the profile`);
  }
});

test('no action lowers the score on any profile — a negative delta is a rubric bug', async () => {
  // The single most valuable guard here. A negative delta means the rubric would
  // advise against a genuine improvement, which is exactly the failure that made a
  // better headline score -1 before.
  const { advise } = await import('../src/actions.ts');
  const { ARCHETYPES } = await import('./fixtures/archetypes.ts');
  const corpus: Record<string, Profile> = { ...ARCHETYPES, strong, median, kalyanLive, empty };
  for (const [name, profile] of Object.entries(corpus)) {
    for (const p of PERSONA_IDS) {
      const { suspect } = advise(profile, p);
      assert.equal(
        suspect.length, 0,
        `${name}/${p}: ${suspect.map((s) => `${s.action.id} (${s.delta})`).join(', ')}`,
      );
    }
  }
});

test('the one thing is never the compounding habit, and vice versa', async () => {
  const { advise } = await import('../src/actions.ts');
  const { ARCHETYPES } = await import('./fixtures/archetypes.ts');
  for (const profile of [...Object.values(ARCHETYPES), median, kalyanLive]) {
    for (const p of PERSONA_IDS) {
      const a = advise(profile, p);
      if (a.oneThing) assert.notEqual(a.oneThing.class, 'compounding', 'a practice is not a one-off fix');
      if (a.habit) assert.equal(a.habit.class, 'compounding');
    }
  }
});

test('a blocking action outranks a higher-scoring polish action', async () => {
  const { advise } = await import('../src/actions.ts');
  // Blank current role (blocking for job search) plus no banner (polish).
  const p: Profile = {
    ...strong,
    experience: strong.experience!.map((e, i) => (i === 0 ? { ...e, description: '' } : e)),
    banner: { present: false },
  };
  const a = advise(p, 'job_search');
  assert.ok(a.oneThing, 'should recommend something');
  assert.equal(a.oneThing!.class, 'blocking');
  assert.notEqual(a.oneThing!.action.id, 'add_banner');
});

test('actions that would change nothing are not recommended', async () => {
  const { advise } = await import('../src/actions.ts');
  const a = advise(strong, 'job_search');
  const ids = [a.oneThing, a.habit, ...a.alsoWorthDoing].filter(Boolean).map((r) => r!.action.id);
  // The strong profile already has a banner and a vanity URL.
  assert.ok(!ids.includes('add_banner'));
  assert.ok(!ids.includes('claim_vanity_url'));
});

test('the simulated fix is built from the person own vocabulary', async () => {
  // Regression: a canned platform-engineering headline scored a mechanical
  // engineering graduate LOWER than their real one, because it destroyed skill
  // alignment. The simulation must measure writing quality, not a career change.
  const { ACTIONS } = await import('../src/actions.ts');
  const { ARCHETYPES } = await import('./fixtures/archetypes.ts');
  const action = ACTIONS.find((x) => x.id === 'rewrite_headline')!;
  const copy = structuredClone(ARCHETYPES.nurse);
  action.apply(copy);
  assert.match(copy.headline!, /Nurse|Critical Care|Sepsis/i, `headline drifted out of domain: ${copy.headline}`);
  assert.ok(
    scoreProfile(copy, 'job_search').score >= scoreProfile(ARCHETYPES.nurse, 'job_search').score,
    'a rewritten headline must not score below the original',
  );
});

test('deltas are measured, not stored — re-running gives the same answer', async () => {
  const { advise } = await import('../src/actions.ts');
  const a = JSON.stringify(advise(kalyanLive, 'job_search').oneThing?.delta);
  const b = JSON.stringify(advise(kalyanLive, 'job_search').oneThing?.delta);
  assert.equal(a, b);
});
