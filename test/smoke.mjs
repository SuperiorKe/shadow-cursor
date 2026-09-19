// Smoke test: load the built extension into Chromium, summon on a fixture page,
// and check the overlay, context capture, and error path (no API key) all work.
// Run with: npm run build && npm test
import { existsSync, mkdirSync, rmSync } from "node:fs";
import http from "node:http";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const dist = resolve(here, "..", "dist");
const outDir = resolve(here, "out");
mkdirSync(outDir, { recursive: true });

const PLAYWRIGHT_CANDIDATES = [
  resolve(here, "..", "node_modules", "playwright", "index.mjs"),
  "/home/kenn/.local/share/mise/installs/npm-playwright/latest/node_modules/.mise/playwright@1.63.0/node_modules/playwright/index.mjs",
];
const pwPath = PLAYWRIGHT_CANDIDATES.find((p) => existsSync(p));
if (!pwPath) {
  console.error("playwright not found; install it or adjust PLAYWRIGHT_CANDIDATES");
  process.exit(2);
}
const { chromium } = await import(pwPath);

const executablePath = process.env.CHROMIUM ?? "/usr/bin/chromium";
const userDataDir = resolve(outDir, "profile");
rmSync(userDataDir, { recursive: true, force: true }); // fresh settings every run


// ---------------------------------------------------------------------------
// Mock Messages API: records the request and streams a reply with marks.
// ---------------------------------------------------------------------------
let lastRequest = null;
const mock = http.createServer((req, res) => {
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    if (req.method !== "POST" || new URL(req.url, "http://x").pathname !== "/v1/messages") {
      res.writeHead(404).end();
      return;
    }
    lastRequest = { headers: req.headers, body: JSON.parse(body) };
    const ctxText = lastRequest.body.messages[0].content.find((b) => b.type === "text")?.text ?? "";
    const targetId = ctxText.match(/^(e\d+) TARGET/m)?.[1] ?? "e1";
    const cancelId = ctxText.match(/^(e\d+)[^\n]*"Cancel"/m)?.[1];
    const reply = [
      "The primary action ", `[[circle:${targetId}]]`, " reads well.\n\n",
      "- Its contrast against the card is strong.\n",
      "- The **Cancel** button", cancelId ? ` [[highlight:${cancelId}]]` : "", " sits too close to a destructive action.",
    ];
    res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache" });
    const send = (event, data) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    send("message_start", {
      type: "message_start",
      message: {
        id: "msg_mock", type: "message", role: "assistant", model: lastRequest.body.model,
        content: [], stop_reason: null, stop_sequence: null,
        usage: { input_tokens: 100, output_tokens: 0 },
      },
    });
    send("content_block_start", { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } });
    let i = 0;
    const tick = setInterval(() => {
      if (i < reply.length) {
        send("content_block_delta", { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: reply[i++] } });
        return;
      }
      clearInterval(tick);
      send("content_block_stop", { type: "content_block_stop", index: 0 });
      send("message_delta", { type: "message_delta", delta: { stop_reason: "end_turn", stop_sequence: null }, usage: { output_tokens: 40 } });
      send("message_stop", { type: "message_stop" });
      res.end();
    }, 30);
  });
});
await new Promise((r) => mock.listen(0, "127.0.0.1", r));
const mockUrl = `http://127.0.0.1:${mock.address().port}`;

let failures = 0;
const check = (name, ok, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
  if (!ok) failures++;
};

const context = await chromium.launchPersistentContext(userDataDir, {
  headless: true,
  executablePath,
  args: [
    "--headless=new",
    "--no-sandbox",
    `--disable-extensions-except=${dist}`,
    `--load-extension=${dist}`,
    "--window-size=1200,800",
  ],
  viewport: { width: 1200, height: 800 },
});

