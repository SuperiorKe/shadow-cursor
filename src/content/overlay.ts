/**
 * The overlay is a single fixed, click-through host element attached to
 * <html> (not <body>, so SPA body swaps cannot remove it). Everything we draw
 * lives inside its shadow root so page CSS cannot leak in or out.
 */

export const HOST_TAG = "shadow-cursor-host";

export interface Overlay {
  host: HTMLElement;
  root: ShadowRoot;
  hide(): void;
  show(): void;
}

export function createOverlay(): Overlay {
  const existing = document.querySelector<HTMLElement>(HOST_TAG);
  if (existing) existing.remove();

  const host = document.createElement(HOST_TAG);
  host.style.cssText = [
    "position:fixed",
    "inset:0",
    "pointer-events:none",
    "z-index:2147483647",
    "contain:layout style",
  ].join(";");
  const root = host.attachShadow({ mode: "open" });
  const style = document.createElement("style");
  style.textContent = CSS;
  root.append(style);
  document.documentElement.append(host);

  return {
    host,
    root,
    hide: () => (host.style.visibility = "hidden"),
    show: () => (host.style.visibility = ""),
  };
}

const CSS = `
:host { all: initial; }
*, *::before, *::after { box-sizing: border-box; }

:host {
  --sc-accent: #6366f1;
  --sc-mark: #f59e0b;
  --sc-bg: rgba(18, 18, 22, 0.94);
  --sc-fg: #ececf1;
  --sc-muted: rgba(236, 236, 241, 0.6);
  --sc-border: rgba(255, 255, 255, 0.1);
  --sc-font: 13px/1.45 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
}

/* ---------- the shadow cursor ---------- */
.shadow {
  position: fixed;
  left: 0; top: 0;
  width: 22px; height: 26px;
  opacity: 0.45;
  will-change: transform;
  transition: opacity 180ms ease;
  filter: drop-shadow(0 1px 2px rgba(0,0,0,0.35));
}
.shadow svg { display: block; width: 100%; height: 100%; }
.shadow.solid { opacity: 1; }
.shadow.hidden { opacity: 0; }
.shadow.thinking svg { animation: sc-pulse 1.1s ease-in-out infinite; transform-origin: 20% 15%; }
@keyframes sc-pulse {
  0%, 100% { transform: scale(1); }
  50% { transform: scale(1.18); }
}

/* ---------- popover ---------- */
.popover {
  position: fixed;
  width: 380px;
  max-height: 60vh;
  display: flex;
  flex-direction: column;
  pointer-events: auto;
  background: var(--sc-bg);
  color: var(--sc-fg);
  font: var(--sc-font);
  border: 1px solid var(--sc-border);
  border-radius: 12px;
  box-shadow: 0 12px 40px rgba(0,0,0,0.45), 0 1px 0 rgba(255,255,255,0.05) inset;
  backdrop-filter: blur(14px);
  overflow: hidden;
  opacity: 0;
  transform: translateY(4px) scale(0.98);
  transition: opacity 120ms ease, transform 120ms ease;
}
.popover.open { opacity: 1; transform: none; }

.head {
  display: flex; align-items: center; gap: 8px;
  padding: 8px 10px 8px 12px;
  border-bottom: 1px solid var(--sc-border);
  font-size: 12px;
  color: var(--sc-muted);
}
.head .dot {
  width: 8px; height: 8px; border-radius: 50%;
  background: var(--sc-accent);
  flex: none;
}
.head .persona {
  appearance: none;
  border: 1px solid var(--sc-border);
  background: rgba(255,255,255,0.05);
  color: var(--sc-fg);
  font: inherit; font-weight: 600;
  padding: 2px 8px; border-radius: 999px;
  cursor: pointer;
}
.head .persona:hover { background: rgba(255,255,255,0.1); }
.head .status { flex: 1; text-align: right; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.head .close {
  appearance: none; border: 0; background: transparent;
  color: var(--sc-muted); font: inherit; font-size: 16px; line-height: 1;
  cursor: pointer; padding: 2px 4px; border-radius: 4px;
}
.head .close:hover { color: var(--sc-fg); background: rgba(255,255,255,0.08); }

.transcript {
  overflow-y: auto;
  padding: 10px 14px 4px;
  scrollbar-width: thin;
}
.transcript:empty { display: none; }
.turn { margin: 0 0 10px; }
.turn.user {
  color: var(--sc-muted);
  font-size: 12px;
  padding-left: 10px;
  border-left: 2px solid var(--sc-border);
}
.turn.assistant p { margin: 0 0 6px; }
.turn.assistant p:last-child { margin-bottom: 0; }
.turn.assistant ul { margin: 0 0 6px; padding-left: 18px; }
.turn.assistant li { margin: 2px 0; }
.turn.assistant code {
  font: 12px ui-monospace, SFMono-Regular, Menlo, monospace;
  background: rgba(255,255,255,0.08);
  padding: 1px 4px; border-radius: 4px;
}
.turn.assistant strong { font-weight: 600; color: #fff; }
.turn.error { color: #fca5a5; }
.turn.error a { color: inherit; text-decoration: underline; cursor: pointer; }
.caret {
  display: inline-block; width: 6px; height: 13px; vertical-align: -2px;
  background: var(--sc-muted); margin-left: 2px;
  animation: sc-blink 1s steps(2) infinite;
}
@keyframes sc-blink { to { visibility: hidden; } }

.chip {
  display: inline-flex; align-items: center; gap: 4px;
  font-size: 11px; font-weight: 600;
  color: var(--sc-mark);
  background: rgba(245,158,11,0.14);
  border: 1px solid rgba(245,158,11,0.35);
  border-radius: 999px;
  padding: 0 6px; margin: 0 2px;
  vertical-align: 1px;
  white-space: nowrap;
  cursor: default;
}
.chip:hover { background: rgba(245,158,11,0.28); }

.input {
  display: block; width: 100%;
  border: 0; border-top: 1px solid var(--sc-border);
  background: transparent; color: var(--sc-fg);
  font: var(--sc-font);
  padding: 10px 14px; margin: 0;
  resize: none; outline: none;
  min-height: 40px; max-height: 120px;
}
.input::placeholder { color: var(--sc-muted); }
.transcript:empty + .input { border-top: 0; }

/* ---------- annotations ---------- */
.annot {
  position: fixed;
  pointer-events: none;
  animation: sc-draw 220ms ease-out;
}
.annot.circle {
  border: 2px solid var(--sc-mark);
  border-radius: 999px;
  box-shadow: 0 0 0 1px rgba(0,0,0,0.25), 0 0 12px rgba(245,158,11,0.35);
}
.annot.highlight {
  background: rgba(245,158,11,0.22);
  border-radius: 4px;
  outline: 1px solid rgba(245,158,11,0.5);
}
.annot.flash { animation: sc-flash 700ms ease-out; }
@keyframes sc-draw {
  from { opacity: 0; transform: scale(1.08); }
  to { opacity: 1; transform: none; }
}
@keyframes sc-flash {
  0% { box-shadow: 0 0 0 6px rgba(245,158,11,0.5); }
  100% { box-shadow: 0 0 0 1px rgba(0,0,0,0.25); }
}
`;
