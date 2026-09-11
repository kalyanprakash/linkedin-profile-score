# Store listing

Copy for the Chrome Web Store and Firefox AMO submissions. Kept in the repo so it
versions with the thing it describes.

Two rules govern everything below. Nothing claims or implies affiliation with
LinkedIn — their brand policy offers no descriptive-use carve-out, and Chrome
separately forbids implying endorsement. And nothing is claimed that the code does
not do, because the privacy claim is the product and an asterisk on it is fatal.

---

## Name

**Profile Score for LinkedIn**

`Profile Score` is the product; `for LinkedIn` is referential, which is the shape
that reads as third-party rather than official. Not `LinkedIn Profile Score` — a
leading, fused mark is the form most likely to be read as implying affiliation.

Repository name is `linkedin-profile-score`, which is fine: repos carry almost no
trademark exposure and the descriptive name is far more discoverable.

## Short description (132 char max)

> Scores your LinkedIn profile for your actual goal. Runs entirely in your browser. Not affiliated with LinkedIn Corporation.

123 characters.

## Category

Productivity. (Not "Social & Communication" — this does not interact with the
network, it reads one page you are already looking at.)

---

## Detailed description

**Most profile scorers are lead magnets. This one is the whole product.**

Paid services score your profile, hand back a number designed to alarm, and sell
you the rewrite. Their scoring usually shares two flaws: every check is pass/fail,
so a real profile with real gaps collapses toward zero — and one rubric written for
someone selling consulting gets applied to someone job hunting.

Profile Score fixes both, and it is free because it never needs a server.

**It scores for what you are actually trying to do.**

Thirty checks, re-weighted across five goals. Experience is 32% of a job seeker's
score and 17% of an audience builder's. Posting is 2% for a job hunt and 12% for
building a following. Pick your goal from the dropdown and the whole score changes,
because the same profile genuinely is better or worse depending on what it is for.

**Partial credit, not pass/fail.**

Every check returns a proportion. A headline using 75 of its 220 characters scores
three-quarters of that check, not zero. You get a number that reflects your profile
rather than one engineered to sell you something.

**It tells you when it cannot see something.**

If a section has not loaded, the check is removed from the scoring rather than
counted as a failure, and you are shown a range instead of a false precision. You
will never be told a section is empty when the truth is that it was not readable.

**It leads with one thing, not twenty.**

A list of twenty findings is a to-do list nobody starts. Profile Score shows the
single highest-impact fix, what it is worth, and what a reader currently cannot
tell about you. Do it, hit Rescan, and the next one appears.

**Some things are reported and deliberately not scored.**

Where the evidence is genuinely contested — the #OpenToWork badge is the clearest
example — you get the fact and the trade-off, worth zero points either way. A
scoring tool should not fabricate authority it does not have.

**Nothing leaves your browser.**

No account. No sign-in. No upload. No analytics. The extension makes no network
requests of any kind — the build fails automatically if one is ever added. Your
profile is read on the page you are already looking at, scored in memory, and
forgotten when you close the tab.

The scoring rubric is open source and published in full, so you can read exactly
what is measured, disagree with it, and send a pull request.

github.com/kalyanprakash/linkedin-profile-score · Apache-2.0

Not affiliated with, endorsed by, or connected to LinkedIn Corporation.

---

## Single purpose (Chrome requires one sentence)

> Score the LinkedIn profile page the user is viewing and show them what to improve.

---

## Permission justifications

Chrome asks for these individually. Keep the answers narrow and literal.

**`storage`**
> Stores one value: which goal the user selected in the dropdown, so the panel
> opens on the same goal next time. Nothing else is written, and nothing is sent
> anywhere.

**`host_permissions: https://www.linkedin.com/in/*`**
> The extension reads the profile page it runs on in order to score it. Access is
> limited to profile URLs; it does not run on the feed, on messaging, on search, or
> anywhere else on LinkedIn, and requests no access to any other site.

**Remote code**
> None. All code is bundled in the package. The extension loads no scripts and
> makes no network requests. A build check fails if `fetch`, `XMLHttpRequest`,
> `WebSocket` or `sendBeacon` ever appear in the bundle.

**Data collection disclosure**
> Select "does not collect user data" for every category. This is accurate: no data
> is transmitted, stored remotely, or shared. The only persisted value is the
> selected goal, in local browser storage.

---

## Firefox AMO differences

AMO asks for a shorter summary and reviewer notes.

**Summary (250 char max)**
> Scores your LinkedIn profile against what you are actually optimising for — job
> hunting, hiring, building an audience. Partial credit, not pass/fail. Runs
> entirely in your browser with no network access at all. Not affiliated with
> LinkedIn Corporation.

**Notes for reviewers**
> Source: github.com/kalyanprakash/linkedin-profile-score (Apache-2.0).
> Build: `npm install && npm run build:ext`, which emits build/firefox.
> No minification, no remote code, no network requests, no background script.
> The only permission beyond host access is `storage`, used for a single
> preference. The content script reads the DOM of the profile page it runs on,
> scores it in memory, and renders a panel. Nothing is transmitted.

---

## Screenshots

Chrome wants 1–5 at 1280×800 (or 640×400). These need a real profile, so they are
the one part that cannot be generated.

Worth capturing, in this order — the first is the one most people will look at:

1. **The panel with the one-thing block filled in.** The score, the goal dropdown,
   and the lead recommendation with its before→after. This is the product.
2. **The same profile on a different goal**, where the lead recommendation changes.
   Two shots side by side are the only way the persona idea lands without reading
   the description — a screenshot of the dropdown alone just shows a dropdown.
3. **The all-checks list expanded**, showing per-check partial scores and what was
   observed. This is the "we will show you our working" shot.
4. **A capped score**, if the profile being shot has a blocking gap. The red block
   explaining the ceiling and what lifts it — nothing else in the category does
   this. Do not manufacture one; a profile with no blocking gap correctly shows no
   cap, and caps below a three-point bind are not reported at all.
5. **Optional:** the range note, showing the tool naming what it could not read.
   Only appears when a section genuinely is not there, so it may not be capturable
   on a complete profile — which is the intended behaviour, not a missing shot.

One shot per goal is the right instinct, but five near-identical panels is a weak
listing. Two goals that visibly disagree does the same work in half the space.

Blur or use a throwaway profile if any of them show personal detail you would
rather not publish on a store page.

**Small promo tile:** 440×280. The gauge icon on a light ground with the product
name is sufficient; the store does not reward cleverness here.
