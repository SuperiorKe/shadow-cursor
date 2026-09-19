# Handoff — 2026-09-19

Read this first in a fresh session. It's the current state, what's verified working, and what's next. Delete or fold sections into README/SPEC as they stop being "handoff" material and become permanent docs.

## Status

The Phase 1 browser extension MVP (see [SPEC.md](SPEC.md) § 10) is built, tested, pushed, and **confirmed working in the user's real Chrome** on Hyprland/Omarchy Linux: hotkey summon, streamed answers, ring/highlight pointing-back, persona toggle, all verified live.

Repo: https://github.com/SuperiorKe/shadow-cursor (public, branch `master`)

```bash
git clone https://github.com/SuperiorKe/shadow-cursor.git
cd shadow-cursor
npm install
npm run build
```

Then load `dist/` as an unpacked extension at `chrome://extensions` (Developer mode on → Load unpacked), open its options, paste an Anthropic API key. `node_modules/` and `dist/` are gitignored — always rebuild after a fresh clone.

## What's built (src/ map)

```
src/background/index.ts   service worker: hotkey → summon, screenshot, streamed Claude calls
src/content/
  index.ts                controller: summon / ask / dismiss state machine
  shadow.ts               the trailing cursor (lerp-follow, freeze, glide-to)
  popover.ts              cursor-anchored panel, transcript, input
  context.ts              DOM snapshot around cursor + screenshot crop
  annotations.ts          rings/highlights that track live elements
  markup.ts               renders model text + [[circle:eN]]/[[highlight:eN]] marks to HTML
  overlay.ts              shadow-DOM host so page CSS can't leak in/out
src/shared/
  personas.ts             system prompts: Critic, Tutor
  settings.ts             chrome.storage.local wrapper
  messages.ts             message/type contracts between content script and worker
src/options/index.ts      settings page (API key, model, effort, persona, base URL)
public/                   manifest.json, options.html
test/smoke.mjs            headless Chromium test against a local mock Messages API
test/fixture.html         static page the smoke test summons on
```

Build: `esbuild` via `build.mjs` (background → ESM, content/options → IIFE). `npm run watch` rebuilds on change — you still have to hit the reload icon on the extension card in `chrome://extensions` to pick it up.

## What's verified

- `npm run typecheck` and `npm run build` are clean.
- `npm test` runs a headless-Chromium smoke test (Playwright under mise, `/usr/bin/chromium`) against a **local mock** of the Messages API — checks overlay injection, cursor trailing/freeze, summon→popover, exact request payload (model, effort, cache_control, refusal-fallback params, screenshot present, DOM context text), streamed rendering into chips, ring/highlight geometry on the real element, follow-up turn history, Escape cleanup. All passing as of the last commit.
- The user has now also verified it live against the real Anthropic API in their actual browser: hotkey fires, popover opens, streamed answer renders, marks point back at elements.
- **Not yet tested**: Tutor persona in the wild, multi-turn follow-ups against the real API, behavior on a variety of real sites (SPA re-renders, iframes, very dense layouts), the options page's model/effort switches against real traffic.

## Environment notes for this project specifically

- No Docker on this machine, no sudo — not relevant to this project (no backend), but noted in case scope grows.
- Playwright is an npm-via-mise install with no bundled browser; launch it against the system browser: `chromium.launch({ executablePath: '/usr/bin/chromium', args: ['--no-sandbox'] })`. The exact mise path is versioned — `test/smoke.mjs` already has the resolution logic (checks local `node_modules/playwright` first, falls back to the mise path). If Playwright's mise version bumps and the fallback path 404s, `ls /home/kenn/.local/share/mise/installs/npm-playwright/*/node_modules/.mise/*/node_modules/playwright/index.mjs` to find the new one.
- User is on Hyprland (Omarchy). Confirmed via `hyprctl binds` that nothing at the compositor level claims `Alt+Shift+S` — don't re-litigate that unless the hotkey changes and a new combo needs checking against `hyprctl binds` / `~/.config/hypr/`.

## Open threads / next steps

In rough priority order — none are blocking, pick based on what the user wants to poke at first:

1. **Real-world DOM context tuning.** `context.ts`'s element-selection heuristics (ancestor walk, neighbour scoping, `isPureWrapper`) were written and tested against one static fixture page. Real sites — SPAs with deep component trees, sites with heavy ARIA, canvas-based UIs (Figma-likes) — will stress this differently. Watch for: too many/few elements in the context, wrong element picked as TARGET on overlapping/absolutely-positioned layouts, `elementsFromPoint` returning the shadow cursor's own overlay (should already be filtered in `topElementAt`, but verify on a page with other extensions' overlays too).
2. **Ambient mode (Phase 2 in SPEC.md § 10).** The big next feature: pulse-and-drift, sensitivity dial, per-app memory, local watcher tier. None of this exists yet — `shadow.ts` has the glide/freeze primitives ambient would reuse, but there's no local model tier, no "notice something" heuristic, and no persistence layer at all (nothing survives a summon dismissal today).
3. **Latency feel.** No one has measured real time-to-first-token yet. If it feels slow, options are: lower default effort further, try Haiku for the fast path, or restructure to a two-tier call (fast ack + deep answer) per the spec's architecture section.
4. **Error/edge cases not yet hit live**: rate limits, a genuine refusal, a page where `chrome.tabs.captureVisibleTab` fails (some internal/PDF-viewer-adjacent pages), very long assistant answers hitting `max_tokens: 8000` in `background/index.ts`.
5. **Cross-browser**: everything is Chrome/Chromium MV3 only. Firefox would need a manifest and API shim pass.
6. **Small polish backlog**: persona toggle only cycles Critic↔Tutor (fine for two personas, will need a menu once more are added); popover has no drag/resize; no keyboard-only way to dismiss individual annotations before the whole session ends.

## How to pick this up

Read `SPEC.md` for the product vision (all of it still holds), skim `src/content/index.ts` first since it's the controller everything else hangs off of, then `README.md` for the dev-loop commands. Run `npm test` once before changing anything to confirm the baseline is still green on this machine.
