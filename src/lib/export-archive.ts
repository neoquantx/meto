import { strToU8, zipSync } from "fflate";
import { redactText } from "@/lib/redact";
import { formatTimestamp } from "@/lib/playback";
import {
  kindLabel,
  parseChapters,
  parseTldr,
  readKind,
  readPersonName,
  type CommitmentKind,
} from "@/lib/meeting-view";
import { formatMeetingWhen, simpleTokens } from "@/lib/library";

export type ExportDocument = {
  title: string;
  recorded_at: string;
  summary_language: string;
  tldr: string[];
  chapters: { title: string; start_ms: number }[];
  transcript: { speaker: string; start_ms: number; text: string }[];
  decisions: { text: string; quote: string; start_ms: number; review: string }[];
  commitments: {
    text: string;
    quote: string;
    kind: string;
    owner: string;
    status: string;
    condition: string | null;
    due_date: string | null;
    change_note: string | null;
    start_ms: number;
    review: string;
  }[];
};

export type ExportHead = {
  id: string;
  title: string;
  recordedAt: string;
  summaryLanguage: string;
  tldr: string[];
  chapters: { title: string; startMs: number }[];
};

export type ExportSegment = {
  meetingId: string;
  idx: number;
  speaker: number;
  startMs: number;
  text: string;
};

export type ExportDecision = {
  meetingId: string;
  text: string;
  quote: string;
  startMs: number;
  review: string;
};

export type ExportCommitment = {
  meetingId: string;
  text: string;
  quote: string;
  kind: CommitmentKind;
  owner: string;
  status: string;
  condition: string | null;
  dueDate: string | null;
  changeNote: string | null;
  startMs: number;
  review: string;
};

export type ExportSpeaker = {
  meetingId: string;
  speaker: number;
  name: string | null;
};

export function exportBaseName(title: string, id: string) {
  const slug = simpleTokens(redactText(title)).join("-").slice(0, 60).replace(/-+$/g, "");
  const suffix = id.replace(/-/g, "").slice(0, 8) || "meeting";
  return `${slug || "meeting"}-${suffix}`;
}

export function meetingMarkdown(doc: ExportDocument) {
  const parts = [`# ${one(doc.title)}`, "", `Recorded ${formatMeetingWhen(doc.recorded_at)}`, ""];
  if (doc.tldr.length > 0) {
    parts.push("## TL;DR", "", ...doc.tldr.map((line) => `- ${one(line)}`), "");
  }
  parts.push("## Transcript", "");
  if (doc.transcript.length === 0) parts.push("No transcript.", "");
  for (const line of doc.transcript) {
    parts.push(`**${one(line.speaker)}** (${formatTimestamp(line.start_ms)})`, "", one(line.text), "");
  }
  parts.push("## Decisions", "");
  if (doc.decisions.length === 0) parts.push("No decisions.", "");
  for (const item of doc.decisions) {
    parts.push(`- ${one(item.text)}`, "", `  > ${one(item.quote)} (${formatTimestamp(item.start_ms)})`, "");
  }
  parts.push("## Commitments", "");
  if (doc.commitments.length === 0) parts.push("No commitments.", "");
  for (const item of doc.commitments) {
    const kind = item.kind === "explicit" || item.kind === "conditional" || item.kind === "suggestion" ? kindLabel(item.kind) : item.kind;
    parts.push(`- ${kind} · ${one(item.owner)} · ${item.status}`, "", `  ${one(item.text)}`, "", `  > ${one(item.quote)} (${formatTimestamp(item.start_ms)})`, "");
    if (item.condition) parts.push(`  If ${one(item.condition)}`, "");
    if (item.due_date) parts.push(`  Due ${item.due_date}`, "");
    if (item.change_note) parts.push(`  ${one(item.change_note)}`, "");
  }
  return `${parts.join("\n").trim()}\n`;
}

export function meetingsZip(meetings: { id: string; document: ExportDocument }[]) {
  const files: Record<string, Uint8Array> = {};
  const used = new Set<string>();
  if (meetings.length === 0) {
    files["README.md"] = strToU8("No meetings to export.\n");
  }
  for (const meeting of meetings) {
    let base = exportBaseName(meeting.document.title, meeting.id);
    while (used.has(base)) base = `${base}-${meeting.id.replace(/-/g, "").slice(0, 12)}`;
    used.add(base);
    files[`${base}.md`] = strToU8(meetingMarkdown(meeting.document));
    files[`${base}.json`] = strToU8(`${JSON.stringify(meeting.document, null, 2)}\n`);
  }
  return zipSync(files);
}

export function assembleExportMeetings(input: {
  heads: ExportHead[];
  segments: ExportSegment[];
  decisions: ExportDecision[];
  commitments: ExportCommitment[];
  speakers: ExportSpeaker[];
}) {
  const names = new Map<string, string>();
  for (const speaker of input.speakers) {
    const name = speaker.name?.trim();
    names.set(`${speaker.meetingId}:${speaker.speaker}`, name || `Speaker ${speaker.speaker}`);
  }
  const ordered = [...input.heads].sort(
    (a, b) => Date.parse(a.recordedAt) - Date.parse(b.recordedAt) || a.id.localeCompare(b.id),
  );
  return ordered.map((head) => ({
    id: head.id,
    document: meetingDocument(head, names, input),
  }));
}

