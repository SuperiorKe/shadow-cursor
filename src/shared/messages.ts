export type Persona = "critic" | "tutor";

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface ElementInfo {
  /** Short id the model uses to point back, e.g. "e3". */
  id: string;
  tag: string;
  role?: string;
  text?: string;
  classes?: string;
  href?: string;
  rect: Rect;
  /** 0 = the element under the cursor, positive = ancestors, undefined = neighbours. */
  ancestorDepth?: number;
  styles?: string;
}

export interface PageContext {
  url: string;
  title: string;
  selection?: string;
  cursor: { x: number; y: number };
  viewport: { w: number; h: number };
  /** Viewport region the screenshot covers, if one was taken. */
  shotBox?: Rect;
  elements: ElementInfo[];
}

export interface Turn {
  role: "user" | "assistant";
  text: string;
}

export interface AskRequest {
  type: "ask";
  persona: Persona;
  context: PageContext;
  image?: { mediaType: "image/png" | "image/jpeg"; data: string };
  /** Full transcript for this summon, ending with the new user turn. */
  turns: Turn[];
}

export type AskResponse =
  | { type: "delta"; text: string }
  | { type: "done"; model: string }
  | { type: "error"; message: string; code?: "no_key" | "auth" | "rate_limit" | "refusal" | "other" };

export type RuntimeMessage =
  | { type: "summon" }
  | { type: "capture" }
  | { type: "openOptions" };

export type CaptureResult = { ok: true; dataUrl: string } | { ok: false; error: string };
