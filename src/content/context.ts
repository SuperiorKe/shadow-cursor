import type { CaptureResult, ElementInfo, PageContext, Rect } from "../shared/messages";
import { HOST_TAG } from "./overlay";

/** Half-size of the region we describe and screenshot, in CSS pixels. */
const HALF_W = 320;
const HALF_H = 220;
const MAX_ELEMENTS = 40;
const STYLED_ELEMENTS = 14;
const MAX_SHOT_WIDTH = 1024;

const SKIP_TAGS = new Set(["SCRIPT", "STYLE", "NOSCRIPT", "TEMPLATE", "LINK", "META", "HEAD", "BR", "WBR"]);

export interface CollectedContext {
  context: PageContext;
  /** id → live element, so annotations can be drawn later. */
  elements: Map<string, Element>;
}

export function regionAround(x: number, y: number): Rect {
  const rx = Math.max(0, Math.round(x - HALF_W));
  const ry = Math.max(0, Math.round(y - HALF_H));
  const rw = Math.min(innerWidth - rx, HALF_W * 2);
  const rh = Math.min(innerHeight - ry, HALF_H * 2);
  return { x: rx, y: ry, w: rw, h: rh };
}

export function collectContext(x: number, y: number): CollectedContext {
  const region = regionAround(x, y);
  const target = topElementAt(x, y) ?? document.body ?? document.documentElement;

  // Ancestor chain, nearest first.
  const ancestors: Element[] = [];
  for (let el: Element | null = target.parentElement; el && el !== document.documentElement; el = el.parentElement) {
    ancestors.push(el);
    if (ancestors.length >= 6) break;
  }

  // Scope for neighbours: the closest ancestor whose box covers the region.
  let scope: Element = target;
  for (const a of ancestors) {
    scope = a;
    if (contains(a.getBoundingClientRect(), region)) break;
  }

  // Neighbours: visible elements inside scope that intersect the region.
  const chosen = new Set<Element>([target, ...ancestors]);
  const neighbours: { el: Element; d: number }[] = [];
  const walker = document.createTreeWalker(scope, NodeFilter.SHOW_ELEMENT, {
    acceptNode: (n) => {
      const el = n as Element;
      if (SKIP_TAGS.has(el.tagName) || el.tagName.toLowerCase() === HOST_TAG) return NodeFilter.FILTER_REJECT;
      if (el.closest("svg") && el.tagName.toLowerCase() !== "svg") return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    },
  });
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const el = n as Element;
    if (chosen.has(el)) continue;
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2 || !intersects(r, region)) continue;
    if (!isVisible(el)) continue;
    // Prefer leaf-ish, meaningful elements: skip pure wrappers with one element child and no text of their own.
    if (isPureWrapper(el)) continue;
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    neighbours.push({ el, d: Math.hypot(cx - x, cy - y) });
    if (neighbours.length > 400) break;
  }
  neighbours.sort((a, b) => a.d - b.d);

  const ordered: { el: Element; ancestorDepth?: number }[] = [
    { el: target, ancestorDepth: 0 },
    ...ancestors.map((el, i) => ({ el, ancestorDepth: i + 1 })),
    ...neighbours.slice(0, Math.max(0, MAX_ELEMENTS - 1 - ancestors.length)).map(({ el }) => ({ el })),
  ];

  const elements = new Map<string, Element>();
  const infos: ElementInfo[] = ordered.map(({ el, ancestorDepth }, i) => {
    const id = `e${i + 1}`;
    elements.set(id, el);
    return describe(el, id, ancestorDepth, i < STYLED_ELEMENTS);
  });

  const selection = (getSelection()?.toString() ?? "").trim().slice(0, 300) || undefined;

  return {
    context: {
      url: location.href,
      title: document.title,
      selection,
      cursor: { x: Math.round(x), y: Math.round(y) },
      viewport: { w: innerWidth, h: innerHeight },
      elements: infos,
    },
    elements,
  };
}

function topElementAt(x: number, y: number): Element | null {
  for (const el of document.elementsFromPoint(x, y)) {
    if (el.tagName.toLowerCase() === HOST_TAG) continue;
    if (el === document.documentElement) continue;
    return el;
  }
  return null;
}

function describe(el: Element, id: string, ancestorDepth: number | undefined, withStyles: boolean): ElementInfo {
  const r = el.getBoundingClientRect();
  const info: ElementInfo = {
    id,
    tag: el.tagName.toLowerCase(),
    rect: { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) },
    ancestorDepth,
  };
  const role = el.getAttribute("role") ?? implicitRole(el);
  if (role) info.role = role;
  const text = accessibleText(el);
  if (text) info.text = text;
  const classes = Array.from(el.classList)
    .filter((c) => c.length < 32)
    .slice(0, 3)
    .join(".");
  if (classes) info.classes = classes;
  if (el instanceof HTMLAnchorElement && el.href) info.href = el.href.slice(0, 80);
  if (withStyles) info.styles = summarizeStyles(el);
  return info;
}

