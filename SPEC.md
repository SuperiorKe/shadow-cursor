# Shadow Cursor

**Status:** Draft v0.1
**Date:** 2026-09-19
**Owner:** Kenn

---

## 1. Summary

Shadow Cursor is a second cursor on your screen with an LLM brain. It trails your real cursor as a quiet presence, notices things worth saying, and can be summoned at any moment to critique, explain, research, or demonstrate, directly on top of whatever app you are using. You never leave the screen you are working in.

Pointing is the most natural way to say "this." No existing AI tool lets you point at anything on your screen, in any app, and ask about it. Shadow Cursor makes "this" a first-class input.

---

## 2. Problem

Getting help today means context switching. You screenshot, alt-tab to a chat window, paste, describe what you were looking at, read the answer, and switch back. The cost of asking is high enough that most small questions never get asked, and most small pieces of feedback never get given.

Existing tools are app-bound. Code assistants live in the editor. Design assistants live in the design tool. Browser assistants live in the tab. None of them can follow you across your whole screen, and none of them can point back at what they mean.

Learning a new tool is especially painful. Tutorials live outside the tool. Documentation describes UI you cannot see. The gap between "read about it" and "do it" is where people give up.

---

## 3. Concept

A colleague leaning over your shoulder. They can see your screen, you can point at things and ask, and they can point back. They stay quiet unless they have something worth saying or you turn to ask.

Three abilities define the product:

1. **Point and ask.** Hover anything, summon, ask. The region under the cursor is the context.
2. **Point back.** The shadow can move on its own, circle things, draw ghost annotations, and walk you through a flow by physically showing you where to go.
3. **Remember.** It knows what you worked on, what you asked before, and what you are trying to learn.

Everything else, including personas, research, critique, and tutoring, is built on these three.

---

## 4. Design principles

- **Never interrupt.** The shadow never speaks unprompted. It signals, you decide.
- **Zero cost to ignore.** Ambient thoughts expire silently. No queue, no badge, no inbox.
- **Latency is the product.** The fast path must feel like a colleague answering, not a request loading.
- **Show, don't tell.** Prefer moving the cursor or drawing on screen over paragraphs of text.
- **Vision is the floor, adapters are the ceiling.** It works on any pixels. It works better where it understands the app.
- **Nothing leaves the machine until you ask.** Ambient observation is on-device. Cloud calls happen only on summon.

---

## 5. Interaction model

The shadow is one cursor with two states. The states share one brain and one memory.

### 5.1 Ambient state

The shadow idles slightly behind the real cursor, mostly transparent, trailing with a small lag like a real shadow.

It watches passively using cheap on-device heuristics and a small local model on low-resolution, region-only captures. When it notices something worth saying it does not speak. Instead:

- It stops trailing the cursor and drifts toward the thing it noticed.
- It waits there and pulses faintly.
- If the user hovers onto it or glances at it, the thought unfolds in a small popover.
- If ignored for a few seconds, the thought expires and the shadow drifts back to trailing.

Ambient rules:

- **Ambient only notices, never acts.** It may pulse and move. It may not annotate, speak, or modify anything.
- **Thoughts expire.** No persistence, no counter, no history of unread nudges.
- **Sensitivity is a dial.** Off / Quiet / Chatty. Quiet pulses only for high-confidence, high-consequence findings such as a contrast failure, a broken link, or a mismatched number. Chatty includes stylistic opinions.
- **Per-app memory.** Sensitivity is remembered per application. Dismissing the same kind of nudge three times silences that kind of nudge in that app.

### 5.2 Summoned state

Trigger: a global hotkey, or hold-to-talk.

On summon the shadow snaps solid, detaches from the real cursor, and becomes an independent pointer. A small popover anchors to it. The user types or speaks. The shadow can now:

- Answer in the popover, streamed.
- Circle, underline, or highlight regions of the screen with ghost annotations.
- Move itself to demonstrate where something is or what sequence of clicks to perform.
- Draw an overlay showing an alternative, such as a redesigned layout ghosted over the current one.

Releasing the hotkey or pressing Escape returns it to ambient. Annotations fade over a few seconds unless pinned.

### 5.3 Handoff between states

- If the shadow was pulsing about something when summoned, that thing is the first thing it says.
- Context from the ambient state, such as recent regions observed and the current app, carries into the summon.
- The user can promote an ambient thought to a full summon with a single click on the shadow.

### 5.4 Input

- **Hotkey** to summon. Configurable, default to be decided.
- **Hold-to-talk** voice, transcribed locally.
- **Typed prompt** in the popover.
- **Point-only.** Summon with no prompt means "what is this?" or "thoughts?" depending on the active persona.

