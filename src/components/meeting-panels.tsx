"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  kindLabel,
  ownerLabel,
  statusLabel,
  whoOwesWhat,
  type ChapterRow,
  type CommitmentRow,
  type DecisionRow,
  type ReviewState,
  type SpeakerRow,
} from "@/lib/meeting-view";
import { formatTimestamp } from "@/lib/playback";
import { normalizePersonName, personNameKey } from "@/lib/speakers";

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

export function SpeakerPanel({
  meetingId,
  speakers,
}: {
  meetingId: string;
  speakers: SpeakerRow[];
}) {
  const router = useRouter();
  const [drafts, setDrafts] = useState<Record<number, string>>(() =>
    Object.fromEntries(speakers.map((speaker) => [speaker.speaker, speaker.name ?? ""])),
  );
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setSaving(true);
    setSaved(false);
    setError(null);
    const payload: { speaker: number; name: string }[] = [];
    for (const speaker of speakers) {
      const normalized = normalizePersonName(drafts[speaker.speaker] ?? "");
      if (!normalized.ok) {
        setError(normalized.error);
        setSaving(false);
        return;
      }
      payload.push({ speaker: speaker.speaker, name: normalized.name ?? "" });
    }

    try {
      const response = await fetch(`/api/meetings/${meetingId}/speakers`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ speakers: payload }),
      });
      if (!response.ok) {
        setError(await errorMessage(response, "Could not save speaker names."));
        setSaving(false);
        return;
      }
      const body = (await response.json()) as { speakers?: { speaker: number; name: string | null }[] };
      if (body.speakers) {
        setDrafts((current) => {
          const next = { ...current };
          for (const speaker of body.speakers ?? []) next[speaker.speaker] = speaker.name ?? "";
          return next;
        });
      }
      setSaved(true);
      setSaving(false);
      router.refresh();
    } catch {
      setError("Could not save speaker names.");
      setSaving(false);
    }
  }

  return (
    <section>
      <h2 className="text-lg font-medium">Speakers</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        A suggested name is filled in only when you use it.
      </p>
      <ul className="mt-3 space-y-4">
        {speakers.map((speaker) => {
          const draft = drafts[speaker.speaker] ?? "";
          const normalized = normalizePersonName(draft);
          const draftKey = normalized.ok && normalized.name ? personNameKey(normalized.name) : "";
          const hint = speaker.name_hint;
          const showHint = Boolean(hint && personNameKey(hint) !== draftKey);
          return (
            <li key={speaker.speaker}>
              <label className="text-sm font-medium" htmlFor={`speaker-${speaker.speaker}`}>
                Speaker {speaker.speaker}
              </label>
              <input
                id={`speaker-${speaker.speaker}`}
                className={fieldClass}
                value={draft}
                maxLength={80}
                placeholder="Name"
                onChange={(event) => {
                  setSaved(false);
                  setDrafts((current) => ({ ...current, [speaker.speaker]: event.target.value }));
                }}
              />
              {showHint && hint ? (
                <Button
                  className="mt-2"
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setSaved(false);
                    setDrafts((current) => ({ ...current, [speaker.speaker]: hint }));
                  }}
                >
                  Use “{hint}”
                </Button>
              ) : null}
            </li>
          );
        })}
      </ul>
      <Button className="mt-4" type="button" disabled={saving} onClick={() => void save()}>
        {saving ? "Saving…" : "Save names"}
      </Button>
      {saved ? <p className="mt-2 text-sm text-muted-foreground">Saved.</p> : null}
      {error ? <p className="mt-2 text-sm text-destructive">{error}</p> : null}
    </section>
  );
}

