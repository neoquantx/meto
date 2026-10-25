import { describe, expect, it } from "vitest";
import {
  LEDGER_UNUSABLE,
  LedgerError,
  buildLedgerContents,
  isLedgerCandidate,
  ledgerCandidates,
  nextLedgerStates,
  parseLedger,
  replayLedger,
  verifyLedgerResults,
  type LedgerCommitment,
  type LedgerEventRecord,
  type LedgerModelResult,
} from "./ledger";
import type { EvidenceSegment } from "./verify";

const rahul = "person-rahul";
const himanshu = "person-himanshu";
const m1At = "2026-10-20T13:00:00.000Z";
const m2At = "2026-10-22T13:00:00.000Z";
const m3At = "2026-10-24T13:00:00.000Z";

const segments: EvidenceSegment[] = [
  { idx: 0, speaker: 1, start_ms: 1_000, text: "Pricing deck maine kal bhej diya tha." },
  { idx: 1, speaker: 0, start_ms: 8_000, text: "Login bug abhi bhi chal raha hai." },
  { idx: 4, speaker: 1, start_ms: 20_000, text: "Pricing deck मैंने कल भेज दिया था।" },
];

function commitment(overrides: Partial<LedgerCommitment> = {}): LedgerCommitment {
  return {
    id: "deck",
    text: "Send the pricing deck",
    kind: "explicit",
    review: "pending",
    ownerPersonId: rahul,
    ownerName: "Rahul",
    dueDate: "2026-10-24",
    sourceMeetingId: "m1",
    sourceTitle: "Launch planning",
    sourceRecordedAt: m1At,
    sourcePersonIds: [rahul, himanshu],
    ...overrides,
  };
}

function result(overrides: Partial<LedgerModelResult> & Pick<LedgerModelResult, "commitment_id" | "status">): LedgerModelResult {
  return {
    quote: null,
    segment_idx: null,
    note: null,
    ...overrides,
  };
}

function event(overrides: Partial<LedgerEventRecord> & Pick<LedgerEventRecord, "commitmentId" | "meetingId" | "status">): LedgerEventRecord {
  return {
    recordedAt: m2At,
    note: null,
    quote: null,
    segmentIdx: null,
    startMs: null,
    ownerPresent: true,
    ...overrides,
  };
}

describe("ledger candidates", () => {
  const meeting = {
    meetingId: "m2",
    meetingRecordedAt: m2At,
    meetingPersonIds: [rahul, himanshu],
  };

  it("keeps earlier promises owned by someone in the room", () => {
    expect(
      isLedgerCandidate({
        ...meeting,
        status: "open",
        review: "confirmed",
        kind: "conditional",
        ownerPersonId: rahul,
        sourcePersonIds: [],
        sourceMeetingId: "m1",
        sourceRecordedAt: m1At,
      }),
    ).toBe(true);
    expect(
      ledgerCandidates({
        ...meeting,
        commitments: [
          commitment(),
          commitment({ id: "later", sourceMeetingId: "m3", sourceRecordedAt: m3At }),
          commitment({ id: "idea", kind: "suggestion" }),
          commitment({ id: "nope", review: "rejected" }),
          commitment({ id: "other", ownerPersonId: "person-else", sourcePersonIds: ["person-else"] }),
          commitment({ id: "same", sourceMeetingId: "m2", sourceRecordedAt: m2At }),
        ],
        events: [],
      }).map((item) => item.id),
    ).toEqual(["deck"]);
  });

  it("includes an unassigned promise only when the source meeting shares a person", () => {
    const shared = commitment({ id: "shared", ownerPersonId: null, ownerName: null });
    const alone = commitment({
      id: "alone",
      ownerPersonId: null,
      sourcePersonIds: ["person-else"],
    });
    expect(
      ledgerCandidates({ ...meeting, commitments: [shared, alone], events: [] }).map((item) => item.id),
    ).toEqual(["shared"]);
  });

  it("skips a promise an earlier meeting already finished", () => {
    const picked = ledgerCandidates({
      ...meeting,
      meetingId: "m3",
      meetingRecordedAt: m3At,
      commitments: [commitment(), commitment({ id: "room", text: "Book the room" })],
      events: [event({ commitmentId: "deck", meetingId: "m2", status: "done", recordedAt: m2At })],
    });
    expect(picked.map((item) => item.id)).toEqual(["room"]);
  });
});

