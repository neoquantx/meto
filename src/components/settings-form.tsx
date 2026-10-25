"use client";

import { useState } from "react";
import { BookType, Copy, Download, Languages, Trash2, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { SummaryLanguage } from "@/lib/capture-limits";
import { DELETE_CONFIRM } from "@/lib/settings-form";

const fieldClass =
  "field mt-1.5";

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
  userId,
  glossary,
  summaryLanguage,
}: {
  userId?: string;
  glossary: string[];
  summaryLanguage: SummaryLanguage;
}) {
  const [terms, setTerms] = useState(glossary.join("\n"));
  const [language, setLanguage] = useState<SummaryLanguage>(summaryLanguage);
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState<"save" | "export" | "delete" | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function copyUserId() {
    if (!userId) return;
    setNotice(null);
    setError(null);
    try {
      await navigator.clipboard.writeText(userId);
      setNotice("Account ID copied.");
    } catch {
      setNotice(userId);
    }
  }

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
    <div className="mt-8 grid gap-5 lg:grid-cols-2">
      {userId ? (
        <section className="surface space-y-3 p-5 sm:p-6 lg:col-span-2">
          <div className="flex items-center gap-2">
            <UserRound className="size-4 text-primary" aria-hidden="true" />
            <h2 className="font-semibold">Account ID</h2>
          </div>
          <p className="text-sm text-muted-foreground">
            Use this ID as <code className="rounded bg-muted px-1 py-0.5 text-xs">DEMO_OWNER_ID</code> to publish this account&apos;s meetings to the read-only <code className="rounded bg-muted px-1 py-0.5 text-xs">/demo</code> view.
          </p>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <code className="min-w-0 flex-1 rounded-xl border bg-muted/40 px-3 py-2.5 font-mono text-xs break-all">
              {userId}
            </code>
            <Button type="button" size="sm" variant="outline" onClick={() => void copyUserId()}>
              <Copy className="size-3.5" aria-hidden="true" />
              Copy ID
            </Button>
          </div>
        </section>
      ) : null}
      <section className="surface space-y-5 p-5 sm:p-6 lg:col-span-2">
        <div>
          <div className="flex items-center gap-2">
            <BookType className="size-4 text-primary" aria-hidden="true" />
            <h2 className="font-semibold">Glossary & language</h2>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            One name or phrase per line. The first 100 are sent to transcription, 100 characters each.
          </p>
        </div>
        <label className="block text-sm font-medium">
          Terms
          <textarea className={fieldClass} rows={8} value={terms} onChange={(event) => setTerms(event.target.value)} />
        </label>
        <label className="block text-sm font-medium">
          <span className="flex items-center gap-2">
            <Languages className="size-4 text-muted-foreground" aria-hidden="true" />
            Default summary language
          </span>
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
      <section className="surface space-y-3 p-5 sm:p-6">
        <span className="grid size-10 place-items-center rounded-xl bg-primary/10 text-primary">
          <Download className="size-4.5" aria-hidden="true" />
        </span>
        <h2 className="font-semibold">Export your data</h2>
        <p className="text-sm text-muted-foreground">
          A zip with Markdown and JSON for every meeting. Emails, phone numbers, and card numbers are hidden.
        </p>
        <Button type="button" variant="outline" disabled={busy !== null} onClick={() => void download()}>
          <Download className="size-4" aria-hidden="true" />
          {busy === "export" ? "Exporting…" : "Export all"}
        </Button>
      </section>
      <section className="rounded-2xl border border-destructive/20 bg-destructive/3 p-5 shadow-xs sm:p-6">
        <span className="grid size-10 place-items-center rounded-xl bg-destructive/10 text-destructive">
          <Trash2 className="size-4.5" aria-hidden="true" />
        </span>
        <h2 className="mt-3 font-semibold">Delete all data</h2>
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
      {notice ? <p className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800 lg:col-span-2">{notice}</p> : null}
      {error ? <p className="rounded-xl border border-destructive/20 bg-destructive/5 p-3 text-sm text-destructive lg:col-span-2">{error}</p> : null}
    </div>
  );
}
