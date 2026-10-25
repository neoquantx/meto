import { readKind, readPersonName, readReview, statusLabel, type CommitmentKind } from "@/lib/meeting-view";
import type { LedgerStatus } from "@/lib/ledger";

export const COMMITMENT_COLUMNS =
  "id, text, quote, kind, condition, due_date, change_note, start_ms, segment_idx, review, status, misses, owner_person_id, meeting_id, owner:people(name), meeting:meetings(id, title, recorded_at)";

export const EVENT_COLUMNS =
  "commitment_id, meeting_id, status, quote, segment_idx, start_ms, note, meeting:meetings(id, title, recorded_at)";

export const DECISION_COLUMNS =
  "id, text, quote, start_ms, segment_idx, review, meeting_id, meeting:meetings(id, title, recorded_at)";

export const LEDGER_FILTERS = [
  ["all", "All"],
  ["open", "Open"],
  ["in_progress", "In progress"],
  ["changed", "Changed"],
  ["dropped", "Dropped"],
  ["done", "Done"],
] as const;

export type LedgerFilter = (typeof LEDGER_FILTERS)[number][0];

const BRIEF_STATUSES = new Set(["open", "in_progress", "changed", "dropped"]);

export type StoredCommitment = {
  id: string;
  text: string;
  quote: string;
  kind: CommitmentKind;
  condition: string | null;
  dueDate: string | null;
  changeNote: string | null;
  startMs: number;
  segmentIdx: number;
  review: string;
  status: string;
  misses: number;
  ownerPersonId: string | null;
  ownerName: string | null;
  meetingId: string;
  meetingTitle: string;
  recordedAt: string;
};

export type StoredEvent = {
  commitmentId: string;
  meetingId: string;
  meetingTitle: string;
  recordedAt: string;
  status: LedgerStatus;
  quote: string | null;
  segmentIdx: number | null;
  startMs: number | null;
  note: string | null;
};

export type StoredDecision = {
  id: string;
  text: string;
  quote: string;
  startMs: number;
  segmentIdx: number;
  review: string;
  meetingId: string;
  meetingTitle: string;
  recordedAt: string;
};

export type HistoryLink = {
  line: string;
  meetingId: string;
  startMs: number | null;
  segmentIdx: number | null;
};

export type LedgerListItem = StoredCommitment & {
  history: HistoryLink[];
};

export type BriefCommitment = StoredCommitment;

export type BriefDecision = StoredDecision & {
  personIds: string[];
};

export function formatLedgerDate(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(date);
}

export function ledgerStatusLabel(status: string) {
  return statusLabel(status) ?? "Open";
}

export function ledgerHistoryLine(input: {
  status: LedgerStatus;
  meetingTitle: string;
  recordedAt: string;
  quote: string | null;
}) {
  const title = oneLine(input.meetingTitle) || "Untitled meeting";
  const label =
    input.status === "done"
      ? "Done"
      : input.status === "in_progress"
        ? "In progress"
        : input.status === "changed"
          ? "Changed"
          : "Not mentioned";
  const head = `${label} in ${title}, ${formatLedgerDate(input.recordedAt)}`;
  const quote = input.quote ? oneLine(input.quote) : "";
  return quote ? `${head} — '${quote}'` : head;
}

export function toHistoryLinks(events: StoredEvent[]): HistoryLink[] {
  return events
    .slice()
    .sort((a, b) => Date.parse(a.recordedAt) - Date.parse(b.recordedAt) || a.meetingId.localeCompare(b.meetingId))
    .map((event) => ({
      line: ledgerHistoryLine(event),
      meetingId: event.meetingId,
      startMs: event.startMs,
      segmentIdx: event.segmentIdx,
    }));
}

export function evidenceHref(meetingId: string, startMs: number | null, segmentIdx: number | null) {
  const params = new URLSearchParams();
  if (startMs != null && startMs >= 0 && Number.isSafeInteger(startMs)) params.set("t", String(startMs));
  if (segmentIdx != null && segmentIdx >= 0 && Number.isSafeInteger(segmentIdx)) {
    params.set("line", String(segmentIdx));
  }
  const query = params.toString();
  return query ? `/meetings/${meetingId}?${query}` : `/meetings/${meetingId}`;
}

export function parseEvidenceQuery(t: string | undefined, line: string | undefined) {
  return { startAtMs: wholeNumber(t), startLine: wholeNumber(line) };
}

export function parseLedgerFilter(value: string | undefined): LedgerFilter {
  const match = LEDGER_FILTERS.find(([id]) => id === value);
  return match ? match[0] : "all";
}

export function groupLedger(items: LedgerListItem[], filter: LedgerFilter) {
  const groups = new Map<string, { id: string; label: string; items: LedgerListItem[] }>();
  for (const item of items) {
    if (item.review === "rejected" || item.kind === "suggestion") continue;
    if (filter !== "all" && item.status !== filter) continue;
    const id = item.ownerPersonId ?? "unassigned";
    const label = item.ownerPersonId ? item.ownerName?.trim() || "Unnamed" : "Unassigned";
    let group = groups.get(id);
    if (!group) {
      group = { id, label, items: [] };
      groups.set(id, group);
    }
    group.items.push(item);
  }
  const list = [...groups.values()];
  for (const group of list) {
    group.items.sort(
      (a, b) => Date.parse(b.recordedAt) - Date.parse(a.recordedAt) || a.text.localeCompare(b.text),
    );
  }
  list.sort((a, b) => {
    if (a.id === "unassigned") return 1;
    if (b.id === "unassigned") return -1;
    return a.label.localeCompare(b.label);
  });
  return list;
}

