import Link from "next/link";
import { kindLabel, statusLabel } from "@/lib/meeting-view";
import { formatMeetingWhen } from "@/lib/library";
import { formatTimestamp } from "@/lib/playback";
import type { ShareDocument } from "@/lib/share-view";

export function ShareDocumentView({ document }: { document: ShareDocument }) {
  const when = formatMeetingWhen(document.recordedAt);
  return (
    <article>
      <h1 className="text-2xl font-semibold tracking-tight">{document.title}</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        {document.personName ? `Notes for ${document.personName}` : "Whole meeting"}
        {" · "}
        {when}
        {" · "}
        Read-only
      </p>
      {document.tldr.length > 0 ? (
        <section className="mt-8">
          <h2 className="text-lg font-medium">TL;DR</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
            {document.tldr.map((line, index) => (
              <li key={`${index}-${line}`}>{line}</li>
            ))}
          </ul>
        </section>
      ) : null}
      <section className="mt-8">
        <h2 className="text-lg font-medium">Commitments</h2>
        {document.commitments.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">
            {document.personName ? "Nothing for you in this meeting." : "No commitments in this meeting."}
          </p>
        ) : (
          <ul className="mt-3 space-y-3">
            {document.commitments.map((item, index) => (
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
                <p className="mt-2 text-xs text-muted-foreground break-words">
                  {formatTimestamp(item.startMs)} · “{item.quote}”
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
      {document.decisions.length > 0 ? (
        <section className="mt-8">
          <h2 className="text-lg font-medium">Decisions</h2>
          <ul className="mt-3 space-y-3">
            {document.decisions.map((item, index) => (
              <li key={`${item.startMs}-${index}`} className="rounded-lg border p-3">
                <p className="text-sm">{item.text}</p>
                <p className="mt-2 text-xs text-muted-foreground">
                  {formatTimestamp(item.startMs)} · “{item.quote}”
                </p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {document.chapters.length > 0 ? (
        <section className="mt-8">
          <h2 className="text-lg font-medium">Chapters</h2>
          <ul className="mt-2 space-y-1 text-sm">
            {document.chapters.map((chapter) => (
              <li key={`${chapter.startMs}-${chapter.title}`}>
                <span className="text-muted-foreground">{formatTimestamp(chapter.startMs)}</span>
                {" · "}
                {chapter.title}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      <section className="mt-8">
        <h2 className="text-lg font-medium">Transcript</h2>
        {document.lines.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">No transcript lines in this share.</p>
        ) : (
          <ol className="mt-3 space-y-3">
            {document.lines.map((line, index) => (
              <li key={`${line.startMs}-${index}`}>
                <p className="text-xs text-muted-foreground">
                  {line.speaker} · {formatTimestamp(line.startMs)}
                </p>
                <p className="text-sm">{line.text}</p>
              </li>
            ))}
          </ol>
        )}
      </section>
    </article>
  );
}

export function ShareFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-svh flex-1 flex-col">
      <header className="border-b">
        <div className="mx-auto flex w-full max-w-3xl px-6 py-3">
          <Link href="/" className="text-sm font-semibold tracking-tight">
            Kept
          </Link>
        </div>
      </header>
      <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-10">{children}</main>
    </div>
  );
}
