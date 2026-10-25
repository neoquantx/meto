"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import type { SummaryLanguage } from "@/lib/capture-limits";
import { DELETE_CONFIRM } from "@/lib/settings-form";

const fieldClass =
  "mt-1 w-full rounded-lg border bg-background px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

async function errorMessage(response: Response, fallback: string) {
  try {
    const body = (await response.json()) as { error?: string };
    if (body.error) return body.error;
  } catch {
    return fallback;
  }
  return fallback;
}

export function SettingsForm({
  glossary,
  summaryLanguage,
}: {
  glossary: string[];
  summaryLanguage: SummaryLanguage;
}) {
  const [terms, setTerms] = useState(glossary.join("\n"));
  const [language, setLanguage] = useState<SummaryLanguage>(summaryLanguage);
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState<"save" | "export" | "delete" | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setBusy("save");
    setNotice(null);
    setError(null);
    try {
      const response = await fetch("/api/settings", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ glossary: terms, summary_language: language }),
      });
      const payload = (await response.json().catch(() => null)) as {
        error?: string;
        glossary?: string[];
        summary_language?: SummaryLanguage;
      } | null;
      if (!response.ok) {
        setError(payload?.error ?? "Could not save settings.");
        setBusy(null);
        return;
      }
      if (payload?.glossary) setTerms(payload.glossary.join("\n"));
      if (payload?.summary_language) setLanguage(payload.summary_language);
      setNotice("Saved. The glossary is used the next time a meeting is transcribed.");
      setBusy(null);
    } catch {
      setError("Could not save settings.");
      setBusy(null);
    }
  }

  async function download() {
    setBusy("export");
    setNotice(null);
    setError(null);
    try {
      const response = await fetch("/api/export");
      if (!response.ok) {
        setError(await errorMessage(response, "Could not export meetings."));
        setBusy(null);
        return;
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "kept-export.zip";
      link.click();
      URL.revokeObjectURL(url);
      setNotice("Export downloaded.");
      setBusy(null);
    } catch {
      setError("Could not export meetings.");
      setBusy(null);
    }
  }

  async function removeAll() {
    setBusy("delete");
    setNotice(null);
    setError(null);
    try {
      const response = await fetch("/api/account", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ confirm }),
      });
      if (!response.ok) {
        setError(await errorMessage(response, "Could not delete your data."));
        setBusy(null);
        return;
      }
      setTerms("");
      setLanguage("en");
      setConfirm("");
      setNotice("Meetings, audio, people, and settings were deleted.");
      setBusy(null);
    } catch {
      setError("Could not delete your data.");
      setBusy(null);
    }
  }

  return (
    <div className="mt-8 max-w-xl space-y-10">
      <section className="space-y-4">
        <div>
          <h2 className="text-lg font-medium">Glossary</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            One name or phrase per line. The first 100 are sent to transcription, 100 characters each.
          </p>
        </div>
        <label className="block text-sm font-medium">
          Terms
          <textarea className={fieldClass} rows={8} value={terms} onChange={(event) => setTerms(event.target.value)} />
        </label>
        <label className="block text-sm font-medium">
          Default summary language
          <select
            className={fieldClass}
            value={language}
            onChange={(event) => setLanguage(event.target.value as SummaryLanguage)}
          >
            <option value="en">English</option>
            <option value="hi">Hindi</option>
            <option value="hinglish">Hinglish</option>
          </select>
          <span className="mt-1 block font-normal text-muted-foreground">
            New meetings start in this language. You can still change it before recording.
          </span>
        </label>
        <Button type="button" disabled={busy !== null} onClick={() => void save()}>
          {busy === "save" ? "Saving…" : "Save settings"}
        </Button>
      </section>
      <section className="space-y-3">
        <h2 className="text-lg font-medium">Export</h2>
        <p className="text-sm text-muted-foreground">
          A zip with Markdown and JSON for every meeting. Emails, phone numbers, and card numbers are hidden.
        </p>
        <Button type="button" variant="outline" disabled={busy !== null} onClick={() => void download()}>
          {busy === "export" ? "Exporting…" : "Export all"}
        </Button>
      </section>
      <section className="space-y-3">
        <h2 className="text-lg font-medium">Delete all</h2>
        <p className="text-sm text-muted-foreground">
          Removes meetings, audio, people, and settings. This cannot be undone. Your sign-in stays.
        </p>
        <label className="block text-sm font-medium">
          Type {DELETE_CONFIRM} to confirm
          <input
            className={fieldClass}
            value={confirm}
            autoComplete="off"
            onChange={(event) => setConfirm(event.target.value)}
          />
        </label>
        <Button
          type="button"
          variant="destructive"
          disabled={busy !== null || confirm !== DELETE_CONFIRM}
          onClick={() => void removeAll()}
        >
          {busy === "delete" ? "Deleting…" : "Delete everything"}
        </Button>
      </section>
      {notice ? <p className="text-sm text-muted-foreground">{notice}</p> : null}
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </div>
  );
}
