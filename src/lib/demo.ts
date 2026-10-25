import type { OffRecordRange } from "@/lib/capture-limits";
import {
  toHistoryLinks,
  type BriefCommitment,
  type BriefDecision,
  type LedgerListItem,
  type StoredDecision,
  type StoredEvent,
} from "@/lib/ledger-view";
import { simpleTokens, type LibraryMeeting, type TranscriptHit } from "@/lib/library";
import type {
  ChapterRow,
  CommitmentRow,
  DecisionRow,
  SpeakerRow,
  TranscriptSegment,
} from "@/lib/meeting-view";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: string) {
  return UUID_RE.test(value.trim());
}

export function readDemoOwnerId(raw = process.env.DEMO_OWNER_ID): string | null {
  const trimmed = raw?.trim() ?? "";
  if (!trimmed || !isUuid(trimmed)) return null;
  return trimmed;
}

const PERSON_HIMANSHU = "00000000-0000-4000-8000-000000000001";
const PERSON_RAHUL = "00000000-0000-4000-8000-000000000002";

export const DEMO_MEETING_IDS = {
  m1: "10000000-0000-4000-8000-000000000001",
  m2: "10000000-0000-4000-8000-000000000002",
  m3: "10000000-0000-4000-8000-000000000003",
} as const;

type FallbackMeeting = {
  id: string;
  title: string;
  recordedAt: string;
  durationSec: number;
  source: "mic" | "tab" | "upload";
  status: "ready";
  summaryLanguage: "en" | "hi" | "hinglish";
  droppedCount: number;
  ledgerChecked: boolean;
  tldr: string[];
  chapters: ChapterRow[];
  pauses: OffRecordRange[];
  speakers: SpeakerRow[];
  segments: TranscriptSegment[];
  decisions: DecisionRow[];
  commitments: (Omit<CommitmentRow, "history"> & {
    ownerPersonId: string | null;
    misses: number;
  })[];
};

const FALLBACK_PEOPLE = [
  { id: PERSON_HIMANSHU, name: "Himanshu" },
  { id: PERSON_RAHUL, name: "Rahul" },
];

const FALLBACK_EVENTS: StoredEvent[] = [
  {
    commitmentId: "20000000-0000-4000-8000-000000000001",
    meetingId: DEMO_MEETING_IDS.m2,
    meetingTitle: "Weekly sync",
    recordedAt: "2026-10-22T14:00:00.000Z",
    status: "done",
    quote: "Pricing deck maine kal bhej diya tha.",
    segmentIdx: 0,
    startMs: 6000,
    note: null,
  },
  {
    commitmentId: "20000000-0000-4000-8000-000000000002",
    meetingId: DEMO_MEETING_IDS.m2,
    meetingTitle: "Weekly sync",
    recordedAt: "2026-10-22T14:00:00.000Z",
    status: "in_progress",
    quote: "Login bug abhi bhi chal raha hai, half fix ho gaya.",
    segmentIdx: 1,
    startMs: 18000,
    note: null,
  },
  {
    commitmentId: "20000000-0000-4000-8000-000000000002",
    meetingId: DEMO_MEETING_IDS.m3,
    meetingTitle: "Pre-launch check",
    recordedAt: "2026-10-24T14:00:00.000Z",
    status: "done",
    quote: "Login bug is fixed and deployed.",
    segmentIdx: 0,
    startMs: 5000,
    note: null,
  },
  {
    commitmentId: "20000000-0000-4000-8000-000000000004",
    meetingId: DEMO_MEETING_IDS.m2,
    meetingTitle: "Weekly sync",
    recordedAt: "2026-10-22T14:00:00.000Z",
    status: "not_mentioned",
    quote: null,
    segmentIdx: null,
    startMs: null,
    note: null,
  },
  {
    commitmentId: "20000000-0000-4000-8000-000000000004",
    meetingId: DEMO_MEETING_IDS.m3,
    meetingTitle: "Pre-launch check",
    recordedAt: "2026-10-24T14:00:00.000Z",
    status: "not_mentioned",
    quote: null,
    segmentIdx: null,
    startMs: null,
    note: null,
  },
];

