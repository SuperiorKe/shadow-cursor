/**
 * The trailing cursor. In ambient state it lerps toward the real pointer with
 * a small lag, like a shadow. When frozen (summoned) it stops following and
 * can glide to a point of interest on its own.
 */

interface Point {
  x: number;
  y: number;
}

const LAG = 0.14; // fraction of the remaining distance covered per frame
const GLIDE = 0.1;

export class ShadowCursor {
  readonly el: HTMLElement;
  private pointer: Point = { x: innerWidth / 2, y: innerHeight / 2 };
  private pos: Point = { ...this.pointer };
  private glideTarget: Point | null = null;
  private frozen = false;
  private seen = false;
  private raf = 0;

  constructor(root: ShadowRoot) {
    this.el = document.createElement("div");
    this.el.className = "shadow hidden";
    this.el.innerHTML = ARROW_SVG;
    root.append(this.el);

    window.addEventListener("mousemove", this.onMove, { passive: true, capture: true });
    document.addEventListener("mouseleave", () => this.el.classList.add("hidden"));
    this.tick();
  }

  /** Last known pointer position in viewport coordinates. */
  get pointerPosition(): Point {
    return { ...this.pointer };
  }

  get position(): Point {
    return { ...this.pos };
  }

  /** Stop following the pointer and snap solid at the given point. */
  freeze(at?: Point): void {
    this.frozen = true;
    if (at) this.pos = { ...at };
    this.glideTarget = null;
    this.el.classList.add("solid");
    this.el.classList.remove("hidden");
  }

  /** Resume trailing the pointer. */
  unfreeze(): void {
    this.frozen = false;
    this.glideTarget = null;
    this.el.classList.remove("solid", "thinking");
  }

  /** While frozen, drift toward a point (used to "point back" at an element). */
  glideTo(p: Point): void {
    if (!this.frozen) return;
    this.glideTarget = { ...p };
  }

  setThinking(on: boolean): void {
    this.el.classList.toggle("thinking", on);
  }

  private onMove = (e: MouseEvent): void => {
    this.pointer = { x: e.clientX, y: e.clientY };
    if (!this.seen) {
      // First movement: start from the pointer rather than sweeping in from centre.
      this.pos = { ...this.pointer };
      this.seen = true;
    }
    if (!this.frozen) this.el.classList.remove("hidden");
  };

  private tick = (): void => {
    const target = this.frozen ? this.glideTarget : this.pointer;
    if (target) {
      const k = this.frozen ? GLIDE : LAG;
      this.pos.x += (target.x - this.pos.x) * k;
      this.pos.y += (target.y - this.pos.y) * k;
      if (this.frozen && Math.hypot(target.x - this.pos.x, target.y - this.pos.y) < 0.5) {
        this.glideTarget = null;
      }
    }
    // Offset so the arrow tip sits just behind and below the real cursor.
    this.el.style.transform = `translate(${this.pos.x + 6}px, ${this.pos.y + 8}px)`;
    this.raf = requestAnimationFrame(this.tick);
  };

  destroy(): void {
    cancelAnimationFrame(this.raf);
    window.removeEventListener("mousemove", this.onMove, { capture: true });
    this.el.remove();
  }
}

const ARROW_SVG = `
<svg viewBox="0 0 22 26" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <path d="M3 2 L3 20 L8 15.5 L11.5 23.5 L14.8 22 L11.4 14.3 L18 14.3 Z"
        fill="#6366f1" stroke="#ffffff" stroke-width="1.4" stroke-linejoin="round"/>
</svg>`;
