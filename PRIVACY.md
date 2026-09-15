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

One value, in your browser's local extension storage: which goal you last selected
in the dropdown, so the panel reopens on the same one. It never leaves your device
and is removed when you uninstall the extension.

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
