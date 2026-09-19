import { getSettings, saveSettings, type Effort } from "../shared/settings";
import type { Persona } from "../shared/messages";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

async function load(): Promise<void> {
  const s = await getSettings();
  $<HTMLInputElement>("apiKey").value = s.apiKey;
  $<HTMLInputElement>("baseUrl").value = s.baseUrl;
  $<HTMLSelectElement>("model").value = s.model;
  $<HTMLSelectElement>("effort").value = s.effort;
  $<HTMLSelectElement>("persona").value = s.persona;
}

async function save(): Promise<void> {
  await saveSettings({
    apiKey: $<HTMLInputElement>("apiKey").value.trim(),
    baseUrl: $<HTMLInputElement>("baseUrl").value.trim().replace(/\/+$/, ""),
    model: $<HTMLSelectElement>("model").value,
    effort: $<HTMLSelectElement>("effort").value as Effort,
    persona: $<HTMLSelectElement>("persona").value as Persona,
  });
  const status = $("status");
  status.textContent = "Saved";
  setTimeout(() => (status.textContent = ""), 1500);
}

$("save").addEventListener("click", () => void save());
void load();