function accessibleText(el: Element): string | undefined {
  const explicit = el.getAttribute("aria-label") || el.getAttribute("alt") || el.getAttribute("title");
  if (explicit) return clip(explicit);
  if (el instanceof HTMLInputElement) {
    if (el.type === "password") return "(password field)";
    return clip(el.value || el.placeholder || "");
  }
  if (el instanceof HTMLTextAreaElement) return clip(el.value || el.placeholder || "");
  if (el instanceof HTMLSelectElement) return clip(el.selectedOptions[0]?.text ?? "");
  const own = (el as HTMLElement).innerText ?? el.textContent ?? "";
  return clip(own);
}

function clip(s: string, n = 90): string | undefined {
  const t = s.replace(/\s+/g, " ").trim();
  if (!t) return undefined;
  return t.length > n ? t.slice(0, n - 1) + "…" : t;
}

function implicitRole(el: Element): string | undefined {
  const tag = el.tagName.toLowerCase();
  switch (tag) {
    case "a":
      return (el as HTMLAnchorElement).href ? "link" : undefined;
    case "button":
      return "button";
    case "input": {
      const t = (el as HTMLInputElement).type;
      if (t === "submit" || t === "button") return "button";
      if (t === "checkbox" || t === "radio" || t === "range") return t;
      return "textbox";
    }
    case "textarea":
      return "textbox";
    case "select":
      return "listbox";
    case "img":
      return "img";
    case "nav":
      return "navigation";
    case "main":
    case "header":
    case "footer":
    case "aside":
    case "form":
    case "table":
    case "dialog":
      return tag;
    case "ul":
    case "ol":
      return "list";
    case "li":
      return "listitem";
    case "label":
      return "label";
    default:
      if (/^h[1-6]$/.test(tag)) return `heading ${tag[1]}`;
      return undefined;
  }
}

function summarizeStyles(el: Element): string {
  const cs = getComputedStyle(el);
  const parts: string[] = [];
  parts.push(`font ${cs.fontSize}/${cs.fontWeight}`);
  parts.push(`color ${shortColor(cs.color)}`);
  const bg = shortColor(cs.backgroundColor);
  if (bg && bg !== "transparent") parts.push(`bg ${bg}`);
  if (cs.padding && cs.padding !== "0px") parts.push(`pad ${cs.padding}`);
  if (cs.borderRadius && cs.borderRadius !== "0px") parts.push(`radius ${cs.borderRadius}`);
  if (cs.display !== "block" && cs.display !== "inline") parts.push(cs.display);
  return parts.join(", ");
}

function shortColor(c: string): string {
  // rgb(a) → #hex where fully opaque; keep rgba otherwise.
  const m = c.match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)$/);
  if (!m) return c;
  const a = m[4] === undefined ? 1 : parseFloat(m[4]);
  if (a === 0) return "transparent";
  const hex = [m[1], m[2], m[3]].map((v) => parseInt(v, 10).toString(16).padStart(2, "0")).join("");
  return a < 1 ? `#${hex}@${a}` : `#${hex}`;
}

function isVisible(el: Element): boolean {
  const cs = getComputedStyle(el);
  return cs.visibility !== "hidden" && cs.display !== "none" && parseFloat(cs.opacity) > 0.05;
}

function isPureWrapper(el: Element): boolean {
  if (el.children.length !== 1) return false;
  if (el.getAttribute("role") || el.getAttribute("aria-label")) return false;
  if (implicitRole(el)) return false;
  for (const n of el.childNodes) {
    if (n.nodeType === Node.TEXT_NODE && n.textContent?.trim()) return false;
  }
  return true;
}

function contains(outer: DOMRect, inner: Rect): boolean {
  return (
    outer.left <= inner.x && outer.top <= inner.y && outer.right >= inner.x + inner.w && outer.bottom >= inner.y + inner.h
  );
}

function intersects(r: DOMRect, box: Rect): boolean {
  return r.right > box.x && r.left < box.x + box.w && r.bottom > box.y && r.top < box.y + box.h;
}

// ---------------------------------------------------------------------------
// Screenshot: ask the service worker for the visible tab, then crop locally.
// ---------------------------------------------------------------------------

export interface RegionShot {
  data: string; // base64 PNG, no data: prefix
  box: Rect;
}

export async function captureRegion(
  x: number,
  y: number,
  hideOverlay: () => void,
  showOverlay: () => void,
): Promise<RegionShot | null> {
  const box = regionAround(x, y);
  hideOverlay();
  await nextPaint();
  let result: CaptureResult;
  try {
    result = (await chrome.runtime.sendMessage({ type: "capture" })) as CaptureResult;
  } catch (err) {
    showOverlay();
    return null;
  }
  showOverlay();
  if (!result?.ok) return null;

  try {
    const img = await loadImage(result.dataUrl);
    // Derive the real scale from the bitmap rather than trusting devicePixelRatio (zoom, HiDPI).
    const scale = img.naturalWidth / innerWidth;
    const outScale = Math.min(1, MAX_SHOT_WIDTH / (box.w * scale));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(box.w * scale * outScale);
    canvas.height = Math.round(box.h * scale * outScale);
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(
      img,
      box.x * scale,
      box.y * scale,
      box.w * scale,
      box.h * scale,
      0,
      0,
      canvas.width,
      canvas.height,
    );
    const dataUrl = canvas.toDataURL("image/png");
    return { data: dataUrl.slice(dataUrl.indexOf(",") + 1), box };
  } catch {
    return null;
  }
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("screenshot decode failed"));
    img.src = src;
  });
}

function nextPaint(): Promise<void> {
  return new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));
}
