# Profile Score

A free LinkedIn profile audit. Scores your profile against what you are actually
optimising for, entirely in your browser — no server, no account, no upload.

Paid tools score a profile, return a number designed to alarm, and sell the rewrite.
Their scoring tends to share two properties: every check is pass/fail, so a real
profile with real gaps collapses toward zero; and one rubric written for a
solopreneur selling services gets applied to someone job hunting. This fixes both,
and stays free by never needing a server.

## What makes the scoring different

**Partial credit.** Every check returns a ratio in `0..1`, never pass/fail. A
headline using 75 of its 220 characters scores 0.75 on that check, not zero.

**The goal changes the weights.** Thirty checks, re-weighted across five goals, each
column summing to 100. Experience is 32% of a job seeker's score and 17% of an
audience-builder's. Posting is 2% for a job hunt and 12% for building an audience.
That difference is most of why a one-size rubric misjudges people.

**Abstention.** A check whose input could not be read is removed from the
denominator rather than scored zero — the difference between "you have no banner"
and "we could not see your banner". Because that inflates the point estimate, every
report also carries a floor and a ceiling.

**Blocking gaps cap the score.** Weights say how much something matters; a cap says
a reader cannot make the decision at all. If no role is described, a job-search
score cannot read as "solid" however good the rest is. Caps are graded, engage only
on genuine absence, are always explained, and always name the fix that lifts them —
and are dropped below a three-point bind, because "capped at 58, would otherwise be
59" is a red warning about nothing.

**Some things are reported, never priced.** Where the evidence is thin or the right
answer genuinely depends on the person — the #OpenToWork signal is the worked
example — the honest output is the fact and the trade-off, worth zero points.

**One action, not a to-do list.** The panel leads with a single recommendation,
chosen by class (blocking beats polish) and then by a *measured* delta: the fix is
applied to a copy of your profile and the whole thing re-scored. No effort
estimates anywhere. Compounding work — posting — gets its own slot rather than
competing with one-off fixes on points it cannot win.

## What it can and cannot see

Verified against the live DOM.

**Your own profile** renders every card — but not until you scroll to it. Measured on
a real profile: at `document_idle` the DOM held the top card, About and Activity and
nothing else. Experience, Education, Skills, Featured and Recommendations were simply
absent, eleven checks abstained, and the reported score was "really between 35 and 88"
off a headline and an About. So the content script walks the page itself before
scoring, waits for each card, and puts the scroll position back. Waiting passively for
a `MutationObserver` only works if the user scrolls, and asking them to in the panel
copy was the tool delegating its own job to the person reading the number.

**Other people's profiles are limited by LinkedIn, not by this code.** On a
3rd-degree connection only the top card and activity feed render at all — About,
Experience, Skills, Education, Featured and Recommendations are absent from the
page entirely. The extractor reports them unobserved, the engine abstains, and the
score comes back as a wide range rather than a fabricated low number. Checked
against a real out-of-network profile: six sections declined, zero false zeros.

So this is a **self-audit tool**. Auditing strangers cannot be built at any level of
effort without an account relationship that renders the sections.

## Layout

```
packages/engine/          pure scoring — no DOM, no network, no browser APIs
  src/types.ts            Profile shape, rule contract, report shape
  src/text.ts             deterministic text primitives
  src/personas.ts         per-goal weights and blocking gaps
  src/rules/              headline · about · experience · signals · profile
  src/observations.ts     reported, never scored
  src/actions.ts          what to do next, with measured deltas
  src/score.ts            runner, normalisation, uncertainty range, caps
extension/                Chrome + Firefox MV3
  src/extract.ts          the only file that knows LinkedIn's markup
  src/storage.ts          cross-browser storage, best-effort
  src/content.ts          the panel
```

The engine has no dependency on the extension and could back a paste-based web
version unchanged.

## Running it

```bash
npm install
npm test                              # 69 tests: engine, extractor, panel
npm run demo -- matrix                # every fixture against every goal
npm run demo -- live job_search       # a full report
npm run build:ext                     # → extension/dist and build/firefox
npm run watch                         # rebuild on save
```

**Chrome / Edge** — `chrome://extensions` → Developer mode → Load unpacked →
select `extension/`.

**Firefox** — `about:debugging` → This Firefox → Load Temporary Add-on → pick
`build/firefox/manifest.json`.

Then open your own `linkedin.com/in/…` page. The panel appears top-right. Fix
something, hit Rescan, and the next recommendation appears — the loop is the point.

## Testing

Three suites, and the calibration ones are the interesting part.

`packages/engine/test/fixtures/archetypes.ts` holds six fabricated profiles chosen
for the career shapes a scoring tool is most likely to misjudge: a contractor with
twelve short engagements, a career changer, a nurse, a profile that is all About and
no experience, a new graduate, and a founder whose own company has no LinkedIn page.
They have already caught several checks that looked like partial credit and behaved
as thresholds.

One test is worth naming: **no action may lower the score, on any fixture, for any
goal.** A negative delta means the rubric would advise against a genuine
improvement. That started as a real bug — a well-positioned headline scored one
point *below* the generic one it replaced.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). The most valuable contribution is fixing a
selector after LinkedIn ships a DOM change; everything that knows about their markup
lives in one file, and the fixture encodes every trap found so far.

## Licence

Apache-2.0. Use it, fork it, build on it commercially — the patent grant is why
Apache rather than MIT. No CLA: contributions are inbound=outbound.

## Guarantees

The built bundle contains no `fetch`, `XMLHttpRequest`, `WebSocket` or
`sendBeacon`. Profile data never leaves the browser. CI fails the build if any of
those ever appear, so the claim breaks loudly rather than quietly.

Not affiliated with or endorsed by LinkedIn Corporation.
