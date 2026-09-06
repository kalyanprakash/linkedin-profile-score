# Profile Score

A free LinkedIn profile audit. Scores a profile against what the person is actually
optimising for, entirely in their browser, with no server, no account and no upload.

## Why this exists

Paid tools score a profile, hand back a number designed to alarm, and sell the rewrite.
The scoring in those tools tends to share two properties:

- **Every check is all-or-nothing.** A real profile with real gaps collapses to zero,
  which is a sales trigger rather than a measurement.
- **One rubric for everyone.** Criteria written for a consultant selling services get
  applied to someone job hunting, so a perfectly good headline scores nothing.

This engine fixes both, and stays free by never needing a server.

## Design

**Partial credit.** Every rule returns a ratio in `0..1`, not a pass/fail. A headline
using 75 of its 220 characters scores 0.75 on that check, not zero.

**Persona weighting.** The same rule carries a different weight per goal. Missing a
banner costs a job seeker almost nothing and costs an inbound-sales profile a great
deal. Five personas ship: job search, passive findability, lead generation, audience
building, hiring.

**Abstention.** A rule whose input was never captured is removed from the denominator
rather than scored zero — the difference between "you have no banner" and "we could
not see your banner". Because abstaining inflates the point estimate, every report
also carries a `range`: the floor assumes every unmeasured check fails, the ceiling
assumes every one passes.

**Evidence, not verdicts.** Every check reports what it actually observed on the
profile, why that scored what it did, and a specific fix. No generic advice.

**Rules are data.** The rubric is a list of small pure functions with declared weights.
Arguing with it means editing one file, and the regression fixtures catch the drift.

## Layout

```
packages/engine/          pure scoring, no DOM, no network, no browser APIs
  src/types.ts            Profile shape, rule contract, report shape
  src/text.ts             deterministic text primitives (ramp, quant detection, …)
  src/personas.ts         per-persona rule weights
  src/rules/              headline · about · experience · signals
  src/score.ts            runner, normalisation, uncertainty range
  test/fixtures/          reference profiles, incl. a real one scored 0 elsewhere
  test/engine.test.ts     20 tests: structure, bounds, calibration, abstention
extension/                Chrome MV3 wrapper
  src/extract.ts          the only file that knows LinkedIn's markup
  src/content.ts          panel UI
```

The engine has no dependency on the extension. The same package can back a paste-based
web version without changes.

## Running it

```bash
npm install
npm test                              # 20 tests
npm run demo -- matrix                # every fixture against every persona
npm run demo -- kalyan job_search     # full report for one fixture
npm run build:ext                     # → extension/dist
```

Load the extension: `chrome://extensions` → Developer mode → Load unpacked →
select `extension/`. Then open any `linkedin.com/in/…` profile.

## What it can and cannot see

Verified against the live DOM on 2026-09-06.

**Your own profile** renders every card, and the extractor reads all of them.

**Other people's profiles are limited by LinkedIn, not by this code.** On a 3rd-degree
connection only the top card and activity feed render at all — About, Experience,
Skills, Education, Featured and Recommendations are simply absent from the page.
The extractor reports them as unobserved, so the engine abstains and the score comes
back as a wide range rather than a fabricated low number. Checked on a real
out-of-network profile: six sections correctly declined, zero false zeros.

The practical consequence is that this is a **self-audit tool**. Auditing strangers
is not a feature that can be built, at any level of effort, without a LinkedIn
account relationship that renders the sections.

## Current state

The engine is done and tested. The extractor is not verified against live LinkedIn
markup — the selectors in `extension/src/extract.ts` are written from LinkedIn's known
structure but need a pass on a real profile page. That file is deliberately the only
place selectors live, so DOM drift is a one-file fix.

Not yet built: activity and recommendations (separate URLs), the paste-based web
fallback, and the rewrite.

## Licence

Apache License 2.0. Use it, fork it, build on it commercially — the patent grant
is why Apache rather than MIT. No CLA: contributions are inbound=outbound under
the same licence.

## Guarantees

The content bundle contains no `fetch`, `XMLHttpRequest`, `WebSocket` or `sendBeacon`.
Profile data never leaves the browser. This is checked, not asserted.