### 5.5 Output

- Streamed text in a cursor-anchored popover.
- Ghost annotations: circles, arrows, highlights, strikeouts, drawn on a transparent overlay.
- Cursor motion: the shadow moves to demonstrate.
- Ghost overlays: proposed alternatives rendered semi-transparently over the real UI.
- Optional text-to-speech for hands-free use.

---

## 6. Personas

Personas are system prompts plus default sensitivity settings on the same cursor. The user picks one per app or globally, and can switch mid-summon.

| Persona | Ambient notices | Summon behaviour |
|---|---|---|
| **Critic** | Inconsistency, hierarchy, spacing, contrast | Direct critique, proposes alternatives, draws overlays |
| **Tutor** | Nothing by default | Socratic, explains step by step, demonstrates by moving |
| **Researcher** | Claims that look checkable | Looks things up, compares to references, cites |
| **Reviewer** | Errors, warnings, suspicious values | Explains, finds the source, suggests a fix |
| **Guide** | Hesitation patterns, repeated failed clicks | Shows where things are in an unfamiliar app |

---

## 7. Use cases

**Designer**
- Hover a component, ask for a critique of hierarchy and spacing.
- Hover a colour pair, get an instant accessibility check.
- Ask "how would Stripe do this" and get a ghost overlay of an alternative on the canvas.
- Ambient: shadow drifts to a button whose padding does not match its siblings.

**Developer**
- Hover a stack trace in the terminal, get an explanation.
- Hover a button in the running app, ask which file renders it.
- Hover a config value, ask what it does.
- Ambient: shadow drifts to a warning that scrolled past.

**Learner**
- Hover a formula in a PDF, get a step-by-step walkthrough.
- Hover a word in a foreign language.
- Point at a menu in an unfamiliar app, ask what it is for.
- Ask "how do I export this" and watch the shadow glide through the menus.

**Knowledge worker**
- Hover a spreadsheet cell, ask what the formula does.
- Hover a chart, ask whether the claim it makes holds up.
- Hover a paragraph, ask for a shorter version, drop it in place.

---

## 8. Architecture

```
┌──────────────────────────────────────────────────────────┐
│  Overlay (transparent, always-on-top)                    │
│  shadow cursor · popover · annotations · ghost overlays  │
├──────────────────────────────────────────────────────────┤
│  Interaction controller                                  │
│  state machine: ambient ⇄ summoned · hotkeys · voice     │
├──────────────────────────────────────────────────────────┤
│  Context engine                                          │
│  region capture · accessibility tree · app adapters      │
│  redaction · memory                                      │
├──────────────────────────────────────────────────────────┤
│  Brain                                                   │
│  local watcher (ambient) · fast tier · deep tier         │
│  persona prompts · tool use (search, fetch)              │
└──────────────────────────────────────────────────────────┘
```

### 8.1 Overlay

A transparent, click-through, always-on-top surface that draws the shadow cursor, popovers, and annotations.

- **macOS:** NSWindow at a high window level, plus the Accessibility API for the semantic tree.
- **Windows:** layered topmost window, plus UI Automation.
- **Linux (Wayland / Hyprland):** layer-shell surface. Screen capture via the portal APIs. This is the hardest platform for capture and should not be first.
- **Browser:** an extension injecting an overlay into the page. No OS permissions required.

### 8.2 Context engine

Context is captured in layers. Every layer that is available is used.

1. **Region screenshot.** A crop around the cursor, downscaled. Always available.
2. **Accessibility tree.** Semantic text and roles for the elements under and around the cursor. Available on most native apps.
3. **App adapters.** Rich structured context where an integration exists:
   - Browser extension: DOM, computed styles, selection.
   - Figma plugin: node tree, styles, constraints.
   - VS Code extension: buffer, cursor position, diagnostics.
4. **Memory.** Recent observations, past questions, per-app preferences, learning progress.

Redaction runs before anything leaves the device: fields that look like passwords, tokens, card numbers, and any region the user has marked private.

### 8.3 Brain

Three tiers, escalating by cost.

- **Local watcher.** Runs continuously in ambient state. Cheap heuristics plus a small on-device vision model on low-resolution captures. Its only job is to decide whether something is worth a pulse. Never leaves the device.
- **Fast tier.** A small, fast multimodal model. Handles hover explanations, quick checks, and the first response on summon. Target: first token well under one second.
- **Deep tier.** A frontier multimodal model. Handles critiques, research, multi-step demonstrations, and anything with tool use. Streams into the popover while the fast tier's answer is already visible.