export function readExportSegment(row: unknown): ExportSegment | null {
  if (!row || typeof row !== "object") return null;
  const record = row as Record<string, unknown>;
  if (typeof record.meeting_id !== "string" || typeof record.text !== "string") return null;
  if (typeof record.idx !== "number" || typeof record.speaker !== "number") return null;
  if (typeof record.start_ms !== "number") return null;
  return {
    meetingId: record.meeting_id,
    idx: record.idx,
    speaker: record.speaker,
    startMs: record.start_ms,
    text: record.text,
  };
}

export function readExportDecision(row: unknown): ExportDecision | null {
  if (!row || typeof row !== "object") return null;
  const record = row as Record<string, unknown>;
  if (typeof record.meeting_id !== "string") return null;
  if (typeof record.text !== "string" || typeof record.quote !== "string") return null;
  if (typeof record.start_ms !== "number") return null;
  return {
    meetingId: record.meeting_id,
    text: record.text,
    quote: record.quote,
    startMs: record.start_ms,
    review: typeof record.review === "string" ? record.review : "pending",
  };
}

export function readExportCommitment(row: unknown): ExportCommitment | null {
  if (!row || typeof row !== "object") return null;
  const record = row as Record<string, unknown>;
  const kind = readKind(record.kind);
  if (typeof record.meeting_id !== "string" || !kind) return null;
  if (typeof record.text !== "string" || typeof record.quote !== "string") return null;
  if (typeof record.start_ms !== "number") return null;
  const condition = typeof record.condition === "string" ? record.condition.trim() : "";
  const change = typeof record.change_note === "string" ? record.change_note.trim() : "";
  return {
    meetingId: record.meeting_id,
    text: record.text,
    quote: record.quote,
    kind,
    owner: readPersonName(record.owner) ?? "Unassigned",
    status: typeof record.status === "string" ? record.status : "open",
    condition: condition || null,
    dueDate: typeof record.due_date === "string" ? record.due_date : null,
    changeNote: change || null,
    startMs: record.start_ms,
    review: typeof record.review === "string" ? record.review : "pending",
  };
}

export function readExportSpeaker(row: unknown): ExportSpeaker | null {
  if (!row || typeof row !== "object") return null;
  const record = row as Record<string, unknown>;
  if (typeof record.meeting_id !== "string" || typeof record.speaker !== "number") return null;
  return {
    meetingId: record.meeting_id,
    speaker: record.speaker,
    name: readPersonName(record.person),
  };
}

export function readExportHead(row: unknown): ExportHead | null {
  if (!row || typeof row !== "object") return null;
  const record = row as Record<string, unknown>;
  if (typeof record.id !== "string" || typeof record.recorded_at !== "string") return null;
  const title = typeof record.title === "string" ? record.title : "Untitled meeting";
  const language = record.summary_language;
  return {
    id: record.id,
    title,
    recordedAt: record.recorded_at,
    summaryLanguage: language === "hi" || language === "hinglish" ? language : "en",
    tldr: parseTldr(record.tldr),
    chapters: parseChapters(record.chapters).map((chapter) => ({
      title: chapter.title,
      startMs: chapter.start_ms,
    })),
  };
}

function meetingDocument(
  head: ExportHead,
  names: Map<string, string>,
  input: {
    segments: ExportSegment[];
    decisions: ExportDecision[];
    commitments: ExportCommitment[];
  },
): ExportDocument {
  const transcript = input.segments
    .filter((segment) => segment.meetingId === head.id)
    .slice()
    .sort((a, b) => a.idx - b.idx)
    .map((segment) => ({
      speaker: clean(names.get(`${head.id}:${segment.speaker}`) ?? `Speaker ${segment.speaker}`),
      start_ms: segment.startMs,
      text: clean(segment.text),
    }));
  return {
    title: clean(head.title.trim() || "Untitled meeting"),
    recorded_at: head.recordedAt,
    summary_language: head.summaryLanguage,
    tldr: head.tldr.map(clean),
    chapters: head.chapters.map((chapter) => ({ title: clean(chapter.title), start_ms: chapter.startMs })),
    transcript,
    decisions: input.decisions
      .filter((item) => item.meetingId === head.id)
      .sort((a, b) => a.startMs - b.startMs)
      .map((item) => ({
        text: clean(item.text),
        quote: clean(item.quote),
        start_ms: item.startMs,
        review: item.review,
      })),
    commitments: input.commitments
      .filter((item) => item.meetingId === head.id)
      .sort((a, b) => a.startMs - b.startMs)
      .map((item) => ({
        text: clean(item.text),
        quote: clean(item.quote),
        kind: item.kind,
        owner: clean(item.owner),
        status: item.status,
        condition: item.condition ? clean(item.condition) : null,
        due_date: item.dueDate,
        change_note: item.changeNote ? clean(item.changeNote) : null,
        start_ms: item.startMs,
        review: item.review,
      })),
  };
}

function clean(value: string) {
  return redactText(value);
}

function one(value: string) {
  return value.replace(/\s+/g, " ").trim();
}
