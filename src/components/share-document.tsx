"use client";

import { useEffect } from "react";
import Link from "next/link";
import { CheckCircle2, ShieldCheck } from "lucide-react";
import { kindLabel, statusLabel } from "@/lib/meeting-view";
import { formatMeetingWhen } from "@/lib/library";
import { formatTimestamp } from "@/lib/playback";
import type { ShareDocument } from "@/lib/share-view";

function findHighlightedLineIndex(lines: ShareDocument["lines"], startAtMs: number | null) {
  if (startAtMs == null || !Number.isFinite(startAtMs) || lines.length === 0) return -1;
  let match = 0;
  for (let i = 0; i < lines.length; i += 1) {
    if (lines[i].startMs <= startAtMs) match = i;
    else break;
  }
  return match;
}

export function ShareDocumentView({
  document: doc,
  startAtMs = null,
}: {
  document: ShareDocument;
  startAtMs?: number | null;
}) {
  const when = formatMeetingWhen(doc.recordedAt);
  const highlightIdx = findHighlightedLineIndex(doc.lines, startAtMs);

  useEffect(() => {
    if (highlightIdx < 0) return;
    const el = window.document.getElementById(`share-line-${highlightIdx}`);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [highlightIdx]);

  function jumpToMs(ms: number) {
    const idx = findHighlightedLineIndex(doc.lines, ms);
    if (idx < 0) return;
    const el = window.document.getElementById(`share-line-${idx}`);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  return (
    <article className="surface overflow-hidden">
      <header className="border-b border-border/70 bg-gradient-to-r from-primary/8 to-cyan-500/5 p-5 sm:p-8">
        <div className="flex flex-wrap items-center gap-2 text-xs font-medium text-primary">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/15 bg-card/70 px-2.5 py-1">
            <ShieldCheck className="size-3.5" aria-hidden="true" />
            Redacted & read-only
          </span>
          <span>{when}</span>
        </div>
        <h1 className="mt-4 text-3xl font-semibold tracking-[-0.035em] break-words">{doc.title}</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {doc.personName ? `Notes prepared for ${doc.personName}` : "Shared meeting notes"}
        </p>
      </header>
      <div className="p-5 sm:p-8">
      {doc.tldr.length > 0 ? (
        <section className="mt-8">
          <h2 className="text-lg font-medium">TL;DR</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
            {doc.tldr.map((line, index) => (
              <li key={`${index}-${line}`}>{line}</li>
            ))}
          </ul>
        </section>
      ) : null}
      <section className="mt-8">
        <h2 className="text-lg font-medium">Commitments</h2>
        {doc.commitments.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">
            {doc.personName ? "Nothing for you in this meeting." : "No commitments in this meeting."}
          </p>
        ) : (
          <ul className="mt-3 space-y-3">
            {doc.commitments.map((item, index) => (
              <li key={`${item.startMs}-${index}`} className="rounded-lg border p-3">
                <p className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="rounded-full border px-2 py-0.5">{kindLabel(item.kind)}</span>
                  <span className="text-muted-foreground">{item.owner}</span>
                  <span className="text-muted-foreground">{statusLabel(item.status) ?? "Open"}</span>
                </p>
                <p className="mt-2 text-sm break-words">{item.text}</p>
                {item.condition ? <p className="mt-1 text-sm text-muted-foreground break-words">If {item.condition}</p> : null}
                {item.dueDate ? <p className="mt-1 text-sm text-muted-foreground">Due {item.dueDate}</p> : null}
                {item.changeNote ? <p className="mt-1 text-sm text-muted-foreground break-words">{item.changeNote}</p> : null}
                <button
                  type="button"
                  onClick={() => jumpToMs(item.startMs)}
                  className="mt-2 text-left text-xs text-muted-foreground hover:text-primary hover:underline break-words"
                >
                  {formatTimestamp(item.startMs)} · “{item.quote}”
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
      {doc.decisions.length > 0 ? (
        <section className="mt-8">
          <h2 className="text-lg font-medium">Decisions</h2>
          <ul className="mt-3 space-y-3">
            {doc.decisions.map((item, index) => (
              <li key={`${item.startMs}-${index}`} className="rounded-lg border p-3">
                <p className="text-sm">{item.text}</p>
                <button
                  type="button"
                  onClick={() => jumpToMs(item.startMs)}
                  className="mt-2 text-left text-xs text-muted-foreground hover:text-primary hover:underline"
                >
                  {formatTimestamp(item.startMs)} · “{item.quote}”
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {doc.chapters.length > 0 ? (
        <section className="mt-8">
          <h2 className="text-lg font-medium">Chapters</h2>
          <ul className="mt-2 space-y-1 text-sm">
            {doc.chapters.map((chapter) => (
              <li key={`${chapter.startMs}-${chapter.title}`}>
                <button
                  type="button"
                  onClick={() => jumpToMs(chapter.startMs)}
                  className="text-left hover:text-primary hover:underline"
                >
                  <span className="text-muted-foreground">{formatTimestamp(chapter.startMs)}</span>
                  {" · "}
                  {chapter.title}
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      <section className="mt-8">
        <h2 className="text-lg font-medium">Transcript</h2>
        {doc.lines.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">No transcript lines in this share.</p>
        ) : (
          <ol className="mt-3 space-y-3">
            {doc.lines.map((line, index) => {
              const highlighted = index === highlightIdx;
              return (
                <li
                  key={`${line.startMs}-${index}`}
                  id={`share-line-${index}`}
                  className={
                    highlighted
                      ? "rounded-xl bg-primary/8 px-3 py-2.5 ring-1 ring-primary/20"
                      : undefined
                  }
                >
                  <p className="text-xs text-muted-foreground">
                    {line.speaker} · {formatTimestamp(line.startMs)}
                  </p>
                  <p className="text-sm">{line.text}</p>
                </li>
              );
            })}
          </ol>
        )}
      </section>
      </div>
    </article>
  );
}

export function ShareFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-svh flex-1 flex-col">
      <header className="border-b border-border/70 bg-background/85 backdrop-blur-xl">
        <div className="mx-auto flex min-h-16 w-full max-w-4xl items-center px-4 sm:px-6">
          <Link href="/" className="flex items-center gap-2.5 text-sm font-semibold tracking-tight">
            <span className="grid size-8 place-items-center rounded-lg bg-primary text-primary-foreground">
              <CheckCircle2 className="size-4" aria-hidden="true" />
            </span>
            Kept
          </Link>
        </div>
      </header>
      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-6 sm:px-6 sm:py-10">{children}</main>
    </div>
  );
}
