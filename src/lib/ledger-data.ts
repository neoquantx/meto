import {
  COMMITMENT_COLUMNS,
  DECISION_COLUMNS,
  EVENT_COLUMNS,
  readPersonRow,
  readStoredCommitment,
  readStoredDecision,
  readStoredEvent,
  toHistoryLinks,
  type BriefDecision,
  type LedgerListItem,
} from "@/lib/ledger-view";
import { createAdminClient } from "@/lib/supabase/admin";

type Admin = ReturnType<typeof createAdminClient>;

export async function loadLedgerList(admin: Admin, ownerId: string) {
  const commitments = await loadCommitments(admin, ownerId);
  const events = commitments.length
    ? await loadEvents(
        admin,
        commitments.map((item) => item.id),
      )
    : [];
  const byCommitment = new Map<string, typeof events>();
  for (const event of events) {
    const list = byCommitment.get(event.commitmentId) ?? [];
    list.push(event);
    byCommitment.set(event.commitmentId, list);
  }
  const items: LedgerListItem[] = commitments.map((item) => ({
    ...item,
    history: toHistoryLinks(byCommitment.get(item.id) ?? []),
  }));
  return items;
}

export async function loadDecisionList(admin: Admin, ownerId: string) {
  const { data, error } = await admin.from("decisions").select(DECISION_COLUMNS).eq("owner_id", ownerId);
  if (error) throw new Error(error.message);
  return (data ?? [])
    .map((row) => {
      const parsed = readStoredDecision(row);
      if (!parsed) throw new Error("Could not read a decision.");
      return parsed;
    })
    .filter((item) => item.review !== "rejected")
    .sort((a, b) => Date.parse(b.recordedAt) - Date.parse(a.recordedAt) || a.startMs - b.startMs);
}

export async function loadBriefData(admin: Admin, ownerId: string) {
  const [peopleResult, commitments, decisions] = await Promise.all([
    admin.from("people").select("id, name").eq("owner_id", ownerId).order("name", { ascending: true }),
    loadCommitments(admin, ownerId),
    loadDecisionList(admin, ownerId),
  ]);
  if (peopleResult.error) throw new Error(peopleResult.error.message);
  const people = (peopleResult.data ?? []).map((row) => {
    const parsed = readPersonRow(row);
    if (!parsed) throw new Error("Could not read a person.");
    return parsed;
  });
  const meetingIds = unique(decisions.map((item) => item.meetingId));
  const peopleByMeeting = await loadMeetingPeople(admin, meetingIds);
  const briefDecisions: BriefDecision[] = decisions.map((item) => ({
    ...item,
    personIds: peopleByMeeting.get(item.meetingId) ?? [],
  }));
  return { people, commitments, decisions: briefDecisions };
}

export async function loadCommitmentHistory(admin: Admin, commitmentIds: string[]) {
  const events = await loadEvents(admin, commitmentIds);
  const byCommitment = new Map<string, ReturnType<typeof toHistoryLinks>>();
  const grouped = new Map<string, typeof events>();
  for (const event of events) {
    const list = grouped.get(event.commitmentId) ?? [];
    list.push(event);
    grouped.set(event.commitmentId, list);
  }
  for (const [id, list] of grouped) byCommitment.set(id, toHistoryLinks(list));
  return byCommitment;
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
  if (commitmentIds.length === 0) return [];
  const { data, error } = await admin.from("commitment_events").select(EVENT_COLUMNS).in("commitment_id", commitmentIds);
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => {
    const parsed = readStoredEvent(row);
    if (!parsed) throw new Error("Could not read a ledger event.");
    return parsed;
  });
}

async function loadMeetingPeople(admin: Admin, meetingIds: string[]) {
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

function unique(values: string[]) {
  return [...new Set(values)];
}
