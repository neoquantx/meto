import { DEFAULT_GEMINI_MODEL } from "@/lib/extract";
import {
  LEDGER_UNCONFIGURED,
  LedgerError,
  eventsForMeeting,
  ledgerCandidates,
  nextLedgerStates,
  ownerWasPresent,
  verifyLedgerResults,
  type LedgerCommitment,
  type LedgerEventRecord,
} from "@/lib/ledger";
import { requestLedger } from "@/lib/ledger-model";
import {
  COMMITMENT_COLUMNS,
  EVENT_COLUMNS,
  formatLedgerDate,
  readStoredCommitment,
  readStoredEvent,
} from "@/lib/ledger-view";
import { createAdminClient } from "@/lib/supabase/admin";
import type { EvidenceSegment } from "@/lib/verify";

export { LedgerError } from "@/lib/ledger";

type Admin = ReturnType<typeof createAdminClient>;

export type LedgerRunResult =
  | { checked: true; updated: number }
  | { checked: false; reason: "already" | "unnamed" | "no_transcript" };

export async function runLedgerCheck(
  admin: Admin,
  input: { ownerId: string; meetingId: string; force: boolean },
): Promise<LedgerRunResult> {
  const { data: meetingRow, error: meetingError } = await admin
    .from("meetings")
    .select("id, recorded_at, summary_language, ledger_checked_at")
    .eq("id", input.meetingId)
    .eq("owner_id", input.ownerId)
    .maybeSingle();
  if (meetingError) throw new Error(meetingError.message);
  const meeting = readMeeting(meetingRow);
  if (!meeting) throw new Error("Meeting not found.");
  if (!input.force && meeting.checkedAt) return { checked: false, reason: "already" };

  const peopleByMeeting = await loadPeople(admin, [input.meetingId]);
  const meetingPersonIds = peopleByMeeting.get(input.meetingId) ?? [];
  if (meetingPersonIds.length === 0) return { checked: false, reason: "unnamed" };

  const segments = await loadSegments(admin, input.meetingId);
  if (segments.length === 0) return { checked: false, reason: "no_transcript" };

  const stored = await loadCommitments(admin, input.ownerId);
  const storedEvents = stored.length ? await loadEvents(admin, stored.map((item) => item.id)) : [];
  const meetingIds = unique([
    input.meetingId,
    ...stored.map((item) => item.meetingId),
    ...storedEvents.map((event) => event.meetingId),
  ]);
  const people = await loadPeople(admin, meetingIds);
  const ownerByCommitment = new Map(stored.map((item) => [item.id, item.ownerPersonId]));
  const commitments: LedgerCommitment[] = stored.map((item) => ({
    id: item.id,
    text: item.text,
    kind: item.kind,
    review: item.review,
    ownerPersonId: item.ownerPersonId,
    ownerName: item.ownerName,
    dueDate: item.dueDate,
    sourceMeetingId: item.meetingId,
    sourceTitle: item.meetingTitle,
    sourceRecordedAt: item.recordedAt,
    sourcePersonIds: people.get(item.meetingId) ?? [],
  }));
  const events: LedgerEventRecord[] = storedEvents.map((event) => ({
    commitmentId: event.commitmentId,
    meetingId: event.meetingId,
    recordedAt: event.recordedAt,
    status: event.status,
    note: event.note,
    quote: event.quote,
    segmentIdx: event.segmentIdx,
    startMs: event.startMs,
    ownerPresent: ownerWasPresent(ownerByCommitment.get(event.commitmentId) ?? null, people.get(event.meetingId) ?? []),
  }));
  const candidates = ledgerCandidates({
    meetingId: input.meetingId,
    meetingRecordedAt: meeting.recordedAt,
    meetingPersonIds,
    commitments,
    events,
  });
  const candidateIds = new Set(candidates.map((item) => item.id));
  const retireIds: string[] = [];
  for (const event of events) {
    if (event.meetingId !== input.meetingId || candidateIds.has(event.commitmentId)) continue;
    if (!retireIds.includes(event.commitmentId)) retireIds.push(event.commitmentId);
  }

  const modelResults = candidates.length
    ? await requestLedger({
        apiKey: geminiKey(),
        model: process.env.GEMINI_MODEL?.trim() || DEFAULT_GEMINI_MODEL,
        summaryLanguage: meeting.summaryLanguage,
        segments,
        candidates: candidates.map((item) => ({
          id: item.id,
          text: item.text,
          ownerName: item.ownerName,
          dueDate: item.dueDate,
          meetingTitle: item.sourceTitle,
          dateLabel: formatLedgerDate(item.sourceRecordedAt),
        })),
      })
    : [];
  const verified = verifyLedgerResults({ candidates, results: modelResults, segments });
  const updates = nextLedgerStates({
    meetingId: input.meetingId,
    meetingRecordedAt: meeting.recordedAt,
    meetingPersonIds,
    results: verified,
    retireIds,
    ownerByCommitment,
    events,
  });
  const replacement = eventsForMeeting(
    input.meetingId,
    meeting.recordedAt,
    verified,
    ownerByCommitment,
    meetingPersonIds,
  );
  await writeLedger(admin, input.ownerId, input.meetingId, updates, replacement);
  return { checked: true, updated: verified.length + retireIds.length };
}

