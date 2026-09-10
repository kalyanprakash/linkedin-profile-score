# Contributing

Two kinds of contribution matter here, and the first one is the urgent one.

## 1. Fixing a selector when LinkedIn changes

**This is the contribution the project needs most.** LinkedIn ships DOM changes
regularly and every one of them breaks extraction. When that happens the panel
either fails to appear or reports sections as unreadable.

Everything that knows about LinkedIn's markup lives in **one file**:
`extension/src/extract.ts`. Nothing else in the repo touches the DOM. A fix is
almost always a few lines there.

The loop:

```bash
npm install
npm test                       # 42 tests; extractor tests are the ones to watch
npm run watch                  # rebuilds extension/dist on save
```

Then reload the extension at `chrome://extensions` and hard-reload the profile tab.

To debug against a real page, open the console on your own LinkedIn profile and
look for `[profile-score] extracted` — that object is exactly what the engine is
given. Anything missing from its `observed` array is a section the extractor could
not read.

**Please add a fixture case with your fix.** `extension/test/fixtures/dom.ts` is
synthetic markup modelled on the real DOM — no real profile is reproduced, so it
can live in a public repo. Encode the shape that broke, then fix the selector. That
way the next change to the same area can't silently undo your work.

Things already learned the hard way, all encoded in the fixture:

- Cards are `div[componentkey$="…"]`, all inside **one** outer `<section>` — so
  `closest('section')` returns the whole page and is useless.
- The name is an `<h2>`, not an `<h1>`.
- `innerText` returns `""` on these cards even when they are visible and 1,000px
  tall. Use `textContent`.
- `textContent` runs adjacent elements together, so `"Visit my website"` + `"4mo"`
  becomes `"website4mo"` and a leading `\b` in a regex never matches.
- An employer with several roles renders a header `div` with roles as `<li>`; an
  employer with **one** role renders a single `div` with no `<li>` at all.
- `"Leadership, Delivery and +2 skills"` sits exactly where a description would.
- The skills card renders no `<li>` — names are anchors interleaved with
  `"N experiences at …"` rows.

## 2. Arguing with the rubric

The rubric is meant to be argued with. It lives in `packages/engine/src/rules/`,
one small pure function per check, with weights in `personas.ts`.

Four rules govern what may become a scored check. They exist because the tools this
replaces break all four:

**Partial credit.** Every check returns a ratio in `0..1`, never pass/fail. A
rubric of binary checks collapses real profiles to near-zero, which is a sales
trigger rather than a measurement.

**Abstain on what you cannot see.** If the input was not captured, return
`ABSTAIN`. The rule drops out of the denominator instead of scoring zero — the
difference between "you have no banner" and "we could not see your banner".

**A check earns points only where a defensible right answer exists.** Where the
evidence is thin or contested, add an *observation* in `observations.ts` instead:
reported, explained, worth zero points either way. The #OpenToWork signal is the
worked example.

**Don't manufacture deficits.** LinkedIn renders empty-state cards for Projects,
Patents, Honours, Courses, Test Scores and more on *every* profile in existence.
The presence of a section is not evidence anyone should have content in it. A
section earns a rule only when its absence genuinely costs the person something,
and the reason has to be nameable.

If you change a rule, the fixtures in `packages/engine/test/fixtures/profiles.ts`
will move. That is fine — but moving a fixture out of its expected band is a
deliberate recalibration, not a passing build. Say so in the PR.

## Licence

Apache-2.0. No CLA — contributions are inbound=outbound under the same licence.
