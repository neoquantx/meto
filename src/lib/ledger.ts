import { z } from "zod";
import { quoteIsSupported, type EvidenceSegment } from "@/lib/verify";

export const LEDGER_UNCONFIGURED = "Ledger check is not configured.";
export const LEDGER_UNUSABLE = "The model returned an unusable ledger check. Try again.";

const ACTIVE = new Set(["open", "in_progress", "changed"]);
const NOTE_LIMIT = 500;

export type LedgerStatus = "done" | "in_progress" | "changed" | "not_mentioned";
export type CommitmentStatus = "open" | "in_progress" | "changed" | "done" | "dropped";

export type LedgerCommitment = {
  id: string;
  text: string;
  kind: string;
  review: string;
  ownerPersonId: string | null;
  ownerName: string | null;
  dueDate: string | null;
  sourceMeetingId: string;
  sourceTitle: string;
  sourceRecordedAt: string;
  sourcePersonIds: string[];
};

export type LedgerEventRecord = {
  commitmentId: string;
  meetingId: string;
  recordedAt: string;
  status: LedgerStatus;
  note: string | null;
  quote: string | null;
  segmentIdx: number | null;
  startMs: number | null;
  ownerPresent: boolean;
};

export type LedgerPromptItem = {
  id: string;
  text: string;
  ownerName: string | null;
  dueDate: string | null;
  meetingTitle: string;
  dateLabel: string;
};

export type LedgerModelResult = {
  commitment_id: string;
  status: LedgerStatus;
  quote: string | null;
  segment_idx: number | null;
  note: string | null;
};

export type VerifiedLedgerResult = {
  commitmentId: string;
  status: LedgerStatus;
  quote: string | null;
  segmentIdx: number | null;
  startMs: number | null;
  note: string | null;
};

export type LedgerUpdate = {
  id: string;
  status: CommitmentStatus;
  misses: number;
  changeNote: string | null;
};

export class LedgerError extends Error {
  status: number;
  code: string;

  constructor(message: string, status: number, code: string) {
    super(message);
    this.name = "LedgerError";
    this.status = status;
    this.code = code;
  }
}

const blankable = z
  .string()
  .nullable()
  .transform((value) => {
    const text = value?.trim() ?? "";
    return text ? text : null;
  });

const ledgerSchema = z.object({
  results: z.array(
    z.object({
      commitment_id: z.string(),
      status: z.enum(["done", "in_progress", "changed", "not_mentioned"]),
      quote: blankable,
      segment_idx: z.number().int().nullable(),
      note: blankable,
    }),
  ),
});

export function ownerWasPresent(ownerPersonId: string | null, personIds: readonly string[]) {
  if (!ownerPersonId) return false;
  return personIds.includes(ownerPersonId);
}

export function isLedgerCandidate(input: {
  status: string;
  review: string;
  kind: string;
  ownerPersonId: string | null;
  sourcePersonIds: readonly string[];
  sourceMeetingId: string;
  sourceRecordedAt: string;
  meetingId: string;
  meetingRecordedAt: string;
  meetingPersonIds: readonly string[];
}) {
  if (input.sourceMeetingId === input.meetingId) return false;
  if (input.review === "rejected" || input.kind === "suggestion") return false;
  if (!ACTIVE.has(input.status)) return false;
  const sourceAt = Date.parse(input.sourceRecordedAt);
  const meetingAt = Date.parse(input.meetingRecordedAt);
  if (!Number.isFinite(sourceAt) || !Number.isFinite(meetingAt) || sourceAt >= meetingAt) return false;
  if (input.ownerPersonId && input.meetingPersonIds.includes(input.ownerPersonId)) return true;
  if (input.ownerPersonId) return false;
  const present = new Set(input.meetingPersonIds);
  return input.sourcePersonIds.some((id) => present.has(id));
}

