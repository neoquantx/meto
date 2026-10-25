import { glossaryKeyterms } from "@/lib/deepgram";
import type { SummaryLanguage } from "@/lib/capture-limits";

export const DELETE_CONFIRM = "delete all";

export type OwnerSettings = {
  glossary: string[];
  summaryLanguage: SummaryLanguage;
};

export function readSettings(row: unknown): OwnerSettings {
  if (!row || typeof row !== "object") return { glossary: [], summaryLanguage: "en" };
  const record = row as Record<string, unknown>;
  return {
    glossary: glossaryKeyterms(record.glossary),
    summaryLanguage: languageOf(record.summary_language),
  };
}

export function parseSettingsSave(
  body: unknown,
): { ok: true; glossary: string[]; summaryLanguage: SummaryLanguage } | { ok: false; error: string } {
  if (!body || typeof body !== "object") return { ok: false, error: "Send the glossary and summary language." };
  const record = body as Record<string, unknown>;
  if (!("glossary" in record) || !("summary_language" in record)) {
    return { ok: false, error: "Send the glossary and summary language." };
  }
  const language = record.summary_language;
  if (language !== "en" && language !== "hi" && language !== "hinglish") {
    return { ok: false, error: "Choose English, Hindi, or Hinglish." };
  }
  return {
    ok: true,
    glossary: glossaryKeyterms(glossaryLines(record.glossary)),
    summaryLanguage: language,
  };
}

export function parseDeleteAll(body: unknown): { ok: true } | { ok: false; error: string } {
  if (!body || typeof body !== "object") {
    return { ok: false, error: 'Type "delete all" to confirm.' };
  }
  const confirm = (body as { confirm?: unknown }).confirm;
  if (confirm !== DELETE_CONFIRM) return { ok: false, error: 'Type "delete all" to confirm.' };
  return { ok: true };
}

export function audioPathsToRemove(ownerId: string, names: string[], stored: (string | null)[]) {
  const prefix = `${ownerId}/`;
  const paths = new Set<string>();
  for (const name of names) {
    if (!name || name.includes("/") || name.includes("\\") || name.includes("..")) continue;
    paths.add(`${prefix}${name}`);
  }
  for (const path of stored) {
    if (!path || path.includes("..") || !path.startsWith(prefix)) continue;
    const rest = path.slice(prefix.length);
    if (!rest || rest.includes("/")) continue;
    paths.add(path);
  }
  return [...paths];
}

function glossaryLines(value: unknown) {
  if (typeof value === "string") return value.split(/\r?\n/);
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
}

function languageOf(value: unknown): SummaryLanguage {
  if (value === "hi" || value === "hinglish") return value;
  return "en";
}