describe("ledger verification", () => {
  it("drops an unsupported quote and keeps a Devanagari quote", () => {
    const verified = verifyLedgerResults({
      candidates: [{ id: "deck" }, { id: "bug" }, { id: "room" }],
      segments,
      results: [
        result({
          commitment_id: "deck",
          status: "done",
          quote: "I sent it last week",
          segment_idx: 0,
        }),
        result({
          commitment_id: "bug",
          status: "in_progress",
          quote: "Login bug abhi bhi chal raha hai.",
          segment_idx: 1,
          note: "  ",
        }),
        result({
          commitment_id: "deck",
          status: "not_mentioned",
        }),
        result({
          commitment_id: "stranger",
          status: "done",
          quote: "Pricing deck maine kal bhej diya tha.",
          segment_idx: 0,
        }),
      ],
    });
    expect(verified).toEqual([
      {
        commitmentId: "deck",
        status: "not_mentioned",
        quote: null,
        segmentIdx: null,
        startMs: null,
        note: null,
      },
      {
        commitmentId: "bug",
        status: "in_progress",
        quote: "Login bug abhi bhi chal raha hai.",
        segmentIdx: 1,
        startMs: 8_000,
        note: null,
      },
      {
        commitmentId: "room",
        status: "not_mentioned",
        quote: null,
        segmentIdx: null,
        startMs: null,
        note: null,
      },
    ]);

    expect(
      verifyLedgerResults({
        candidates: [{ id: "deck" }],
        segments,
        results: [
          result({
            commitment_id: "deck",
            status: "done",
            quote: "Pricing deck मैंने कल भेज दिया था।",
            segment_idx: 4,
          }),
        ],
      })[0],
    ).toMatchObject({ status: "done", segmentIdx: 4, startMs: 20_000 });
  });

  it("parses an empty quote as silence and rejects a bad payload", () => {
    expect(
      parseLedger(
        JSON.stringify({
          results: [{ commitment_id: "deck", status: "not_mentioned", quote: "", segment_idx: null, note: "" }],
        }),
      ),
    ).toEqual([
      { commitment_id: "deck", status: "not_mentioned", quote: null, segment_idx: null, note: null },
    ]);
    expect(() => parseLedger("nope")).toThrow(LedgerError);
    expect(() => parseLedger('{"results":[]}')).not.toThrow();
    expect(() => parseLedger('{"nope":true}')).toThrow(LEDGER_UNUSABLE);
    expect(buildLedgerContents("Transcript", [
      {
        id: "deck",
        text: "Send the deck",
        ownerName: null,
        dueDate: null,
        meetingTitle: "Launch planning",
        dateLabel: "Oct 20",
      },
    ])).toContain("owner: Unassigned");
  });
});

describe("ledger apply", () => {
  const owners = new Map<string, string | null>([
    ["deck", rahul],
    ["bug", himanshu],
    ["room", rahul],
    ["scope", rahul],
  ]);

  it("marks one done, one changed, and drops a promise after two silences", () => {
    const first = nextLedgerStates({
      meetingId: "m2",
      meetingRecordedAt: m2At,
      meetingPersonIds: [rahul, himanshu],
      ownerByCommitment: owners,
      retireIds: [],
      events: [],
      results: [
        { commitmentId: "deck", status: "done", quote: "sent", segmentIdx: 0, startMs: 1_000, note: null },
        {
          commitmentId: "scope",
          status: "changed",
          quote: "shift",
          segmentIdx: 2,
          startMs: 2_000,
          note: "Launch moved",
        },
        { commitmentId: "room", status: "not_mentioned", quote: null, segmentIdx: null, startMs: null, note: null },
        { commitmentId: "bug", status: "in_progress", quote: "half", segmentIdx: 1, startMs: 8_000, note: null },
      ],
    });
    expect(first).toEqual([
      { id: "bug", status: "in_progress", misses: 0, changeNote: null },
      { id: "deck", status: "done", misses: 0, changeNote: null },
      { id: "room", status: "open", misses: 1, changeNote: null },
      { id: "scope", status: "changed", misses: 0, changeNote: "Launch moved" },
    ]);

    const afterFirst: LedgerEventRecord[] = [
      event({ commitmentId: "deck", meetingId: "m2", status: "done", quote: "sent" }),
      event({ commitmentId: "scope", meetingId: "m2", status: "changed", note: "Launch moved" }),
      event({ commitmentId: "room", meetingId: "m2", status: "not_mentioned" }),
      event({ commitmentId: "bug", meetingId: "m2", status: "in_progress" }),
    ];
    const second = nextLedgerStates({
      meetingId: "m3",
      meetingRecordedAt: m3At,
      meetingPersonIds: [rahul, himanshu],
      ownerByCommitment: owners,
      retireIds: [],
      events: afterFirst,
      results: [
        { commitmentId: "bug", status: "done", quote: "fixed", segmentIdx: 0, startMs: 1_000, note: null },
        { commitmentId: "room", status: "not_mentioned", quote: null, segmentIdx: null, startMs: null, note: null },
      ],
    });
    expect(second).toEqual([
      { id: "bug", status: "done", misses: 0, changeNote: null },
      { id: "room", status: "dropped", misses: 2, changeNote: null },
    ]);
  });

  it("does not count a second check of the same meeting, or silence when the owner was absent", () => {
    const existing = [event({ commitmentId: "room", meetingId: "m2", status: "not_mentioned" })];
    expect(
      nextLedgerStates({
        meetingId: "m2",
        meetingRecordedAt: m2At,
        meetingPersonIds: [rahul],
        ownerByCommitment: owners,
        retireIds: [],
        events: existing,
        results: [
          { commitmentId: "room", status: "not_mentioned", quote: null, segmentIdx: null, startMs: null, note: null },
        ],
      }),
    ).toEqual([{ id: "room", status: "open", misses: 1, changeNote: null }]);

    expect(
      replayLedger([
        event({ commitmentId: "room", meetingId: "m2", status: "not_mentioned", ownerPresent: false }),
        event({
          commitmentId: "room",
          meetingId: "m3",
          recordedAt: m3At,
          status: "not_mentioned",
          ownerPresent: true,
        }),
      ]),
    ).toEqual({ status: "open", misses: 1, changeNote: null });
  });

  it("reopens a promise when this meeting's event is retired", () => {
    expect(
      nextLedgerStates({
        meetingId: "m2",
        meetingRecordedAt: m2At,
        meetingPersonIds: [rahul],
        ownerByCommitment: owners,
        results: [],
        retireIds: ["deck"],
        events: [
          event({ commitmentId: "deck", meetingId: "m1", recordedAt: m1At, status: "not_mentioned" }),
          event({ commitmentId: "deck", meetingId: "m2", status: "done" }),
        ],
      }),
    ).toEqual([{ id: "deck", status: "open", misses: 1, changeNote: null }]);
  });
});
