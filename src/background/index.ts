import Anthropic from "@anthropic-ai/sdk";
import type { AskRequest, AskResponse, CaptureResult, PageContext, RuntimeMessage } from "../shared/messages";
import { buildSystemPrompt } from "../shared/personas";
import { getSettings } from "../shared/settings";

// ---------------------------------------------------------------------------
// Summon: hotkey command or toolbar click → tell the active tab's content script.
// ---------------------------------------------------------------------------

chrome.commands.onCommand.addListener((command) => {
  if (command === "summon") void summonActiveTab();
});

chrome.action.onClicked.addListener((tab) => {
  if (tab.id !== undefined) void sendSummon(tab.id);
});

async function summonActiveTab(): Promise<void> {
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  if (tab?.id !== undefined) await sendSummon(tab.id);
}

async function sendSummon(tabId: number): Promise<void> {
  const msg: RuntimeMessage = { type: "summon" };
  try {
    await chrome.tabs.sendMessage(tabId, msg);
  } catch {
    // No content script on this page (chrome://, store, PDF viewer…). Nothing to do.
  }
}

// ---------------------------------------------------------------------------
// One-shot messages from content scripts.
// ---------------------------------------------------------------------------

chrome.runtime.onMessage.addListener((msg: RuntimeMessage, sender, sendResponse) => {
  if (msg?.type === "capture") {
    const windowId = sender.tab?.windowId ?? chrome.windows.WINDOW_ID_CURRENT;
    chrome.tabs
      .captureVisibleTab(windowId, { format: "png" })
      .then((dataUrl) => sendResponse({ ok: true, dataUrl } satisfies CaptureResult))
      .catch((err: unknown) => sendResponse({ ok: false, error: String(err) } satisfies CaptureResult));
    return true; // async response
  }
  if (msg?.type === "openOptions") {
    void chrome.runtime.openOptionsPage();
  }
  return false;
});

// ---------------------------------------------------------------------------
// Streaming ask over a long-lived port.
// ---------------------------------------------------------------------------

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== "ask") return;
  port.onMessage.addListener((msg: AskRequest) => {
    if (msg?.type === "ask") void handleAsk(port, msg);
  });
});

function post(port: chrome.runtime.Port, msg: AskResponse): void {
  try {
    port.postMessage(msg);
  } catch {
    // Port closed by the content script; ignore.
  }
}

async function handleAsk(port: chrome.runtime.Port, req: AskRequest): Promise<void> {
  const settings = await getSettings();
  if (!settings.apiKey) {
    post(port, {
      type: "error",
      code: "no_key",
      message: "No API key yet. Open Shadow Cursor settings to add one.",
    });
    return;
  }

  const client = new Anthropic({
    apiKey: settings.apiKey,
    ...(settings.baseUrl ? { baseURL: settings.baseUrl } : {}),
    dangerouslyAllowBrowser: true,
  });
  const abort = new AbortController();
  port.onDisconnect.addListener(() => abort.abort());

  const isHaiku = settings.model.includes("haiku");
  const isOpus5 = settings.model === "claude-opus-5";

  try {
    const stream = client.beta.messages.stream(
      {
        model: settings.model,
        max_tokens: 8000,
        system: [
          {
            type: "text",
            text: buildSystemPrompt(req.persona),
            cache_control: { type: "ephemeral" },
          },
        ],
        messages: buildMessages(req),
        // Haiku 4.5 rejects output_config.effort; everything newer supports it.
        ...(isHaiku ? {} : { output_config: { effort: settings.effort } }),
        // Server-side refusal fallback: if Opus 5's classifiers decline, the API
        // re-runs the request on a fallback model inside the same call.
        ...(isOpus5
          ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const }
          : {}),
      },
      { signal: abort.signal },
    );

    stream.on("text", (delta) => post(port, { type: "delta", text: delta }));

    const final = await stream.finalMessage();
    if (final.stop_reason === "refusal") {
      post(port, {
        type: "error",
        code: "refusal",
        message: "The model declined to answer this one.",
      });
      return;
    }
    post(port, { type: "done", model: final.model });
  } catch (err) {
    if (abort.signal.aborted) return;
    if (err instanceof Anthropic.AuthenticationError) {
      post(port, { type: "error", code: "auth", message: "That API key was rejected. Check it in settings." });
    } else if (err instanceof Anthropic.RateLimitError) {
      post(port, { type: "error", code: "rate_limit", message: "Rate limited. Try again in a moment." });
    } else if (err instanceof Anthropic.APIError) {
      post(port, { type: "error", code: "other", message: `API error ${err.status ?? ""}: ${err.message}` });
    } else {
      post(port, { type: "error", code: "other", message: err instanceof Error ? err.message : String(err) });
    }
  }
}

function buildMessages(req: AskRequest): Anthropic.Beta.BetaMessageParam[] {
  const messages: Anthropic.Beta.BetaMessageParam[] = [];
  req.turns.forEach((turn, i) => {
    if (i === 0 && turn.role === "user") {
      // First turn carries the screenshot and the DOM context.
      const content: Anthropic.Beta.BetaContentBlockParam[] = [];
      if (req.image) {
        content.push({
          type: "image",
          source: { type: "base64", media_type: req.image.mediaType, data: req.image.data },
        });
      }
      content.push({ type: "text", text: `${formatContext(req.context)}\n\nUser: ${turn.text}` });
      messages.push({ role: "user", content });
    } else {
      messages.push({ role: turn.role, content: turn.text });
    }
  });
  return messages;
}

function formatContext(ctx: PageContext): string {
  const lines: string[] = [];
  lines.push(`Page: ${ctx.title || "(untitled)"} — ${ctx.url}`);
  lines.push(
    `Viewport ${ctx.viewport.w}x${ctx.viewport.h}. Cursor at (${ctx.cursor.x}, ${ctx.cursor.y}).` +
      (ctx.shotBox
        ? ` The screenshot shows viewport region x ${ctx.shotBox.x}–${ctx.shotBox.x + ctx.shotBox.w}, y ${ctx.shotBox.y}–${ctx.shotBox.y + ctx.shotBox.h}.`
        : " No screenshot was available."),
  );
  if (ctx.selection) lines.push(`Selected text: "${ctx.selection}"`);
  lines.push("");
  lines.push("Elements near the cursor (id | tag[role] | text | x,y,w,h | styles):");
  for (const el of ctx.elements) {
    const flag =
      el.ancestorDepth === 0
        ? " TARGET"
        : el.ancestorDepth !== undefined
          ? ` ancestor${el.ancestorDepth}`
          : "";
    const parts = [
      `${el.id}${flag}`,
      el.tag + (el.role ? `[${el.role}]` : "") + (el.classes ? ` .${el.classes}` : ""),
      el.text ? `"${el.text}"` : "",
      `${el.rect.x},${el.rect.y},${el.rect.w},${el.rect.h}`,
      el.styles ?? "",
    ];
    if (el.href) parts.push(`href=${el.href}`);
    lines.push(parts.filter(Boolean).join(" | "));
  }
  return lines.join("\n");
}
