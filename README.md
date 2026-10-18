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

**The goal changes the weights.** Thirty-two checks, re-weighted across five goals, each
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

**The rubric reads the career the profile describes.** Career length, taken from the
union of the role date ranges, sets what is expected rather than what is earned. A
graduate is not asked for three recommendations; sixteen years with no role
described anywhere is capped, because a reader cannot assess it. Measured before it
was built: the rubric was already mostly stage-neutral, since every rule is a ratio
over what exists — "0 of 1 roles described", never "you only have 1 role".

**Evidence that is not a job counts.** Projects, publications, patents,
certifications, volunteering and coursework are read and scored. Without them a
graduate had no way to score well by doing exactly the right thing, which was a
defect in the rubric rather than a fact about them.

**Some things are reported, never priced.** Where the evidence is thin or the right
answer genuinely depends on the person — the #OpenToWork signal is the worked
example — the honest output is the fact and the trade-off, worth zero points.

**Your own progress, kept on your own machine.** The panel remembers what you
scored and shows the movement when you return. Every reading is tagged with the
rubric version that produced it and only compared within one version — this profile
went 57 → 49 in an afternoon when a lazy-loading bug was fixed, and reporting that
to its owner as eight points lost would have been a lie the tool told itself first.
It is also the honest answer to "does anyone act on this?": a question normally
answered with analytics, answered here by showing the person instead.

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
  src/rules/              headline · about · experience · signals · profile · portfolio
  src/bands.ts            what a score means to whoever reads the profile
  src/tenure.ts           career length, and what it changes
  src/observations.ts     reported, never scored
  src/actions.ts          what to do next, with measured deltas
  src/score.ts            runner, normalisation, uncertainty range, caps
extension/                Chrome + Firefox MV3
  src/extract.ts          the only file that knows LinkedIn's markup
  src/storage.ts          cross-browser storage, best-effort
  src/history.ts          local score history — never leaves the device
  src/content.ts          the panel
web/                      the same engine for a web page — one <script>, no build step
  src/index.ts            window.ProfileScoreWeb: score + the two importers
  src/pdf.ts              LinkedIn "Save to PDF" text items → Profile
  src/paste.ts            pasted sections → Profile
  src/lines.ts            date, duration and place patterns both importers share
  build.mjs               → web/dist/profile-score-web.js and .min.js
scripts/
  check-network.mjs       the no-network check every bundle must pass
```

The engine has no dependency on the extension. `web/` sits beside `extension/`
rather than under `packages/` because it is the same kind of thing: a consumer
of the engine with its own inputs and its own bundle, not a library anything
else imports.

## Running it

```bash
npm install
npm test                              # 184 tests: engine, extractor, panel, history, web
npm run demo -- matrix                # every fixture against every goal
npm run demo -- live job_search       # a full report
npm run build:ext                     # → extension/dist and build/firefox
npm run watch                         # rebuild on save
npm run build:web                     # → web/dist/profile-score-web.js (+ .min.js)
npm run check:web                     # fails if the web bundle can reach the network
```

**Chrome / Edge** — `chrome://extensions` → Developer mode → Load unpacked →
select `extension/`.

**Firefox** — `about:debugging` → This Firefox → Load Temporary Add-on → pick
`build/firefox/manifest.json`.

Then open your own `linkedin.com/in/…` page. The panel appears top-right. Fix
something, hit Rescan, and the next recommendation appears — the loop is the point.

## On a web page

`npm run build:web` emits one IIFE, readable and minified, that assigns:

```js
window.ProfileScoreWeb = {
  version,                     // the rubric version, from packages/engine/src/version.ts
  personas,                    // [{ id, label }] — the five goals
  defaultPersona,              // 'job_search'
  score(profile, persona?),    // → { report, advice } — the extension panel's own scoreProfile + advise
  fromLinkedInPdfItems(items), // [{ str, x, y, page, fontSize? }] from pdf.js → Profile
  fromPaste(sections),         // { name?, headline?, about?, experience?, education?,
                               //   skills?, certifications?, projects? } → Profile
};
```

Nothing is re-implemented: a profile scores the same on a page as in the
extension. What is new is the two importers, and the part of them that matters
is `observed`. Each one claims only what its input can actually show, so
everything else abstains and the report's range widens instead of the score
dropping:

- **PDF** never claims photo, banner, Featured, recommendations, activity,
  #OpenToWork or the custom URL — the export does not print them. It *does*
  claim About, Experience and Education as empty when their headings are
  missing, because LinkedIn leaves empty sections out of the export — but only
  from a read that proves itself: every page the footers promise is present,
  a main heading was recognised and the header above it is a header, and the
  sidebar's Contact section and headings all parsed. A non-English export or a
  truncated upload therefore comes back mostly unobserved, with a wide range,
  rather than as an empty profile. Top Skills are read for vocabulary but not
  counted, because the export lists only the first few. Certifications, honours
  and publications are a lower bound on the portfolio (projects may be left
  out), so the count is scored only once it already earns full marks, and
  their descriptions — never printed — are never scored. The reasoning for each
  field is at the top of `web/src/pdf.ts`.
- **Paste** claims a section exactly when its key is present — an empty string
  is "I have none", a missing key is "not asked". Send keys only for the fields
  the person was shown; send both `certifications` and `projects` if you ask
  about evidence at all, since one alone is only a lower bound.

For the PDF, pass pdf.js items as they come: `x` and `y` from `item.transform[4]`
and `[5]`, `page` from 1, and `fontSize` (e.g. `Math.hypot(transform[2],
transform[3])`) whenever you have it — font size is what separates the location
from the headline and a heading from a sentence. Either y orientation and any
scale work; the columns are found by clustering, not by a pixel value.

The PDF importer is tested against **synthetic** exports
(`web/test/fixtures/linkedin-pdf-synthetic.ts`) built from the layout described
there, not against a real one. Adding a real export's text items as a fixture —
scrubbed of contact details — is the most useful next step for it.

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

## Privacy

[PRIVACY.md](PRIVACY.md). Nothing is collected, nothing is transmitted, and the
build fails if that stops being true.

## Licence

Apache-2.0. Use it, fork it, build on it commercially — the patent grant is why
Apache rather than MIT. No CLA: contributions are inbound=outbound.

## Guarantees

The built bundles — the extension's and the web build's — contain no `fetch`,
`XMLHttpRequest`, `WebSocket`, `sendBeacon`, EventSource, WebRTC, workers,
dynamic `import()`, computed global lookups or code built from strings (the
full pattern is in `scripts/check-network.mjs`). The web bundle is also run
against a global object that refuses everything outside a short allowlist of
language built-ins, so what it touches at run time is tested, not only what
its text contains. Profile data never leaves the browser. CI fails the build
if any of those ever appear, so the claim breaks loudly rather than quietly. On a web page the claim is about this file: it never
sends the profile anywhere. What else the hosting page loads is that page's
business, and worth checking before trusting it with a CV.

Not affiliated with or endorsed by LinkedIn Corporation.