const FALLBACK_MEETINGS: FallbackMeeting[] = [
  {
    id: DEMO_MEETING_IDS.m1,
    title: "Launch planning",
    recordedAt: "2026-10-20T14:00:00.000Z",
    durationSec: 95,
    source: "mic",
    status: "ready",
    summaryLanguage: "en",
    droppedCount: 1,
    ledgerChecked: true,
    tldr: [
      "Team agreed to launch on November 3rd after closing beta blockers.",
      "Rahul will send the pricing deck by Friday and book the demo room.",
      "Himanshu will fix the login bug before Wednesday.",
    ],
    chapters: [
      { title: "Deliverables and owners", segment_idx: 1, start_ms: 14000 },
      { title: "Launch date and room booking", segment_idx: 4, start_ms: 60000 },
    ],
    pauses: [{ at_ms: 42000, paused_ms: 60000 }],
    speakers: [
      { speaker: 0, personId: PERSON_HIMANSHU, name: "Himanshu", name_hint: "Himanshu" },
      { speaker: 1, personId: PERSON_RAHUL, name: "Rahul", name_hint: "Rahul" },
    ],
    segments: [
      {
        idx: 0,
        speaker: 0,
        start_ms: 4000,
        end_ms: 12000,
        text: "Hi, I'm Himanshu. Let's lock the launch tasks for the next two weeks.",
      },
      {
        idx: 1,
        speaker: 1,
        start_ms: 14000,
        end_ms: 24000,
        text: "Hey, I'm Rahul. I'll send the pricing deck by Friday.",
      },
      {
        idx: 2,
        speaker: 0,
        start_ms: 26000,
        end_ms: 38000,
        text: "Thanks. I'll fix the login bug before Wednesday.",
      },
      {
        idx: 3,
        speaker: 1,
        start_ms: 45000,
        end_ms: 56000,
        text: "Maybe we should try a referral program.",
      },
      {
        idx: 4,
        speaker: 0,
        start_ms: 60000,
        end_ms: 70000,
        text: "Okay, we're launching on November 3rd.",
      },
      {
        idx: 5,
        speaker: 0,
        start_ms: 74000,
        end_ms: 82000,
        text: "Rahul, can you book the demo room?",
      },
      {
        idx: 6,
        speaker: 1,
        start_ms: 84000,
        end_ms: 91000,
        text: "Sure, I'll do it.",
      },
    ],
    decisions: [
      {
        id: "30000000-0000-4000-8000-000000000001",
        text: "Launch on November 3rd.",
        quote: "Okay, we're launching on November 3rd.",
        segment_idx: 4,
        start_ms: 60000,
        review: "confirmed",
      },
    ],
    commitments: [
      {
        id: "20000000-0000-4000-8000-000000000001",
        text: "Send the pricing deck",
        quote: "I'll send the pricing deck by Friday.",
        kind: "explicit",
        condition: null,
        due_date: "2026-10-23",
        change_note: null,
        start_ms: 14000,
        segment_idx: 1,
        review: "confirmed",
        status: "done",
        owner_speaker: 1,
        owner_name: "Rahul",
        ownerPersonId: PERSON_RAHUL,
        misses: 0,
      },
      {
        id: "20000000-0000-4000-8000-000000000002",
        text: "Fix the login bug",
        quote: "I'll fix the login bug before Wednesday.",
        kind: "explicit",
        condition: null,
        due_date: "2026-10-21",
        change_note: null,
        start_ms: 26000,
        segment_idx: 2,
        review: "confirmed",
        status: "done",
        owner_speaker: 0,
        owner_name: "Himanshu",
        ownerPersonId: PERSON_HIMANSHU,
        misses: 0,
      },
      {
        id: "20000000-0000-4000-8000-000000000003",
        text: "Try a referral program",
        quote: "Maybe we should try a referral program.",
        kind: "suggestion",
        condition: null,
        due_date: null,
        change_note: null,
        start_ms: 45000,
        segment_idx: 3,
        review: "pending",
        status: "open",
        owner_speaker: 1,
        owner_name: "Rahul",
        ownerPersonId: PERSON_RAHUL,
        misses: 0,
      },
      {
        id: "20000000-0000-4000-8000-000000000004",
        text: "Book the demo room",
        quote: "Rahul, can you book the demo room?",
        kind: "explicit",
        condition: null,
        due_date: null,
        change_note: null,
        start_ms: 74000,
        segment_idx: 5,
        review: "confirmed",
        status: "dropped",
        owner_speaker: 1,
        owner_name: "Rahul",
        ownerPersonId: PERSON_RAHUL,
        misses: 2,
      },
    ],
  },
  {
    id: DEMO_MEETING_IDS.m2,
    title: "Weekly sync",
    recordedAt: "2026-10-22T14:00:00.000Z",
    durationSec: 68,
    source: "tab",
    status: "ready",
    summaryLanguage: "hinglish",
    droppedCount: 0,
    ledgerChecked: true,
    tldr: [
      "Rahul ne pricing deck kal bhej diya tha.",
      "Login bug half fix ho gaya hai aur abhi in progress hai.",
      "Launch date November 10 ko shift kar di gayi.",
    ],
    chapters: [
      { title: "Pricing deck aur login bug update", segment_idx: 0, start_ms: 6000 },
      { title: "Launch date shift", segment_idx: 2, start_ms: 44000 },
    ],
    pauses: [],
    speakers: [
      { speaker: 0, personId: PERSON_HIMANSHU, name: "Himanshu", name_hint: null },
      { speaker: 1, personId: PERSON_RAHUL, name: "Rahul", name_hint: null },
    ],
    segments: [
      {
        idx: 0,
        speaker: 1,
        start_ms: 6000,
        end_ms: 15000,
        text: "Pricing deck maine kal bhej diya tha.",
      },
      {
        idx: 1,
        speaker: 0,
        start_ms: 18000,
        end_ms: 34000,
        text: "Login bug abhi bhi chal raha hai, half fix ho gaya.",
      },
      {
        idx: 2,
        speaker: 0,
        start_ms: 44000,
        end_ms: 58000,
        text: "Launch November 10 ko shift karte hain.",
      },
    ],
    decisions: [
      {
        id: "30000000-0000-4000-8000-000000000002",
        text: "Launch November 10 ko shift karte hain.",
        quote: "Launch November 10 ko shift karte hain.",
        segment_idx: 2,
        start_ms: 44000,
        review: "confirmed",
      },
    ],
    commitments: [],
  },
  {
    id: DEMO_MEETING_IDS.m3,
    title: "Pre-launch check",
    recordedAt: "2026-10-24T14:00:00.000Z",
    durationSec: 52,
    source: "mic",
    status: "ready",
    summaryLanguage: "en",
    droppedCount: 0,
    ledgerChecked: true,
    tldr: [
      "Himanshu finished and deployed the login bug fix.",
      "Rahul will email the investors if the beta numbers look good.",
      "The demo room booking was not mentioned for a second meeting and is marked dropped.",
    ],
    chapters: [
      { title: "Login bug deployed", segment_idx: 0, start_ms: 5000 },
      { title: "Investor update condition", segment_idx: 1, start_ms: 20000 },
    ],
    pauses: [],
    speakers: [
      { speaker: 0, personId: PERSON_HIMANSHU, name: "Himanshu", name_hint: null },
      { speaker: 1, personId: PERSON_RAHUL, name: "Rahul", name_hint: null },
    ],
    segments: [
      {
        idx: 0,
        speaker: 0,
        start_ms: 5000,
        end_ms: 16000,
        text: "Login bug is fixed and deployed.",
      },
      {
        idx: 1,
        speaker: 1,
        start_ms: 20000,
        end_ms: 36000,
        text: "If the beta numbers look good, I'll email the investors.",
      },
    ],
    decisions: [],
    commitments: [
      {
        id: "20000000-0000-4000-8000-000000000005",
        text: "Email the investors",
        quote: "If the beta numbers look good, I'll email the investors.",
        kind: "conditional",
        condition: "the beta numbers look good",
        due_date: null,
        change_note: null,
        start_ms: 20000,
        segment_idx: 1,
        review: "confirmed",
        status: "open",
        owner_speaker: 1,
        owner_name: "Rahul",
        ownerPersonId: PERSON_RAHUL,
        misses: 0,
      },
    ],
  },
];