export function EvidencePanel({
  meetingId,
  tldr,
  chapters,
  decisions,
  commitments,
  droppedCount,
  onSeek,
}: {
  meetingId: string;
  tldr: string[];
  chapters: ChapterRow[];
  decisions: DecisionRow[];
  commitments: CommitmentRow[];
  droppedCount: number;
  onSeek: (ms: number, segmentIdx: number) => void;
}) {
  const owed = useMemo(() => whoOwesWhat(commitments), [commitments]);

  return (
    <div className="space-y-8">
      {tldr.length > 0 ? (
        <section>
          <h2 className="text-lg font-medium">TL;DR</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
            {tldr.map((line, index) => (
              <li key={`${index}-${line}`}>{line}</li>
            ))}
          </ul>
        </section>
      ) : null}

      <section>
        <h2 className="text-lg font-medium">Who owes what</h2>
        {owed.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">Nothing is owed from this meeting.</p>
        ) : (
          <ul className="mt-3 space-y-4">
            {owed.map((group) => (
              <li key={group.id}>
                <p className="text-sm font-medium">{group.label}</p>
                <ul className="mt-1 space-y-1">
                  {group.items.map((item) => (
                    <li key={item.id} className="text-sm">
                      <span className="mr-2 rounded-full border px-2 py-0.5 text-xs">
                        {kindLabel(item.kind)}
                      </span>
                      {item.text}
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="text-lg font-medium">Commitments</h2>
        {commitments.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">No commitments were found.</p>
        ) : (
          <ul className="mt-3 space-y-4">
            {commitments.map((item) => {
              const state = statusLabel(item.status);
              return (
                <li key={item.id} className="rounded-lg border p-3">
                  <p className="flex flex-wrap items-center gap-2 text-xs">
                    <span className="rounded-full border px-2 py-0.5">{kindLabel(item.kind)}</span>
                    <span className="text-muted-foreground">
                      {ownerLabel(item.owner_name, item.owner_speaker)}
                    </span>
                    {state ? <span className="text-muted-foreground">{state}</span> : null}
                  </p>
                  <p className="mt-2 text-sm">{item.text}</p>
                  {item.condition ? (
                    <p className="mt-1 text-sm text-muted-foreground">If {item.condition}</p>
                  ) : null}
                  {item.due_date ? (
                    <p className="mt-1 text-sm text-muted-foreground">Due {item.due_date}</p>
                  ) : null}
                  <QuoteChip
                    quote={item.quote}
                    startMs={item.start_ms}
                    onSeek={() => onSeek(item.start_ms, item.segment_idx)}
                  />
                  <ReviewButtons meetingId={meetingId} target="commitment" id={item.id} review={item.review} />
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section>
        <h2 className="text-lg font-medium">Decisions</h2>
        {decisions.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">No decisions were found.</p>
        ) : (
          <ul className="mt-3 space-y-4">
            {decisions.map((item) => (
              <li key={item.id} className="rounded-lg border p-3">
                <p className="text-sm">{item.text}</p>
                <QuoteChip
                  quote={item.quote}
                  startMs={item.start_ms}
                  onSeek={() => onSeek(item.start_ms, item.segment_idx)}
                />
                <ReviewButtons meetingId={meetingId} target="decision" id={item.id} review={item.review} />
              </li>
            ))}
          </ul>
        )}
      </section>

      {chapters.length > 0 ? (
        <section>
          <h2 className="text-lg font-medium">Chapters</h2>
          <ul className="mt-2 space-y-1">
            {chapters.map((chapter) => (
              <li key={`${chapter.segment_idx}-${chapter.start_ms}`}>
                <button
                  type="button"
                  className="w-full rounded-md px-2 py-1 text-left text-sm hover:bg-muted"
                  onClick={() => onSeek(chapter.start_ms, chapter.segment_idx)}
                >
                  <span className="text-muted-foreground">{formatTimestamp(chapter.start_ms)}</span>
                  {" · "}
                  {chapter.title}
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {droppedCount > 0 ? (
        <p className="text-sm text-muted-foreground">
          {droppedCount} {droppedCount === 1 ? "item" : "items"} dropped: no evidence
        </p>
      ) : null}
    </div>
  );
}

function QuoteChip({
  quote,
  startMs,
  onSeek,
}: {
  quote: string;
  startMs: number;
  onSeek: () => void;
}) {
  return (
    <button
      type="button"
      className="mt-2 block max-w-full rounded-md border px-2 py-1 text-left text-xs text-muted-foreground hover:bg-muted"
      onClick={onSeek}
    >
      {formatTimestamp(startMs)} · “{quote}”
    </button>
  );
}

function ReviewButtons({
  meetingId,
  target,
  id,
  review,
}: {
  meetingId: string;
  target: "decision" | "commitment";
  id: string;
  review: ReviewState;
}) {
  const router = useRouter();
  const [current, setCurrent] = useState(review);
  const [seen, setSeen] = useState(review);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const request = useRef(0);

  if (seen !== review) {
    setSeen(review);
    setCurrent(review);
  }

  async function choose(next: ReviewState) {
    const value = current === next ? "pending" : next;
    const ticket = request.current + 1;
    request.current = ticket;
    setBusy(true);
    setError(null);
    setCurrent(value);
    try {
      const response = await fetch(`/api/meetings/${meetingId}/review`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ target, id, review: value }),
      });
      if (request.current !== ticket) return;
      if (!response.ok) {
        setCurrent(review);
        setError(await errorMessage(response, "Could not update that item."));
        setBusy(false);
        return;
      }
      setBusy(false);
      router.refresh();
    } catch {
      if (request.current !== ticket) return;
      setCurrent(review);
      setError("Could not update that item.");
      setBusy(false);
    }
  }

  return (
    <div className="mt-3">
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          variant={current === "confirmed" ? "default" : "outline"}
          aria-pressed={current === "confirmed"}
          disabled={busy}
          onClick={() => void choose("confirmed")}
        >
          Confirm
        </Button>
        <Button
          type="button"
          size="sm"
          variant={current === "rejected" ? "destructive" : "outline"}
          aria-pressed={current === "rejected"}
          disabled={busy}
          onClick={() => void choose("rejected")}
        >
          Reject
        </Button>
      </div>
      {error ? <p className="mt-2 text-xs text-destructive">{error}</p> : null}
    </div>
  );
}