/** Status comes from earlier ledger events. A commitment with none is still open. */
export function ledgerCandidates(input: {
  meetingId: string;
  meetingRecordedAt: string;
  meetingPersonIds: readonly string[];
  commitments: LedgerCommitment[];
  events: readonly LedgerEventRecord[];
}) {
  const byCommitment = new Map<string, LedgerEventRecord[]>();
  for (const event of input.events) {
    const list = byCommitment.get(event.commitmentId) ?? [];
    list.push(event);
    byCommitment.set(event.commitmentId, list);
  }
  const meetingAt = Date.parse(input.meetingRecordedAt);
  const picked: LedgerCommitment[] = [];
  for (const commitment of input.commitments) {
    const earlier = (byCommitment.get(commitment.id) ?? []).filter(
      (event) => Date.parse(event.recordedAt) < meetingAt,
    );
    const status = replayLedger(earlier).status;
    if (
      !isLedgerCandidate({
        status,
        review: commitment.review,
        kind: commitment.kind,
        ownerPersonId: commitment.ownerPersonId,
        sourcePersonIds: commitment.sourcePersonIds,
        sourceMeetingId: commitment.sourceMeetingId,
        sourceRecordedAt: commitment.sourceRecordedAt,
        meetingId: input.meetingId,
        meetingRecordedAt: input.meetingRecordedAt,
        meetingPersonIds: input.meetingPersonIds,
      })
    ) {
      continue;
    }
    picked.push(commitment);
  }
  picked.sort(
    (a, b) =>
      Date.parse(a.sourceRecordedAt) - Date.parse(b.sourceRecordedAt) || a.id.localeCompare(b.id),
  );
  return picked;
}

export function replayLedger(
  events: readonly Pick<LedgerEventRecord, "recordedAt" | "meetingId" | "status" | "note" | "ownerPresent">[],
) {
  let status: CommitmentStatus = "open";
  let misses = 0;
  let changeNote: string | null = null;
  const ordered = events.slice().sort((a, b) => {
    const at = Date.parse(a.recordedAt) - Date.parse(b.recordedAt);
    if (at !== 0) return at;
    return a.meetingId.localeCompare(b.meetingId);
  });
  for (const event of ordered) {
    if (event.status === "not_mentioned") {
      if (event.ownerPresent && ACTIVE.has(status)) {
        misses += 1;
        if (misses >= 2) status = "dropped";
      }
      continue;
    }
    misses = 0;
    status = event.status;
    changeNote = event.status === "changed" ? event.note?.trim() || null : null;
  }
  return { status, misses, changeNote };
}

export function verifyLedgerResults(input: {
  candidates: { id: string }[];
  results: LedgerModelResult[];
  segments: EvidenceSegment[];
}): VerifiedLedgerResult[] {
  const wanted = new Set(input.candidates.map((candidate) => candidate.id));
  const seen = new Set<string>();
  const verified: VerifiedLedgerResult[] = [];
  for (const result of input.results) {
    const id = result.commitment_id.trim();
    if (!wanted.has(id) || seen.has(id)) continue;
    seen.add(id);
    verified.push(acceptResult(result, id, input.segments));
  }
  for (const candidate of input.candidates) {
    if (seen.has(candidate.id)) continue;
    verified.push(silence(candidate.id));
  }
  return verified;
}

export function nextLedgerStates(input: {
  meetingId: string;
  meetingRecordedAt: string;
  meetingPersonIds: readonly string[];
  results: readonly VerifiedLedgerResult[];
  retireIds: readonly string[];
  ownerByCommitment: ReadonlyMap<string, string | null>;
  events: readonly LedgerEventRecord[];
}): LedgerUpdate[] {
  const resultById = new Map(input.results.map((result) => [result.commitmentId, result]));
  const ids = new Set<string>([...resultById.keys(), ...input.retireIds]);
  const updates: LedgerUpdate[] = [];
  for (const id of ids) {
    const kept = input.events.filter(
      (event) => event.commitmentId === id && event.meetingId !== input.meetingId,
    );
    const result = resultById.get(id);
    const events = result
      ? [
          ...kept,
          {
            commitmentId: id,
            meetingId: input.meetingId,
            recordedAt: input.meetingRecordedAt,
            status: result.status,
            note: result.note,
            quote: result.quote,
            segmentIdx: result.segmentIdx,
            startMs: result.startMs,
            ownerPresent: ownerWasPresent(
              input.ownerByCommitment.get(id) ?? null,
              input.meetingPersonIds,
            ),
          },
        ]
      : kept;
    const next = replayLedger(events);
    updates.push({ id, status: next.status, misses: next.misses, changeNote: next.changeNote });
  }
  updates.sort((a, b) => a.id.localeCompare(b.id));
  return updates;
}

