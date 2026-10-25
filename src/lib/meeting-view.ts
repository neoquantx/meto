import { personNameKey } from "@/lib/speakers";

export type ReviewState = "pending" | "confirmed" | "rejected";
export type CommitmentKind = "explicit" | "conditional" | "suggestion";

export type TranscriptSegment = {
  idx: number;
  speaker: number;
  start_ms: number;
  end_ms: number;
  text: string;
};

export type SpeakerRow = {
  speaker: number;
  name: string | null;
  name_hint: string | null;
};

export type DecisionRow = {
  id: string;
  text: string;
  quote: string;
  start_ms: number;
  segment_idx: number;
  review: ReviewState;
};

export type CommitmentRow = {
  id: string;
  text: string;
  quote: string;
  kind: CommitmentKind;
  condition: string | null;
  due_date: string | null;
  start_ms: number;
  segment_idx: number;
  review: ReviewState;
  status: string;
  owner_speaker: number | null;
  owner_name: string | null;
};

export type ChapterRow = {
  title: string;
  segment_idx: number;
  start_ms: number;
};

export type OweGroup = {
  id: string;
  label: string;
  items: { id: string; text: string; kind: CommitmentKind }[];
};

const OWED = new Set(["open", "in_progress", "changed"]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function ownerLabel(ownerName: string | null | undefined, ownerSpeaker: number | null) {
  const name = ownerName?.trim();
  if (name) return name;
  if (ownerSpeaker == null) return "Unassigned";
  return `Speaker ${ownerSpeaker}`;
}

export function kindLabel(kind: CommitmentKind) {
  if (kind === "conditional") return "Conditional";
  if (kind === "suggestion") return "Suggestion";
  return "Explicit";
}

export function statusLabel(status: string) {
  if (status === "in_progress") return "In progress";
  if (status === "changed") return "Changed";
  if (status === "done") return "Done";
  if (status === "dropped") return "Dropped";
  return null;
}

export function readPersonName(value: unknown) {
  const row = Array.isArray(value) ? value[0] : value;
  if (!row || typeof row !== "object" || !("name" in row)) return null;
  const name = row.name;
  if (typeof name !== "string") return null;
  const trimmed = name.trim();
  return trimmed || null;
}

export function readReview(value: unknown): ReviewState {
  if (value === "confirmed" || value === "rejected") return value;
  return "pending";
}

export function readKind(value: unknown): CommitmentKind | null {
  if (value === "explicit" || value === "conditional" || value === "suggestion") return value;
  return null;
}

export function parseTldr(value: unknown) {
  if (!Array.isArray(value)) return [];
  const lines: string[] = [];
  for (const item of value) {
    if (typeof item !== "string") continue;
    const text = item.trim();
    if (!text) continue;
    lines.push(text);
    if (lines.length === 3) break;
  }
  return lines;
}

export function parseChapters(value: unknown): ChapterRow[] {
  if (!Array.isArray(value)) return [];
  const chapters: ChapterRow[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const record = item as Record<string, unknown>;
    const title = typeof record.title === "string" ? record.title.trim() : "";
    if (!title) continue;
    if (typeof record.segment_idx !== "number" || !Number.isInteger(record.segment_idx)) continue;
    if (record.segment_idx < 0) continue;
    if (typeof record.start_ms !== "number" || !Number.isFinite(record.start_ms) || record.start_ms < 0) {
      continue;
    }
    chapters.push({
      title,
      segment_idx: record.segment_idx,
      start_ms: Math.round(record.start_ms),
    });
  }
  return chapters;
}

export function whoOwesWhat(
  items: Pick<CommitmentRow, "id" | "text" | "kind" | "review" | "status" | "owner_speaker" | "owner_name">[],
): OweGroup[] {
  const groups: OweGroup[] = [];
  const index = new Map<string, OweGroup>();
  for (const item of items) {
    if (item.review === "rejected" || item.kind === "suggestion") continue;
    if (!OWED.has(item.status)) continue;
    const named = item.owner_name?.trim() ?? "";
    const key = named
      ? `name:${personNameKey(named)}`
      : item.owner_speaker == null
        ? "unassigned"
        : `speaker:${item.owner_speaker}`;
    let group = index.get(key);
    if (!group) {
      group = { id: key, label: ownerLabel(named || null, item.owner_speaker), items: [] };
      index.set(key, group);
      groups.push(group);
    }
    group.items.push({ id: item.id, text: item.text, kind: item.kind });
  }
  return groups;
}

export function parseReviewSave(
  body: unknown,
):
  | { ok: true; target: "decision" | "commitment"; id: string; review: ReviewState }
  | { ok: false; error: string } {
  if (!body || typeof body !== "object") {
    return { ok: false, error: "Choose confirm or reject." };
  }
  const record = body as Record<string, unknown>;
  if (record.target !== "decision" && record.target !== "commitment") {
    return { ok: false, error: "Choose confirm or reject." };
  }
  if (record.review !== "pending" && record.review !== "confirmed" && record.review !== "rejected") {
    return { ok: false, error: "Choose confirm or reject." };
  }
  if (typeof record.id !== "string" || !UUID.test(record.id)) {
    return { ok: false, error: "That item is not valid." };
  }
  return { ok: true, target: record.target, id: record.id, review: record.review };
}

function textField(value: unknown) {
  return typeof value === "string" ? value : null;
}

export function readSegment(row: unknown): TranscriptSegment | null {
  if (!row || typeof row !== "object") return null;
  const record = row as Record<string, unknown>;
  if (typeof record.idx !== "number" || typeof record.speaker !== "number") return null;
  if (typeof record.start_ms !== "number" || typeof record.end_ms !== "number") return null;
  if (typeof record.text !== "string") return null;
  return {
    idx: record.idx,
    speaker: record.speaker,
    start_ms: record.start_ms,
    end_ms: record.end_ms,
    text: record.text,
  };
}

export function readSpeaker(row: unknown): SpeakerRow | null {
  if (!row || typeof row !== "object") return null;
  const record = row as Record<string, unknown>;
  if (typeof record.speaker !== "number" || !Number.isInteger(record.speaker)) return null;
  const hint = textField(record.name_hint)?.trim() ?? "";
  return {
    speaker: record.speaker,
    name: readPersonName(record.person),
    name_hint: hint || null,
  };
}

export function readDecision(row: unknown): DecisionRow | null {
  if (!row || typeof row !== "object") return null;
  const record = row as Record<string, unknown>;
  const id = textField(record.id);
  const text = textField(record.text);
  const quote = textField(record.quote);
  if (!id || !text || !quote) return null;
  if (typeof record.start_ms !== "number" || typeof record.segment_idx !== "number") return null;
  return {
    id,
    text,
    quote,
    start_ms: record.start_ms,
    segment_idx: record.segment_idx,
    review: readReview(record.review),
  };
}

export function readCommitment(row: unknown): CommitmentRow | null {
  if (!row || typeof row !== "object") return null;
  const record = row as Record<string, unknown>;
  const id = textField(record.id);
  const text = textField(record.text);
  const quote = textField(record.quote);
  const kind = readKind(record.kind);
  if (!id || !text || !quote || !kind) return null;
  if (typeof record.start_ms !== "number" || typeof record.segment_idx !== "number") return null;
  const condition = textField(record.condition)?.trim() ?? "";
  const ownerSpeaker = record.owner_speaker;
  return {
    id,
    text,
    quote,
    kind,
    condition: condition || null,
    due_date: textField(record.due_date),
    start_ms: record.start_ms,
    segment_idx: record.segment_idx,
    review: readReview(record.review),
    status: textField(record.status) ?? "open",
    owner_speaker: typeof ownerSpeaker === "number" ? ownerSpeaker : null,
    owner_name: readPersonName(record.owner),
  };
}