try {
  // Wait for the extension's service worker to register.
  let [sw] = context.serviceWorkers();
  if (!sw) sw = await context.waitForEvent("serviceworker", { timeout: 15000 });
  check("service worker registered", Boolean(sw), sw?.url());

  const page = await context.newPage();
  await page.goto(`file://${resolve(here, "fixture.html")}`);

  const host = page.locator("shadow-cursor-host");
  await host.waitFor({ state: "attached", timeout: 10000 });
  check("overlay host injected", (await host.count()) === 1);

  // Move the mouse; the shadow should follow with lag and become visible.
  await page.mouse.move(300, 300);
  await page.mouse.move(600, 420, { steps: 12 });
  await page.waitForTimeout(400);
  const shadowState = await page.evaluate(() => {
    const root = document.querySelector("shadow-cursor-host").shadowRoot;
    const el = root.querySelector(".shadow");
    const m = el.style.transform.match(/translate\(([\d.]+)px, ([\d.]+)px\)/);
    return { hidden: el.classList.contains("hidden"), x: Number(m?.[1]), y: Number(m?.[2]) };
  });
  check("shadow visible after mouse move", shadowState.hidden === false);
  check(
    "shadow trails near the pointer",
    Math.abs(shadowState.x - 606) < 12 && Math.abs(shadowState.y - 428) < 12,
    `at ${shadowState.x.toFixed(0)},${shadowState.y.toFixed(0)}`,
  );

  // Hover the primary button and summon via the service worker (same path the hotkey uses).
  const save = page.locator("#save");
  const box = await save.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 8 });
  await page.waitForTimeout(150);
  await sw.evaluate(async () => {
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    await chrome.tabs.sendMessage(tab.id, { type: "summon" });
  });

  const popoverOpen = await page
    .waitForFunction(
      () => document.querySelector("shadow-cursor-host")?.shadowRoot?.querySelector(".popover.open") != null,
      null,
      { timeout: 5000 },
    )
    .then(() => true)
    .catch(() => false);
  check("popover opens on summon", popoverOpen);

  const ui = await page.evaluate(() => {
    const root = document.querySelector("shadow-cursor-host").shadowRoot;
    return {
      persona: root.querySelector(".persona")?.textContent,
      focused: root.activeElement?.classList.contains("input") ?? false,
      solid: root.querySelector(".shadow").classList.contains("solid"),
      placeholder: root.querySelector(".input")?.placeholder,
    };
  });
  check("persona label shown", ui.persona === "Critic", ui.persona);
  check("input focused", ui.focused);
  check("shadow snaps solid when summoned", ui.solid);

  // Persona toggle.
  await page.evaluate(() => {
    document.querySelector("shadow-cursor-host").shadowRoot.querySelector(".persona").click();
  });
  const toggled = await page.evaluate(
    () => document.querySelector("shadow-cursor-host").shadowRoot.querySelector(".persona").textContent,
  );
  check("persona toggles to Tutor", toggled === "Tutor", toggled);

  // Submit with no API key configured: the whole pipeline (context, screenshot,
  // port, service worker, settings) must run and surface the no-key error.
  await page.keyboard.type("What does this button do?");
  await page.keyboard.press("Enter");
  const errorText = await page
    .waitForFunction(
      () => document.querySelector("shadow-cursor-host")?.shadowRoot?.querySelector(".turn.error")?.textContent ?? null,
      null,
      { timeout: 10000 },
    )
    .then((h) => h.jsonValue())
    .catch(() => null);
  check("no-key error surfaces in popover", typeof errorText === "string" && /API key/.test(errorText), errorText ?? "none");
  const userTurn = await page.evaluate(
    () => document.querySelector("shadow-cursor-host").shadowRoot.querySelector(".turn.user")?.textContent,
  );
  check("user turn recorded", userTurn === "What does this button do?");

  // Screenshot capture from the service worker works on a file:// page.
  const captured = await sw.evaluate(async () => {
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    const url = await chrome.tabs.captureVisibleTab(tab.windowId, { format: "png" });
    return url.startsWith("data:image/png;base64,") && url.length > 1000;
  });
  check("captureVisibleTab returns a PNG", captured);

  await page.screenshot({ path: resolve(outDir, "summoned.png") });


  // -------------------------------------------------------------------------
  // Full path against the mock API: request payload, streaming, chips, marks.
  // -------------------------------------------------------------------------
  await page.keyboard.press("Escape");
  await page.waitForTimeout(100);
  await sw.evaluate((url) => chrome.storage.local.set({ apiKey: "sk-ant-test", baseUrl: url, persona: "critic" }), mockUrl);
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 4 });
  await page.waitForTimeout(100);
  await sw.evaluate(async () => {
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    await chrome.tabs.sendMessage(tab.id, { type: "summon" });
  });
  await page.waitForFunction(
    () => document.querySelector("shadow-cursor-host")?.shadowRoot?.querySelector(".popover.open") != null,
    null,
    { timeout: 5000 },
  );
  // The page still has Tutor from the toggle above; switch back so the default question is Critic's.
  await page.evaluate(() => {
    document.querySelector("shadow-cursor-host").shadowRoot.querySelector(".persona").click();
  });
  await page.keyboard.press("Enter"); // empty prompt → persona default question
  const answered = await page
    .waitForFunction(
      () => {
        const root = document.querySelector("shadow-cursor-host")?.shadowRoot;
        const turn = root?.querySelector(".turn.assistant");
        return turn && !turn.querySelector(".caret") && root.querySelector(".status")?.textContent;
      },
      null,
      { timeout: 15000 },
    )
    .then(() => true)
    .catch(() => false);
  check("streamed answer completes", answered);
  await page.screenshot({ path: resolve(outDir, "answered.png") });

  check("mock API received a request", lastRequest != null);
  if (lastRequest) {
    const b = lastRequest.body;
    const first = b.messages[0].content;
    const ctxText = first.find((c) => c.type === "text")?.text ?? "";
    check("request streams", b.stream === true);
    check("request uses configured model", b.model === "claude-opus-5", b.model);
    check("system prompt is the Shadow Cursor prompt", Array.isArray(b.system) && /Shadow Cursor/.test(b.system[0].text));
    check("system prompt is cache-marked", b.system?.[0]?.cache_control?.type === "ephemeral");
    check("effort is passed", b.output_config?.effort === "low", JSON.stringify(b.output_config));
    check("refusal fallback enabled on Opus 5", b.fallbacks === "default" && /server-side-fallback/.test(lastRequest.headers["anthropic-beta"] ?? ""));
    check("first turn carries a PNG screenshot", first[0]?.type === "image" && first[0].source?.media_type === "image/png" && first[0].source.data.length > 500);
    check("context names the Save button as TARGET", /^e1 TARGET \| button\[button\] .*"Save changes"/m.test(ctxText), ctxText.split("\n").find((l) => /TARGET/.test(l)));
    check("context includes computed styles", /font \d+px\/\d+, color #/.test(ctxText));
    check("context includes neighbours", /"Cancel"/.test(ctxText) && /"Delete project"/.test(ctxText));
    check("context reports screenshot box", /screenshot shows viewport region/.test(ctxText));
    check("default question appended", /User: Give me quick, honest feedback/.test(ctxText));
  }

  const rendered = await page.evaluate(() => {
    const root = document.querySelector("shadow-cursor-host").shadowRoot;
    const turn = root.querySelector(".turn.assistant");
    return {
      html: turn.innerHTML,
      chips: [...turn.querySelectorAll(".chip")].map((c) => c.textContent),
      circles: root.querySelectorAll(".annot.circle").length,
      highlights: root.querySelectorAll(".annot.highlight").length,
      bullets: turn.querySelectorAll("li").length,
      bold: turn.querySelectorAll("strong").length,
      status: root.querySelector(".status").textContent,
      rawMarksLeaked: /\[\[/.test(turn.textContent),
    };
  });
  check("marks rendered as chips", rendered.chips.length === 2, rendered.chips.join(" / "));
  check("chip labels use element text", rendered.chips[0]?.includes("Save changes") && rendered.chips[1]?.includes("Cancel"));
  check("circle drawn on page", rendered.circles === 1);
  check("highlight drawn on page", rendered.highlights === 1);
  check("markdown bullets and bold rendered", rendered.bullets === 2 && rendered.bold === 1);
  check("no raw [[marks]] leaked", !rendered.rawMarksLeaked);
  check("status shows model", /Opus 5/.test(rendered.status), rendered.status);

  const circleBox = await page.evaluate(() => {
    const root = document.querySelector("shadow-cursor-host").shadowRoot;
    const r = root.querySelector(".annot.circle").getBoundingClientRect();
    return { x: r.left, y: r.top, w: r.width, h: r.height };
  });
  check(
    "circle wraps the Save button",
    circleBox.x < box.x && circleBox.y < box.y && circleBox.x + circleBox.w > box.x + box.width && circleBox.y + circleBox.h > box.y + box.height,
    JSON.stringify(circleBox),
  );

  // Follow-up turn keeps history and does not re-send the screenshot.
  await page.keyboard.type("And the delete button?");
  await page.keyboard.press("Enter");
  await page.waitForFunction(
    () => document.querySelector("shadow-cursor-host")?.shadowRoot?.querySelectorAll(".turn.assistant").length === 2 &&
      !document.querySelector("shadow-cursor-host").shadowRoot.querySelector(".caret"),
    null,
    { timeout: 15000 },
  );
  check("follow-up sends full transcript", lastRequest.body.messages.length === 3, `${lastRequest.body.messages.length} messages`);
  check("follow-up keeps image only on first turn", lastRequest.body.messages[0].content[0].type === "image" && typeof lastRequest.body.messages[2].content === "string");
  check("follow-up assistant turn preserved", /primary action/.test(lastRequest.body.messages[1].content));

  // Escape dismisses and unfreezes.
  await page.keyboard.press("Escape");
  await page.waitForTimeout(100);
  const after = await page.evaluate(() => {
    const root = document.querySelector("shadow-cursor-host").shadowRoot;
    return {
      open: root.querySelector(".popover.open") != null,
      solid: root.querySelector(".shadow").classList.contains("solid"),
      annots: root.querySelectorAll(".annot").length,
    };
  });
  check("escape closes popover", !after.open);
  check("shadow returns to ambient", !after.solid);
  check("annotations cleared", after.annots === 0);
} catch (err) {
  console.error(err);
  failures++;
} finally {
  await context.close();
  mock.close();
}

console.log(failures === 0 ? "\nAll checks passed." : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