export function buildBrief(input: {
  personIds: readonly string[];
  people: { id: string; name: string }[];
  commitments: BriefCommitment[];
  decisions: BriefDecision[];
}) {
  const selected = new Set(input.personIds);
  const names = new Map(input.people.map((person) => [person.id, person.name]));
  const groups = input.personIds.map((id) => ({
    id,
    label: names.get(id)?.trim() || "Unnamed",
    items: input.commitments
      .filter(
        (item) =>
          item.ownerPersonId === id &&
          item.review !== "rejected" &&
          item.kind !== "suggestion" &&
          BRIEF_STATUSES.has(item.status),
      )
      .sort((a, b) => Date.parse(b.recordedAt) - Date.parse(a.recordedAt) || a.text.localeCompare(b.text)),
  }));
  const decisions = input.decisions
    .filter((item) => item.review !== "rejected" && item.personIds.some((id) => selected.has(id)))
    .sort((a, b) => Date.parse(b.recordedAt) - Date.parse(a.recordedAt) || a.startMs - b.startMs)
    .slice(0, 5);
  return { groups, decisions };
}

export function readStoredCommitment(row: unknown): StoredCommitment | null {
  const record = asRecord(row);
  if (!record) return null;
  const id = text(record.id);
  const body = text(record.text);
  const quote = text(record.quote);
  const kind = readKind(record.kind);
  const meeting = readMeetingJoin(record.meeting, record.meeting_id);
  if (!id || !body || !quote || !kind || !meeting) return null;
  if (!whole(record.start_ms) && record.start_ms !== 0) return null;
  if (!whole(record.segment_idx) && record.segment_idx !== 0) return null;
  const condition = text(record.condition);
  const changeNote = text(record.change_note);
  return {
    id,
    text: body,
    quote,
    kind,
    condition,
    dueDate: text(record.due_date),
    changeNote,
    startMs: record.start_ms as number,
    segmentIdx: record.segment_idx as number,
    review: readReview(record.review),
    status: text(record.status) ?? "open",
    misses: typeof record.misses === "number" && Number.isFinite(record.misses) ? record.misses : 0,
    ownerPersonId: text(record.owner_person_id),
    ownerName: readPersonName(record.owner),
    meetingId: meeting.id,
    meetingTitle: meeting.title,
    recordedAt: meeting.recordedAt,
  };
}

export function readStoredEvent(row: unknown): StoredEvent | null {
  const record = asRecord(row);
  if (!record) return null;
  const commitmentId = text(record.commitment_id);
  const meeting = readMeetingJoin(record.meeting, record.meeting_id);
  const status = ledgerStatus(record.status);
  if (!commitmentId || !meeting || !status) return null;
  return {
    commitmentId,
    meetingId: meeting.id,
    meetingTitle: meeting.title,
    recordedAt: meeting.recordedAt,
    status,
    quote: text(record.quote),
    segmentIdx: optionalWhole(record.segment_idx),
    startMs: optionalWhole(record.start_ms),
    note: text(record.note),
  };
}

export function readStoredDecision(row: unknown): StoredDecision | null {
  const record = asRecord(row);
  if (!record) return null;
  const id = text(record.id);
  const body = text(record.text);
  const quote = text(record.quote);
  const meeting = readMeetingJoin(record.meeting, record.meeting_id);
  if (!id || !body || !quote || !meeting) return null;
  if (optionalWhole(record.start_ms) == null || optionalWhole(record.segment_idx) == null) return null;
  return {
    id,
    text: body,
    quote,
    startMs: record.start_ms as number,
    segmentIdx: record.segment_idx as number,
    review: readReview(record.review),
    meetingId: meeting.id,
    meetingTitle: meeting.title,
    recordedAt: meeting.recordedAt,
  };
}

export function readPersonRow(row: unknown) {
  const record = asRecord(row);
  if (!record) return null;
  const id = text(record.id);
  const name = text(record.name);
  if (!id || !name) return null;
  return { id, name };
}

function readMeetingJoin(value: unknown, fallbackId: unknown) {
  const record = asRecord(Array.isArray(value) ? value[0] : value);
  const id = text(record?.id) ?? text(fallbackId);
  const title = text(record?.title) ?? "Untitled meeting";
  const recordedAt = text(record?.recorded_at);
  if (!id || !recordedAt) return null;
  return { id, title, recordedAt };
}

function ledgerStatus(value: unknown): LedgerStatus | null {
  if (value === "done" || value === "in_progress" || value === "changed" || value === "not_mentioned") {
    return value;
  }
  return null;
}

function asRecord(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function text(value: unknown) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed || null;
}

function whole(value: unknown) {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function optionalWhole(value: unknown) {
  if (value == null) return null;
  return whole(value) ? (value as number) : null;
}

function wholeNumber(value: string | undefined) {
  if (!value || !/^\d+$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

function oneLine(value: string) {
  return value.replace(/\s+/g, " ").trim();
}
