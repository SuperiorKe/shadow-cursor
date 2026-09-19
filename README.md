# Shadow Cursor

A second cursor with an LLM brain. It trails your real cursor on every page. Press the hotkey, and it snaps solid, looks at what you are pointing at, and answers in a small panel anchored to the cursor. It can point back by ringing or shading elements on the page.

This is the Phase 1 browser extension MVP from [SPEC.md](SPEC.md): summon only, no ambient mode yet.

## What it does

- **Trails your cursor.** A translucent second cursor follows the pointer with a slight lag.
- **Summon with `Alt+Shift+S`** (or click the toolbar icon). The shadow freezes where you are pointing and a panel opens.
- **Sees what you see.** It captures a screenshot of the region around the cursor and reads the DOM elements there: tags, roles, text, key computed styles, and positions.
- **Answers in a stream.** Ask anything, or press Enter on an empty prompt for the persona's default question. Follow-ups stay in the same session.
- **Points back.** When the answer mentions an element it draws a ring or a highlight over it, and the shadow glides to the first one. Hover a chip in the answer to flash its mark.
- **Two personas.** Critic gives design and UX feedback. Tutor explains what things are and how to use them. Toggle from the panel.
- **Escape** dismisses everything.

## Setup

```bash
npm install
npm run build
```

Then in Chrome or Chromium:

1. Open `chrome://extensions`, turn on Developer mode.
2. Click "Load unpacked" and pick the `dist/` folder.
3. Click the extension's "Details", then "Extension options", and paste an Anthropic API key.

The key is stored in `chrome.storage.local` on this machine only. Nothing is sent anywhere until you summon and ask.

## Development

```bash
npm run watch      # rebuild on change; reload the extension in chrome://extensions
npm run typecheck
npm test           # headless Chromium smoke test, needs Playwright and /usr/bin/chromium
```

The smoke test loads the built extension, moves the mouse, summons, submits a question, and checks the whole pipeline against a local mock of the Messages API. It does not call the real API.

## How it is built

```
src/
  background/index.ts   service worker: hotkey → summon, screenshot, streamed Claude calls
  content/
    index.ts            controller: summon / ask / dismiss state machine
    shadow.ts           the trailing cursor
    popover.ts          the cursor-anchored panel
    context.ts          DOM snapshot around the cursor + screenshot crop
    annotations.ts      rings and highlights that track live elements
    markup.ts           renders model text and [[circle:eN]] marks to HTML
    overlay.ts          shadow-DOM host so page CSS cannot leak in or out
  shared/
    personas.ts         system prompts for Critic and Tutor
    settings.ts         chrome.storage wrapper
    messages.ts         message types between content script and service worker
  options/index.ts      settings page
public/                 manifest, options.html
```

The model call goes through the official `@anthropic-ai/sdk` from the service worker, streaming over a `chrome.runtime` port to the content script. The first user turn carries the cropped screenshot and a compact text description of the elements near the cursor, each with a short id. The model points back by writing `[[circle:e3]]` or `[[highlight:e3]]` inline; the content script turns those into chips in the answer and drawn marks on the page.

Default model is Claude Opus 5 at low effort for snappy answers. Sonnet 5 and Haiku 4.5 are selectable in options. On Opus 5 the request enables the server-side refusal fallback so a declined request is re-run on a fallback model in the same call.

## Not yet

- Ambient mode (pulse and drift). Phase 2 in the spec.
- Voice input.
- Memory across summons.
- Firefox and Safari.