export function fallbackLibraryData(query: string) {
  const meetings: LibraryMeeting[] = FALLBACK_MEETINGS.map((m) => ({
    id: m.id,
    title: m.title,
    recordedAt: m.recordedAt,
    status: m.status,
    durationSec: m.durationSec,
    source: m.source,
  })).sort((a, b) => Date.parse(b.recordedAt) - Date.parse(a.recordedAt));

  const queryTokens = simpleTokens(query);
  const titleMatchIds = new Set<string>();
  const hits: TranscriptHit[] = [];

  if (queryTokens.length > 0) {
    for (const meeting of FALLBACK_MEETINGS) {
      const titleWords = new Set(simpleTokens(meeting.title));
      if (queryTokens.every((token) => titleWords.has(token))) {
        titleMatchIds.add(meeting.id);
      }
      for (const segment of meeting.segments) {
        const segmentWords = new Set(simpleTokens(segment.text));
        if (queryTokens.every((token) => segmentWords.has(token))) {
          hits.push({
            meetingId: meeting.id,
            idx: segment.idx,
            startMs: segment.start_ms,
            text: segment.text,
          });
        }
      }
    }
  }

  return { meetings, titleMatchIds, hits };
}

export function fallbackMeetingDetail(id: string) {
  const found = FALLBACK_MEETINGS.find((item) => item.id === id);
  if (!found) return null;
  const eventsByCommitment = new Map<string, StoredEvent[]>();
  for (const event of FALLBACK_EVENTS) {
    const list = eventsByCommitment.get(event.commitmentId) ?? [];
    list.push(event);
    eventsByCommitment.set(event.commitmentId, list);
  }
  const commitments: CommitmentRow[] = found.commitments.map((item) => ({
    id: item.id,
    text: item.text,
    quote: item.quote,
    kind: item.kind,
    condition: item.condition,
    due_date: item.due_date,
    change_note: item.change_note,
    start_ms: item.start_ms,
    segment_idx: item.segment_idx,
    review: item.review,
    status: item.status,
    owner_speaker: item.owner_speaker,
    owner_name: item.owner_name,
    history: toHistoryLinks(eventsByCommitment.get(item.id) ?? []),
  }));
  return {
    id: found.id,
    title: found.title,
    status: found.status,
    error: null,
    recordedAt: found.recordedAt,
    durationSec: found.durationSec,
    source: found.source,
    video: false,
    hasAudio: false,
    playbackUrl: null,
    pauses: found.pauses,
    droppedCount: found.droppedCount,
    tldr: found.tldr,
    chapters: found.chapters,
    ledgerChecked: found.ledgerChecked,
    segments: found.segments,
    speakers: found.speakers,
    decisions: found.decisions,
    commitments,
  };
}

