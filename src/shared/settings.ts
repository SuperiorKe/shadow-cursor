import type { Persona } from "./messages";

export type Effort = "low" | "medium" | "high";

export interface Settings {
  apiKey: string;
  /** Optional override, e.g. a proxy. Empty means api.anthropic.com. */
  baseUrl: string;
  model: string;
  effort: Effort;
  persona: Persona;
}

export const DEFAULT_SETTINGS: Settings = {
  apiKey: "",
  baseUrl: "",
  model: "claude-opus-5",
  effort: "low",
  persona: "critic",
};

export async function getSettings(): Promise<Settings> {
  const stored = await chrome.storage.local.get({ ...DEFAULT_SETTINGS } as Record<string, unknown>);
  return { ...DEFAULT_SETTINGS, ...(stored as Partial<Settings>) };
}

export async function saveSettings(patch: Partial<Settings>): Promise<void> {
  await chrome.storage.local.set(patch);
}
