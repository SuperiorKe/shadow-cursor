# Privacy Policy — Shadow Cursor

Last updated: 2026-09-21

Shadow Cursor is a browser extension that answers questions about whatever
you're pointing at on a web page. This page explains what data it touches,
where it goes, and where it doesn't.

## What triggers data collection

Nothing happens until you press the hotkey (`Alt+Shift+S`) or click the
toolbar icon and ask a question. Shadow Cursor does not read, capture, or
transmit anything from a page in the background.

## What is collected, and where it goes

When you summon Shadow Cursor and ask a question, the extension sends the
following to the Anthropic API (`api.anthropic.com`, or a custom base URL you
configure yourself) so the model can answer:

- **A screenshot** of the region around your cursor at the moment you
  summoned it.
- **DOM context** for the elements near your cursor: tag names, ARIA roles,
  visible text, a handful of computed styles, and on-screen positions.
- **Your question**, and the text of any earlier turns in the same
  conversation (kept in memory for that page session only).

This is sent directly from your browser to Anthropic using the API key you
provide. Shadow Cursor's developer does not operate any server in between and
does not receive, log, or have access to any of it.

## What is stored, and where

- **Your Anthropic API key**, selected model, effort level, and persona
  choice are stored in `chrome.storage.local` — local to your browser
  profile on your machine, not synced to any account or server.
- **Conversation turns** for an open Shadow Cursor session live in memory in
  the page's content script and are discarded when you dismiss it or
  navigate away. Nothing is written to disk beyond the settings above.

## What is never collected

Shadow Cursor does not collect analytics, telemetry, or crash reports, and
has no third-party trackers or ad code. It does not sell or share data with
anyone, because it does not have a backend to collect it in the first place —
the only network calls it makes are the ones described above, straight to
Anthropic, triggered by your own action.

## Permissions

- **`storage`** — save your settings locally, as described above.
- **`activeTab`** — read and act on the page you're currently looking at,
  only after you invoke the hotkey or click the toolbar icon.
- **Host permission (`<all_urls>`)** — Shadow Cursor works on any site you
  choose to use it on, so its content script needs to be able to run
  anywhere you summon it; it does not run without that summon.

## Third parties

Your questions, screenshots, and page context are processed by Anthropic
under [Anthropic's own privacy policy](https://www.anthropic.com/privacy) and
[commercial terms](https://www.anthropic.com/legal/commercial-terms). No
other third party is involved.

## Changes

If this policy changes, the update will be reflected here with a new "Last
updated" date and noted in [CHANGELOG.md](CHANGELOG.md).

## Contact

Questions about this policy: open an issue on the project's GitHub
repository.
