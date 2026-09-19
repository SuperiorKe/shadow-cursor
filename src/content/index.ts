import type { AskRequest, AskResponse, Persona, RuntimeMessage, Turn } from "../shared/messages";
import { PERSONAS } from "../shared/personas";
import { getSettings, saveSettings } from "../shared/settings";
import { Annotations } from "./annotations";
import { captureRegion, collectContext, type CollectedContext, type RegionShot } from "./context";
import { renderMarkup } from "./markup";
import { createOverlay } from "./overlay";
import { Popover } from "./popover";
import { ShadowCursor } from "./shadow";

interface Session {
  anchor: { x: number; y: number };
  collected: CollectedContext;
  shot: Promise<RegionShot | null>;
  turns: Turn[];
  port: chrome.runtime.Port | null;
  busy: boolean;
}

// Guard against double-injection (extension reload while the page is open).
if (!(window as unknown as { __shadowCursor?: boolean }).__shadowCursor) {
  (window as unknown as { __shadowCursor?: boolean }).__shadowCursor = true;
  boot();
}

function boot(): void {
  const overlay = createOverlay();
  const shadow = new ShadowCursor(overlay.root);
  const annotations = new Annotations(overlay.root);
  let persona: Persona = "critic";
  let session: Session | null = null;

  void getSettings().then((s) => {
    persona = s.persona;
    popover.setPersona(persona);
  });

  const popover = new Popover(overlay.root, {
    onSubmit: (text) => void ask(text),
    onClose: dismiss,
    onTogglePersona: () => {
      persona = persona === "critic" ? "tutor" : "critic";
      popover.setPersona(persona);
      void saveSettings({ persona });
    },
    onChipHover: (kind, id) => {
      const el = session?.collected.elements.get(id);
      if (el) {
        annotations.flash(kind as "circle" | "highlight", el);
        shadow.glideTo(centerOf(el));
      }
    },
    onOpenSettings: () => void chrome.runtime.sendMessage({ type: "openOptions" } satisfies RuntimeMessage),
  });

  chrome.runtime.onMessage.addListener((msg: RuntimeMessage) => {
    if (msg?.type === "summon") toggle();
  });

  // Escape anywhere dismisses, even if focus wandered back to the page.
  document.addEventListener(
    "keydown",
    (e) => {
      if (e.key === "Escape" && popover.open) dismiss();
    },
    true,
  );

  function toggle(): void {
    if (popover.open || session) dismiss();
    else void summon();
  }

  async function summon(): Promise<void> {
    const { x, y } = shadow.pointerPosition;
    shadow.freeze({ x, y });

    // Gather context now so the first question has zero extra latency. The
    // screenshot hides the overlay for a frame, so take it before the popover
    // appears; the popover opens as soon as the shot lands (or after a short cap).
    const collected = collectContext(x, y);
    const s: Session = { anchor: { x, y }, collected, shot: Promise.resolve(null), turns: [], port: null, busy: false };
    session = s;
    s.shot = captureRegion(x, y, overlay.hide, () => {
      overlay.show();
      if (popover.open) popover.focus();
    }).then((r) => {
      if (r) s.collected.context.shotBox = r.box;
      return r;
    });
    await Promise.race([s.shot, delay(400)]);
    if (session !== s) return; // dismissed before we got here
    popover.show(x, y, persona);
  }

  function dismiss(): void {
    session?.port?.disconnect();
    session = null;
    popover.hide();
    annotations.clear();
    shadow.unfreeze();
  }

  async function ask(text: string): Promise<void> {
    if (!session || session.busy) return;
    const s = session;
    const prompt = text.trim() || PERSONAS[persona].defaultQuestion;

    s.busy = true;
    s.turns.push({ role: "user", text: prompt });
    popover.addUserTurn(prompt);
    popover.beginAssistantTurn();
    popover.setStatus("looking…");
    shadow.setThinking(true);

    const shot = await s.shot;
    if (session !== s) return; // dismissed while capturing

    const req: AskRequest = {
      type: "ask",
      persona,
      context: s.collected.context,
      image: shot ? { mediaType: "image/png", data: shot.data } : undefined,
      turns: s.turns,
    };

    let acc = "";
    let pointed = false;
    const labelFor = (id: string): string | undefined => {
      const info = s.collected.context.elements.find((e) => e.id === id);
      if (!info) return undefined;
      return info.text ? info.text.slice(0, 28) : info.role ?? info.tag;
    };
    const render = (streaming: boolean): void => {
      const html = renderMarkup(acc, labelFor, ({ kind, id }) => {
        const el = s.collected.elements.get(id);
        if (!el) return;
        const added = annotations.add(kind, el);
        if (added && !pointed) {
          pointed = true;
          shadow.glideTo(centerOf(el));
        }
      });
      popover.updateAssistantTurn(html, streaming);
    };

    let port: chrome.runtime.Port;
    try {
      port = chrome.runtime.connect({ name: "ask" });
    } catch {
      finish();
      popover.showError("Shadow Cursor was updated. Reload this page to reconnect.");
      return;
    }
    s.port = port;
    popover.setStatus("thinking…");

    port.onMessage.addListener((msg: AskResponse) => {
      if (session !== s) return;
      switch (msg.type) {
        case "delta":
          acc += msg.text;
          render(true);
          break;
        case "done":
          render(false);
          s.turns.push({ role: "assistant", text: acc });
          popover.setStatus(shortModel(msg.model));
          finish();
          break;
        case "error":
          popover.setStatus("");
          if (acc) {
            render(false);
            s.turns.push({ role: "assistant", text: acc });
          }
          popover.showError(msg.message, msg.code === "no_key" || msg.code === "auth");
          finish();
          break;
      }
    });
    port.onDisconnect.addListener(() => {
      if (session === s && s.busy) {
        popover.setStatus("");
        popover.showError("Lost connection to the extension.");
        finish();
      }
    });
    port.postMessage(req);

    function finish(): void {
      s.busy = false;
      s.port = null;
      shadow.setThinking(false);
      popover.endAssistantTurn();
    }
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function centerOf(el: Element): { x: number; y: number } {
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}

function shortModel(model: string): string {
  return model
    .replace(/^claude-/, "")
    .replace(/-(\d)-(\d)$/, " $1.$2")
    .replace(/-(\d)$/, " $1")
    .replace(/^\w/, (c) => c.toUpperCase());
}