export function fallbackLedgerList(): LedgerListItem[] {
  const eventsByCommitment = new Map<string, StoredEvent[]>();
  for (const event of FALLBACK_EVENTS) {
    const list = eventsByCommitment.get(event.commitmentId) ?? [];
    list.push(event);
    eventsByCommitment.set(event.commitmentId, list);
  }
  const list: LedgerListItem[] = [];
  for (const meeting of FALLBACK_MEETINGS) {
    for (const item of meeting.commitments) {
      list.push({
        id: item.id,
        text: item.text,
        quote: item.quote,
        kind: item.kind,
        condition: item.condition,
        dueDate: item.due_date,
        changeNote: item.change_note,
        startMs: item.start_ms,
        segmentIdx: item.segment_idx,
        review: item.review,
        status: item.status,
        misses: item.misses,
        ownerPersonId: item.ownerPersonId,
        ownerName: item.owner_name,
        meetingId: meeting.id,
        meetingTitle: meeting.title,
        recordedAt: meeting.recordedAt,
        history: toHistoryLinks(eventsByCommitment.get(item.id) ?? []),
      });
    }
  }
  return list;
}

export function fallbackDecisionList(): StoredDecision[] {
  const list: StoredDecision[] = [];
  for (const meeting of FALLBACK_MEETINGS) {
    for (const decision of meeting.decisions) {
      list.push({
        id: decision.id,
        text: decision.text,
        quote: decision.quote,
        startMs: decision.start_ms,
        segmentIdx: decision.segment_idx,
        review: decision.review,
        meetingId: meeting.id,
        meetingTitle: meeting.title,
        recordedAt: meeting.recordedAt,
      });
    }
  }
  list.sort((a, b) => Date.parse(b.recordedAt) - Date.parse(a.recordedAt) || a.startMs - b.startMs);
  return list;
}

export function fallbackBriefData(): {
  people: { id: string; name: string }[];
  commitments: BriefCommitment[];
  decisions: BriefDecision[];
} {
  const commitments = fallbackLedgerList();
  const decisions = fallbackDecisionList().map((item) => {
    const meeting = FALLBACK_MEETINGS.find((m) => m.id === item.meetingId);
    const personIds = (meeting?.speakers ?? []).flatMap((s) => (s.personId ? [s.personId] : []));
    return { ...item, personIds };
  });
  return {
    people: FALLBACK_PEOPLE,
    commitments,
    decisions,
  };
}
