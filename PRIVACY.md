# Privacy policy

**Profile Score for LinkedIn collects nothing.**

Both stores ask for a privacy policy URL. This is it, and it is short because there
is very little to describe.

## What is collected

Nothing. No personal data, no profile content, no usage analytics, no crash
reports, no identifiers, no cookies.

## What leaves your browser

Nothing. The extension makes no network requests of any kind. It has no server to
talk to, no account to sign in to, and no telemetry.

This is checked mechanically rather than promised: the build fails if `fetch`,
`XMLHttpRequest`, `WebSocket` or `sendBeacon` ever appear in the packaged bundle,
and that check runs in CI on every commit. If the claim is ever broken it breaks
loudly, in public, on a repository you can read.

## What is stored

Two things, both in your browser's local extension storage, both removed when you
uninstall the extension, neither ever transmitted:

1. **Which goal you last selected** in the dropdown, so the panel reopens on it.
2. **Your own score history** — a short list of `{score, date, rubric version}` per
   goal, so the panel can show you "+12 since three weeks ago" when you come back
   after making changes. At most twenty readings per goal. It holds numbers and
   dates only: no profile text, no recommendations, no identifiers.

The second exists because the useful question — does anyone actually act on the
advice and come back? — is normally answered with analytics. Answering it that way
would break the promise above, so it is answered by showing the person their own
progress instead, on their own machine, where it is more use to them than it would
ever be to us.

## What is read

The extension reads the LinkedIn profile page you are currently viewing, in order
to score it. That reading happens in your browser's memory, the result is drawn
into a panel on the page, and it is discarded when you close the tab. Nothing is
written down, uploaded, or retained.

It runs only on `https://www.linkedin.com/in/*`. It does not run on your feed,
your messages, your search results, or anywhere else on LinkedIn, and it requests
no access to any other website.

## How many people use it

The install and active-user counts shown in the Chrome Web Store and Firefox
Add-ons dashboards are aggregate numbers those stores compute themselves. They are
the only usage figures that exist for this extension, and the extension itself
plays no part in producing them.

## Changes

This file is versioned in the repository, so any change to it is a public commit
with a date and a diff:
https://github.com/kalyanprakash/linkedin-profile-score/blob/main/PRIVACY.md

## Contact

Open an issue: https://github.com/kalyanprakash/linkedin-profile-score/issues

Not affiliated with, endorsed by, or connected to LinkedIn Corporation.