async function writeLedger(
  admin: Admin,
  ownerId: string,
  meetingId: string,
  updates: { id: string; status: string; misses: number; changeNote: string | null }[],
  events: LedgerEventRecord[],
) {
  const ids = unique(updates.map((item) => item.id));
  if (ids.length > 0) {
    const { error: deleteError } = await admin
      .from("commitment_events")
      .delete()
      .eq("meeting_id", meetingId)
      .in("commitment_id", ids);
    if (deleteError) throw new Error(deleteError.message);
  }
  if (events.length > 0) {
    const { error: insertError } = await admin.from("commitment_events").insert(
      events.map((event) => ({
        commitment_id: event.commitmentId,
        meeting_id: meetingId,
        status: event.status,
        quote: event.quote,
        segment_idx: event.segmentIdx,
        start_ms: event.startMs,
        note: event.note,
      })),
    );
    if (insertError) throw new Error(insertError.message);
  }
  const updatedAt = new Date().toISOString();
  for (const update of updates) {
    const { error } = await admin
      .from("commitments")
      .update({
        status: update.status,
        misses: update.misses,
        change_note: update.changeNote,
        updated_at: updatedAt,
      })
      .eq("id", update.id)
      .eq("owner_id", ownerId);
    if (error) throw new Error(error.message);
  }
  const { error: stampError } = await admin
    .from("meetings")
    .update({ ledger_checked_at: updatedAt })
    .eq("id", meetingId)
    .eq("owner_id", ownerId);
  if (stampError) throw new Error(stampError.message);
}

async function loadCommitments(admin: Admin, ownerId: string) {
  const { data, error } = await admin.from("commitments").select(COMMITMENT_COLUMNS).eq("owner_id", ownerId);
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => {
    const parsed = readStoredCommitment(row);
    if (!parsed) throw new Error("Could not read a commitment.");
    return parsed;
  });
}

async function loadEvents(admin: Admin, commitmentIds: string[]) {
  const { data, error } = await admin.from("commitment_events").select(EVENT_COLUMNS).in("commitment_id", commitmentIds);
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => {
    const parsed = readStoredEvent(row);
    if (!parsed) throw new Error("Could not read a ledger event.");
    return parsed;
  });
}

async function loadSegments(admin: Admin, meetingId: string) {
  const { data, error } = await admin
    .from("segments")
    .select("idx, speaker, start_ms, text")
    .eq("meeting_id", meetingId)
    .order("idx", { ascending: true });
  if (error) throw new Error(error.message);
  const segments: EvidenceSegment[] = [];
  for (const row of data ?? []) {
    if (
      typeof row.idx !== "number" ||
      typeof row.speaker !== "number" ||
      typeof row.start_ms !== "number" ||
      typeof row.text !== "string"
    ) {
      throw new Error("Could not read the transcript.");
    }
    segments.push({ idx: row.idx, speaker: row.speaker, start_ms: row.start_ms, text: row.text });
  }
  return segments;
}

async function loadPeople(admin: Admin, meetingIds: string[]) {
  const map = new Map<string, string[]>();
  if (meetingIds.length === 0) return map;
  const { data, error } = await admin
    .from("meeting_speakers")
    .select("meeting_id, person_id")
    .in("meeting_id", meetingIds);
  if (error) throw new Error(error.message);
  for (const row of data ?? []) {
    if (typeof row.meeting_id !== "string" || typeof row.person_id !== "string" || !row.person_id) continue;
    const list = map.get(row.meeting_id) ?? [];
    if (!list.includes(row.person_id)) list.push(row.person_id);
    map.set(row.meeting_id, list);
  }
  return map;
}

function geminiKey() {
  const key = process.env.GEMINI_API_KEY?.trim();
  if (!key) throw new LedgerError(LEDGER_UNCONFIGURED, 500, "config");
  return key;
}

function readMeeting(row: unknown) {
  if (!row || typeof row !== "object") return null;
  const record = row as Record<string, unknown>;
  if (typeof record.recorded_at !== "string") return null;
  return {
    recordedAt: record.recorded_at,
    summaryLanguage: typeof record.summary_language === "string" ? record.summary_language : "en",
    checkedAt: typeof record.ledger_checked_at === "string" ? record.ledger_checked_at : null,
  };
}

function unique(values: string[]) {
  return [...new Set(values)];
}
