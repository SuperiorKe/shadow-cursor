export type MarkKind = "circle" | "highlight";

interface Annotation {
  kind: MarkKind;
  target: Element;
  node: HTMLElement;
}

/**
 * Ghost annotations drawn over page elements. They track the element's live
 * bounding box so they survive scrolling and layout shifts.
 */
export class Annotations {
  private readonly layer: HTMLElement;
  private items: Annotation[] = [];
  private raf = 0;

  constructor(root: ShadowRoot) {
    this.layer = document.createElement("div");
    this.layer.className = "annotations";
    root.append(this.layer);
    addEventListener("scroll", this.schedule, { passive: true, capture: true });
    addEventListener("resize", this.schedule, { passive: true });
  }

  /** Returns true if a new annotation was added (false if it already existed). */
  add(kind: MarkKind, target: Element): boolean {
    if (this.items.some((a) => a.kind === kind && a.target === target)) return false;
    const node = document.createElement("div");
    node.className = `annot ${kind}`;
    this.layer.append(node);
    const a = { kind, target, node };
    this.items.push(a);
    this.place(a);
    return true;
  }

  /** Briefly re-emphasise an existing mark (e.g. when hovering its chip). */
  flash(kind: MarkKind, target: Element): void {
    const a = this.items.find((i) => i.kind === kind && i.target === target);
    if (!a) return;
    a.node.classList.remove("flash");
    void a.node.offsetWidth; // restart animation
    a.node.classList.add("flash");
  }

  clear(): void {
    for (const a of this.items) a.node.remove();
    this.items = [];
  }

  private schedule = (): void => {
    if (this.raf) return;
    this.raf = requestAnimationFrame(() => {
      this.raf = 0;
      for (const a of this.items) this.place(a);
    });
  };

  private place(a: Annotation): void {
    const r = a.target.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) {
      a.node.style.display = "none";
      return;
    }
    a.node.style.display = "";
    const pad = a.kind === "circle" ? 7 : 2;
    a.node.style.left = `${r.left - pad}px`;
    a.node.style.top = `${r.top - pad}px`;
    a.node.style.width = `${r.width + pad * 2}px`;
    a.node.style.height = `${r.height + pad * 2}px`;
    if (a.kind === "circle") {
      // Ellipse for wide elements, ring for square-ish ones.
      a.node.style.borderRadius = r.width > r.height * 2.5 ? "999px" : "50%";
    }
  }
}
