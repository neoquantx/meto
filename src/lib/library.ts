import { evidenceHref } from "@/lib/ledger-view";

export type LibraryMeeting = {
  id: string;
  title: string;
  recordedAt: string;
  status: string;
  durationSec: number | null;
  source: string;
};

export type TranscriptHit = {
  meetingId: string;
  idx: number;
  startMs: number;
  text: string;
};

export type LibrarySnippet = {
  startMs: number;
  idx: number;
  text: string;
  href: string;
};

export type LibraryGroup = {
  meeting: LibraryMeeting;
  titleMatch: boolean;
  snippets: LibrarySnippet[];
  extra: number;
};

const STATUS_LABEL: Record<string, string> = {
  created: "Waiting for audio",
  uploaded: "Uploaded",
  transcribing: "Transcribing",
  transcribed: "Transcribed",
  extracting: "Extracting",
  ready: "Ready",
  failed: "Failed",
};

const SOURCE_LABEL: Record<string, string> = {
  mic: "Microphone",
  tab: "Meeting tab",
  upload: "Upload",
};

export function meetingStatusLabel(status: string) {
  return STATUS_LABEL[status] ?? status;
}

export function meetingSourceLabel(source: string) {
  return SOURCE_LABEL[source] ?? source;
}

export function formatMeetingWhen(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

/** Words the way Postgres `simple` does: lowercased letters and numbers, no stemming. Marks stay attached so Hindi vowel signs are not dropped. */
export function simpleTokens(value: string) {
  return value.normalize("NFC").toLowerCase().match(/[\p{L}\p{N}][\p{L}\p{N}\p{M}]*/gu) ?? [];
}

export function searchQuery(raw: string | undefined) {
  return (raw ?? "").trim().replace(/\s+/g, " ").slice(0, 200);
}

export function hasSearchWords(query: string) {
  return simpleTokens(query).length > 0;
}

export function snippetForQuery(text: string, query: string, radius = 72) {
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean) return "";
  const lower = clean.toLowerCase();
  if (lower.length !== clean.length) return clip(clean, radius * 2);
  let at = -1;
  for (const token of simpleTokens(query)) {
    const found = tokenAt(lower, token);
    if (found >= 0 && (at < 0 || found < at)) at = found;
  }
  if (at < 0) return clip(clean, radius * 2);
  const start = Math.max(0, at - radius);
  const end = Math.min(clean.length, at + radius);
  const prefix = start > 0 ? "…" : "";
  const suffix = end < clean.length ? "…" : "";
  return `${prefix}${clean.slice(start, end).trim()}${suffix}`;
}

export function readLibraryMeeting(row: unknown): LibraryMeeting | null {
  if (!row || typeof row !== "object") return null;
  const record = row as Record<string, unknown>;
  if (typeof record.id !== "string" || typeof record.title !== "string") return null;
  if (typeof record.recorded_at !== "string" || typeof record.status !== "string") return null;
  const title = record.title.trim() || "Untitled meeting";
  const duration = record.duration_sec;
  const source = record.source;
  return {
    id: record.id,
    title,
    recordedAt: record.recorded_at,
    status: record.status,
    durationSec: typeof duration === "number" && Number.isFinite(duration) ? duration : null,
    source: typeof source === "string" ? source : "upload",
  };
}

export function readTranscriptHit(row: unknown): TranscriptHit | null {
  if (!row || typeof row !== "object") return null;
  const record = row as Record<string, unknown>;
  if (typeof record.meeting_id !== "string" || typeof record.text !== "string") return null;
  if (typeof record.idx !== "number" || typeof record.start_ms !== "number") return null;
  return {
    meetingId: record.meeting_id,
    idx: record.idx,
    startMs: record.start_ms,
    text: record.text,
  };
}

export function readId(row: unknown) {
  if (!row || typeof row !== "object") return null;
  const id = (row as { id?: unknown }).id;
  return typeof id === "string" ? id : null;
}

export function libraryGroups(input: {
  meetings: LibraryMeeting[];
  hits: TranscriptHit[];
  titleMatchIds: ReadonlySet<string>;
  query: string;
  snippetLimit?: number;
  readOnly?: boolean;
}): LibraryGroup[] {
  const limit = input.snippetLimit ?? 5;
  const byMeeting = new Map<string, TranscriptHit[]>();
  for (const hit of input.hits) {
    const list = byMeeting.get(hit.meetingId) ?? [];
    list.push(hit);
    byMeeting.set(hit.meetingId, list);
  }

  const groups: LibraryGroup[] = [];
  const ordered = [...input.meetings].sort(
    (a, b) => time(b.recordedAt) - time(a.recordedAt) || a.id.localeCompare(b.id),
  );
  for (const meeting of ordered) {
    const titleMatch = input.titleMatchIds.has(meeting.id);
    const raw = (byMeeting.get(meeting.id) ?? [])
      .slice()
      .sort((a, b) => a.startMs - b.startMs || a.idx - b.idx);
    if (!titleMatch && raw.length === 0) continue;
    const shown = raw.slice(0, limit);
    groups.push({
      meeting,
      titleMatch,
      snippets: shown.map((hit) => ({
        startMs: hit.startMs,
        idx: hit.idx,
        text: snippetForQuery(hit.text, input.query),
        href: evidenceHref(meeting.id, hit.startMs, hit.idx, { readOnly: input.readOnly }),
      })),
      extra: Math.max(0, raw.length - shown.length),
    });
  }
  return groups;
}

export function chunkItems<T>(items: T[], size: number) {
  const groups: T[][] = [];
  const step = Math.max(1, size);
  for (let index = 0; index < items.length; index += step) {
    groups.push(items.slice(index, index + step));
  }
  return groups;
}

function tokenAt(haystack: string, token: string) {
  let from = 0;
  while (from <= haystack.length) {
    const at = haystack.indexOf(token, from);
    if (at < 0) return -1;
    const before = at === 0 ? "" : (haystack[at - 1] ?? "");
    const after = haystack[at + token.length] ?? "";
    const beforeOk = before === "" || !/^[\p{L}\p{N}\p{M}]$/u.test(before);
    const afterOk = after === "" || !/^[\p{L}\p{N}\p{M}]$/u.test(after);
    if (beforeOk && afterOk) return at;
    from = at + 1;
  }
  return -1;
}

function clip(text: string, length: number) {
  if (text.length <= length) return text;
  return `${text.slice(0, length).trim()}…`;
}

function time(iso: string) {
  const value = Date.parse(iso);
  return Number.isNaN(value) ? 0 : value;
}