The brain has tools: web search, fetch, and, through adapters, the ability to read more of the app than what is under the cursor.

### 8.4 Memory

- Short-term: what has been on screen in the last few minutes.
- Session: what the user has asked and what the shadow has said.
- Long-term: per-app preferences, dismissed nudge categories, and a learning log per topic.

All stored locally. Cloud sync is optional and off by default.

---

## 9. Privacy and trust

Screen capture is the most sensitive permission an app can ask for. The product lives or dies on trust.

- Ambient observation is entirely on-device.
- Captures are region-only around the cursor, never full screen, unless the user explicitly asks for a whole-screen review.
- Nothing is sent to a cloud model until the user summons.
- Redaction runs before every upload.
- A visible indicator shows when a cloud call is in flight.
- A per-app blocklist, defaulting to include password managers and banking sites.
- A fully local mode using on-device models for both tiers, with reduced capability.
- A one-key "forget the last minute" action.

---

## 10. Platform strategy and roadmap

### Phase 1: Browser extension (MVP)

The DOM gives rich context for free, distribution is simple, and much design and development work already happens in a tab.

Scope:
- Shadow cursor rendered in-page, trailing the real cursor.
- Hotkey summon with a cursor-anchored popover.
- Context: region screenshot plus DOM under the cursor.
- Fast tier only, one model call, streamed response.
- Ghost annotations: circle and highlight.
- Critic and Tutor personas.
- No ambient state yet. Ambient is Phase 2.

Success: a designer or developer uses it more than five times a day without being asked to.

### Phase 2: Ambient and memory

- Local watcher and the pulse-and-drift behaviour.
- Sensitivity dial, per-site memory, dismissal learning.
- Deep tier with search and fetch tools.
- Researcher and Reviewer personas.

### Phase 3: Figma plugin

The designer wedge. Node-tree context, ghost overlays of alternatives drawn on the canvas, Critic persona tuned for design systems.

### Phase 4: Desktop overlay

macOS first, then Windows, then Linux. Accessibility tree as the primary context layer. Guide persona for learning unfamiliar apps. Cross-app memory.

---

## 11. Non-goals

- Not an autonomous agent. The shadow does not click, type, or modify anything on the user's behalf in v1. It shows, the user does.
- Not a chat app. There is no chat history view. Conversations are ephemeral and anchored to the screen.
- Not a screen recorder. Nothing is stored as video or as a searchable timeline of past screens.
- Not a replacement for in-app assistants. Where an app has a good native assistant, the shadow should defer or hand off.

---

## 12. Risks

| Risk | Mitigation |
|---|---|
| Latency breaks the colleague illusion | Two-tier model, streaming, aggressive region cropping, local fast path |
| Hallucinating about pixels | Prefer accessibility tree and adapters over vision; show confidence; cite the region it is talking about |
| Ambient becomes annoying | Expiring thoughts, sensitivity dial, dismissal learning, quiet default |
| Privacy backlash | On-device ambient, region-only capture, visible upload indicator, local mode |
| OS permission friction | Browser first; on desktop, a clear onboarding for capture and accessibility permissions |
| Wayland capture limitations | Linux last; use portal APIs; degrade gracefully to adapter-only context |
| Costs of continuous inference | Ambient never calls the cloud; heuristics gate the small local model |

---

## 13. Success metrics

- Summons per active hour.
- Ambient pulses expanded versus ignored, by persona and app.
- Time from summon to first token.
- Percentage of sessions where the shadow moved to demonstrate rather than only answering in text.
- Retention at day seven and day thirty.
- Nudge dismissal rate trending down over time as per-app learning kicks in.

---

## 14. Open questions

- Default hotkey. Needs to be reachable one-handed and unclaimed by common apps.
- Should summon with no prompt default to "what is this" or to the persona's default question?
- How long should ambient thoughts live before expiring? Start with a few seconds and tune.
- Should the shadow ever act in later versions, such as applying a suggested fix on confirmation?
- Pricing model. Local mode free, cloud tiers subscription? Bring-your-own-key?
- Voice always on in summoned state, or opt-in?

---

## 15. Glossary

- **Shadow:** the second cursor.
- **Pulse:** the ambient signal that the shadow has a thought.
- **Drift:** the shadow moving from trailing the cursor to the thing it noticed.
- **Summon:** switching the shadow to its active, independent state.
- **Ghost annotation:** a temporary mark drawn on the overlay.
- **Ghost overlay:** a semi-transparent proposed alternative drawn over real UI.
- **Adapter:** an app-specific integration that provides structured context.
- **Persona:** a system prompt plus default settings that shapes what the shadow notices and how it answers.