export function buildLedgerContents(transcript: string, candidates: LedgerPromptItem[]) {
  const blocks = candidates.map((candidate) =>
    [
      `id: ${candidate.id}`,
      `text: ${oneLine(candidate.text)}`,
      `owner: ${oneLine(candidate.ownerName ?? "") || "Unassigned"}`,
      `due: ${candidate.dueDate ?? "none"}`,
      `meeting: ${oneLine(candidate.meetingTitle) || "Untitled meeting"}`,
      `date: ${candidate.dateLabel}`,
    ].join("\n"),
  );
  return `Commitments:\n\n${blocks.join("\n\n")}\n\n${transcript}`;
}

export function parseLedger(raw: string): LedgerModelResult[] {
  const trimmed = raw
    .trim()
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/, "")
    .trim();
  let value: unknown;
  try {
    value = JSON.parse(trimmed);
  } catch {
    throw new LedgerError(LEDGER_UNUSABLE, 502, "model");
  }
  const parsed = ledgerSchema.safeParse(softenLedger(value));
  if (!parsed.success) throw new LedgerError(LEDGER_UNUSABLE, 502, "model");
  return parsed.data.results;
}

export function eventsForMeeting(
  meetingId: string,
  meetingRecordedAt: string,
  results: readonly VerifiedLedgerResult[],
  ownerByCommitment: ReadonlyMap<string, string | null>,
  meetingPersonIds: readonly string[],
): LedgerEventRecord[] {
  return results.map((result) => ({
    commitmentId: result.commitmentId,
    meetingId,
    recordedAt: meetingRecordedAt,
    status: result.status,
    note: result.note,
    quote: result.quote,
    segmentIdx: result.segmentIdx,
    startMs: result.startMs,
    ownerPresent: ownerWasPresent(ownerByCommitment.get(result.commitmentId) ?? null, meetingPersonIds),
  }));
}

function acceptResult(result: LedgerModelResult, id: string, segments: EvidenceSegment[]): VerifiedLedgerResult {
  if (result.status === "not_mentioned") return silence(id);
  const quote = result.quote?.trim() ?? "";
  const segmentIdx = result.segment_idx;
  const segment = segmentIdx == null ? undefined : segments.find((item) => item.idx === segmentIdx);
  if (!quote || segmentIdx == null || !segment || !quoteIsSupported(quote, segments, segmentIdx)) {
    return silence(id);
  }
  const note = result.note?.trim() ?? "";
  return {
    commitmentId: id,
    status: result.status,
    quote,
    segmentIdx,
    startMs: segment.start_ms,
    note: note ? note.slice(0, NOTE_LIMIT) : null,
  };
}

function silence(commitmentId: string): VerifiedLedgerResult {
  return {
    commitmentId,
    status: "not_mentioned",
    quote: null,
    segmentIdx: null,
    startMs: null,
    note: null,
  };
}

function softenLedger(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const record = value as Record<string, unknown>;
  if (!Array.isArray(record.results)) return value;
  return {
    ...record,
    results: record.results.map((item) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) return item;
      const row = item as Record<string, unknown>;
      return {
        ...row,
        quote: row.quote === "" || row.quote == null ? null : row.quote,
        note: row.note === "" || row.note == null ? null : row.note,
        segment_idx: row.segment_idx ?? null,
      };
    }),
  };
}

function oneLine(value: string) {
  return value.replace(/\s+/g, " ").trim();
}
