import { nanoid } from "nanoid";
import { redactText } from "@/lib/redact";
import type { CommitmentKind } from "@/lib/meeting-view";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TOKEN = /^[A-Za-z0-9_-]{24}$/;

export type ShareLink = {
  token: string;
  personId: string | null;
  personName: string | null;
};

export type ShareSource = {
  personId: string | null;
  personName: string | null;
  title: string;
  recordedAt: string;
  tldr: string[];
  chapters: { title: string; startMs: number }[];
  decisions: { text: string; quote: string; startMs: number; review: string }[];
  commitments: {
    text: string;
    quote: string;
    kind: CommitmentKind;
    ownerPersonId: string | null;
    ownerName: string | null;
    ownerSpeaker: number | null;
    startMs: number;
    status: string;
    condition: string | null;
    dueDate: string | null;
    changeNote: string | null;
    review: string;
  }[];
  segments: { speaker: number; startMs: number; text: string }[];
  speakers: { speaker: number; personId: string | null; name: string | null }[];
};

export type ShareDocument = {
  scope: "meeting" | "person";
  title: string;
  recordedAt: string;
  personName: string | null;
  tldr: string[];
  chapters: { title: string; startMs: number }[];
  decisions: { text: string; quote: string; startMs: number }[];
  commitments: {
    text: string;
    quote: string;
    kind: CommitmentKind;
    owner: string;
    startMs: number;
    status: string;
    condition: string | null;
    dueDate: string | null;
    changeNote: string | null;
  }[];
  lines: { speaker: string; startMs: number; text: string }[];
};

export function newShareToken() {
  return nanoid(24);
}

export function isShareToken(value: string) {
  return TOKEN.test(value);
}

export function parseShareCreate(
  body: unknown,
): { ok: true; personId: string | null } | { ok: false; error: string } {
  if (!body || typeof body !== "object") return { ok: false, error: "Choose what to share." };
  const personId = (body as { person_id?: unknown }).person_id;
  if (personId == null) return { ok: true, personId: null };
  if (typeof personId !== "string" || !UUID.test(personId)) {
    return { ok: false, error: "Choose a person from this meeting." };
  }
  return { ok: true, personId };
}

export function sharePeople(speakers: { personId: string | null; name: string | null }[]) {
  const seen = new Set<string>();
  const people: { id: string; name: string }[] = [];
  for (const speaker of speakers) {
    const name = speaker.name?.trim() ?? "";
    if (!speaker.personId || !name || seen.has(speaker.personId)) continue;
    seen.add(speaker.personId);
    people.push({ id: speaker.personId, name });
  }
  return people;
}

export function readShareLink(row: unknown, personName: string | null): ShareLink | null {
  if (!row || typeof row !== "object") return null;
  const record = row as Record<string, unknown>;
  if (typeof record.token !== "string" || !isShareToken(record.token)) return null;
  const personId = typeof record.person_id === "string" ? record.person_id : null;
  return {
    token: record.token,
    personId,
    personName: personId ? personName : null,
  };
}

export function buildShareDocument(source: ShareSource): ShareDocument {
  const personId = source.personId;
  const names = new Map<number, string>();
  const personSpeakers = new Set<number>();
  for (const speaker of source.speakers) {
    const name = speaker.name?.trim();
    names.set(speaker.speaker, name || `Speaker ${speaker.speaker}`);
    if (personId && speaker.personId === personId) personSpeakers.add(speaker.speaker);
  }

  const lines = source.segments
    .filter((segment) => !personId || personSpeakers.has(segment.speaker))
    .slice()
    .sort((a, b) => a.startMs - b.startMs)
    .map((segment) => ({
      speaker: clean(names.get(segment.speaker) ?? `Speaker ${segment.speaker}`),
      startMs: segment.startMs,
      text: clean(segment.text),
    }));

  const commitments = source.commitments
    .filter((item) => item.review !== "rejected")
    .filter((item) => !personId || item.ownerPersonId === personId)
    .slice()
    .sort((a, b) => a.startMs - b.startMs)
    .map((item) => ({
      text: clean(item.text),
      quote: clean(item.quote),
      kind: item.kind,
      owner: clean(item.ownerName?.trim() || (item.ownerSpeaker == null ? "Unassigned" : `Speaker ${item.ownerSpeaker}`)),
      startMs: item.startMs,
      status: item.status,
      condition: item.condition ? clean(item.condition) : null,
      dueDate: item.dueDate,
      changeNote: item.changeNote ? clean(item.changeNote) : null,
    }));

  const decisions = personId
    ? []
    : source.decisions
        .filter((item) => item.review !== "rejected")
        .slice()
        .sort((a, b) => a.startMs - b.startMs)
        .map((item) => ({
          text: clean(item.text),
          quote: clean(item.quote),
          startMs: item.startMs,
        }));

  return {
    scope: personId ? "person" : "meeting",
    title: clean(source.title.trim() || "Untitled meeting"),
    recordedAt: source.recordedAt,
    personName: personId ? clean(source.personName?.trim() || "This person") : null,
    tldr: personId ? [] : source.tldr.map(clean),
    chapters: personId ? [] : source.chapters.map((chapter) => ({ title: clean(chapter.title), startMs: chapter.startMs })),
    decisions,
    commitments,
    lines,
  };
}

function clean(value: string) {
  return redactText(value);
}
