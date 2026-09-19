import type { Persona } from "../shared/messages";
import { PERSONAS } from "../shared/personas";

export interface PopoverHandlers {
  onSubmit(text: string): void;
  onClose(): void;
  onTogglePersona(): void;
  onChipHover(kind: string, id: string): void;
  onOpenSettings(): void;
}

const WIDTH = 380;
const GAP = 22;
const MARGIN = 10;

/**
 * The cursor-anchored panel: a transcript of this summon and a one-line input.
 * Lives inside the overlay's shadow root; swallows keyboard events so page
 * shortcuts do not fire while the user is typing.
 */
export class Popover {
  readonly el: HTMLElement;
  private readonly transcript: HTMLElement;
  private readonly input: HTMLTextAreaElement;
  private readonly personaBtn: HTMLButtonElement;
  private readonly status: HTMLElement;
  private current: HTMLElement | null = null;
  private isOpen = false;

  constructor(root: ShadowRoot, private readonly handlers: PopoverHandlers) {
    this.el = document.createElement("div");
    this.el.className = "popover";
    this.el.style.display = "none";
    this.el.innerHTML = `
      <div class="head">
        <span class="dot"></span>
        <button class="persona" type="button" title="Switch persona"></button>
        <span class="status"></span>
        <button class="close" type="button" title="Dismiss (Esc)">&times;</button>
      </div>
      <div class="transcript"></div>
      <textarea class="input" rows="1" placeholder="Ask about what you're pointing at…"></textarea>
    `;
    root.append(this.el);

    this.transcript = this.el.querySelector(".transcript")!;
    this.input = this.el.querySelector(".input")!;
    this.personaBtn = this.el.querySelector(".persona")!;
    this.status = this.el.querySelector(".status")!;

    this.personaBtn.addEventListener("click", () => handlers.onTogglePersona());
    this.el.querySelector(".close")!.addEventListener("click", () => handlers.onClose());

    this.input.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
        e.preventDefault();
        const text = this.input.value;
        this.input.value = "";
        this.autosize();
        handlers.onSubmit(text);
      } else if (e.key === "Escape") {
        e.preventDefault();
        handlers.onClose();
      }
    });
    this.input.addEventListener("input", () => this.autosize());

    // Keep page shortcut handlers from seeing our keystrokes.
    for (const type of ["keydown", "keyup", "keypress"] as const) {
      this.el.addEventListener(type, (e) => e.stopPropagation());
    }

    this.transcript.addEventListener("mouseover", (e) => {
      const chip = (e.target as HTMLElement).closest<HTMLElement>(".chip");
      if (chip) handlers.onChipHover(chip.dataset.kind!, chip.dataset.id!);
    });
    this.transcript.addEventListener("click", (e) => {
      const a = (e.target as HTMLElement).closest<HTMLElement>("a[data-action='settings']");
      if (a) {
        e.preventDefault();
        handlers.onOpenSettings();
      }
    });
  }

  get open(): boolean {
    return this.isOpen;
  }

  show(x: number, y: number, persona: Persona): void {
    this.isOpen = true;
    this.setPersona(persona);
    this.status.textContent = "";
    this.transcript.innerHTML = "";
    this.current = null;
    this.el.style.display = "";
    this.position(x, y);
    requestAnimationFrame(() => {
      this.el.classList.add("open");
      this.input.focus();
      this.input.placeholder = `Enter to ask · empty for "${PERSONAS[persona].defaultQuestion}"`;
    });
  }

  focus(): void {
    this.input.focus();
  }

  hide(): void {
    this.isOpen = false;
    this.el.classList.remove("open");
    this.el.style.display = "none";
    this.input.value = "";
  }

  setPersona(p: Persona): void {
    this.personaBtn.textContent = PERSONAS[p].label;
    if (this.isOpen) this.input.placeholder = `Enter to ask · empty for "${PERSONAS[p].defaultQuestion}"`;
  }

  setStatus(text: string): void {
    this.status.textContent = text;
  }

  addUserTurn(text: string): void {
    const div = document.createElement("div");
    div.className = "turn user";
    div.textContent = text;
    this.transcript.append(div);
    this.scrollToEnd();
  }

  beginAssistantTurn(): void {
    const div = document.createElement("div");
    div.className = "turn assistant";
    div.innerHTML = `<p><span class="caret"></span></p>`;
    this.transcript.append(div);
    this.current = div;
    this.scrollToEnd();
  }

  updateAssistantTurn(html: string, streaming: boolean): void {
    if (!this.current) this.beginAssistantTurn();
    this.current!.innerHTML = html + (streaming ? `<span class="caret"></span>` : "");
    this.scrollToEnd();
    this.reposition();
  }

  endAssistantTurn(): void {
    this.current?.querySelector(".caret")?.remove();
    this.current = null;
    this.input.focus();
  }

  showError(message: string, withSettingsLink = false): void {
    this.current?.remove();
    this.current = null;
    const div = document.createElement("div");
    div.className = "turn error";
    div.textContent = message;
    if (withSettingsLink) {
      div.append(" ");
      const a = document.createElement("a");
      a.dataset.action = "settings";
      a.textContent = "Open settings";
      div.append(a);
    }
    this.transcript.append(div);
    this.scrollToEnd();
  }

  private autosize(): void {
    this.input.style.height = "auto";
    this.input.style.height = `${Math.min(120, this.input.scrollHeight)}px`;
  }

  private scrollToEnd(): void {
    this.transcript.scrollTop = this.transcript.scrollHeight;
  }

  private anchor = { x: 0, y: 0 };

  private position(x: number, y: number): void {
    this.anchor = { x, y };
    this.reposition();
  }

  /** Place the panel below-right of the anchor, flipping to keep it on screen. */
  private reposition(): void {
    const { x, y } = this.anchor;
    const h = this.el.offsetHeight || 120;
    let left = x + GAP;
    if (left + WIDTH + MARGIN > innerWidth) left = Math.max(MARGIN, x - GAP - WIDTH);
    let top = y + GAP;
    if (top + h + MARGIN > innerHeight) top = Math.max(MARGIN, innerHeight - h - MARGIN);
    this.el.style.left = `${left}px`;
    this.el.style.top = `${top}px`;
  }
}
