import { describe, expect, it } from "vitest";
import {
  buildBrief,
  evidenceHref,
  formatLedgerDate,
  groupLedger,
  ledgerHistoryLine,
  parseEvidenceQuery,
  parseLedgerFilter,
  readStoredCommitment,
  readStoredEvent,
  toHistoryLinks,
  type LedgerListItem,
} from "./ledger-view";

function item(overrides: Partial<LedgerListItem> = {}): LedgerListItem {
  return {
    id: "deck",
    text: "Send the deck",
    quote: "I'll send the deck",
    kind: "explicit",
    condition: null,
    dueDate: null,
    changeNote: null,
    startMs: 1000,
    segmentIdx: 0,
    review: "pending",
    status: "open",
    misses: 0,
    ownerPersonId: "rahul",
    ownerName: "Rahul",
    meetingId: "m1",
    meetingTitle: "Launch planning",
    recordedAt: "2026-10-20T13:00:00.000Z",
    history: [],
    ...overrides,
  };
}

describe("ledger pages", () => {
  it("formats a history line and an evidence link", () => {
    expect(formatLedgerDate("2026-10-20T13:00:00.000Z")).toBe("Oct 20");
    expect(
      ledgerHistoryLine({
        status: "done",
        meetingTitle: "Weekly sync",
        recordedAt: "2026-10-20T13:00:00.000Z",
        quote: "sent the deck yesterday",
      }),
    ).toBe("Done in Weekly sync, Oct 20 — 'sent the deck yesterday'");
    expect(evidenceHref("m2", 1500, 3)).toBe("/meetings/m2?t=1500&line=3");
    expect(parseEvidenceQuery("1500", "3")).toEqual({ startAtMs: 1500, startLine: 3 });
    expect(parseEvidenceQuery("nope", undefined)).toEqual({ startAtMs: null, startLine: null });
    expect(parseLedgerFilter("dropped")).toBe("dropped");
    expect(parseLedgerFilter("nope")).toBe("all");
  });

  it("groups by person and filters status", () => {
    const groups = groupLedger(
      [
        item({ id: "a", status: "done" }),
        item({ id: "b", status: "open", text: "Book the room" }),
        item({ id: "c", ownerPersonId: null, ownerName: null, status: "dropped", text: "Follow up" }),
        item({ id: "d", kind: "suggestion", text: "Try referrals" }),
      ],
      "open",
    );
    expect(groups).toEqual([
      expect.objectContaining({
        id: "rahul",
        label: "Rahul",
        items: [expect.objectContaining({ id: "b" })],
      }),
    ]);
  });

  it("builds a brief from the selected people", () => {
    const people = [
      { id: "rahul", name: "Rahul" },
      { id: "himanshu", name: "Himanshu" },
    ];
    const commitments = [
      item({ id: "open", status: "open" }),
      item({ id: "progress", status: "in_progress", ownerPersonId: "himanshu", ownerName: "Himanshu" }),
      item({ id: "done", status: "done" }),
      item({ id: "idea", kind: "suggestion" }),
      item({
        id: "gone",
        status: "dropped",
        ownerPersonId: "rahul",
        recordedAt: "2026-10-22T13:00:00.000Z",
      }),
    ];
    const decisions = [0, 1, 2, 3, 4, 5].map((index) => ({
      id: `d${index}`,
      text: `Decision ${index}`,
      quote: "Okay",
      startMs: index,
      segmentIdx: index,
      review: "pending",
      meetingId: index === 5 ? "other" : "m1",
      meetingTitle: "Launch planning",
      recordedAt: `2026-10-${20 + index}T13:00:00.000Z`,
      personIds: index === 5 ? ["other"] : ["rahul"],
    }));
    const brief = buildBrief({ personIds: ["rahul"], people, commitments, decisions });
    expect(brief.groups[0]?.items.map((entry) => entry.id)).toEqual(["gone", "open"]);
    expect(brief.decisions.map((entry) => entry.id)).toEqual(["d4", "d3", "d2", "d1", "d0"]);
  });

  it("reads a stored commitment and orders its history", () => {
    expect(
      readStoredCommitment({
        id: "deck",
        text: " Send the deck ",
        quote: "I'll send the deck",
        kind: "explicit",
        condition: null,
        due_date: "2026-10-24",
        change_note: null,
        start_ms: 1000,
        segment_idx: 2,
        review: "confirmed",
        status: "open",
        misses: 1,
        owner_person_id: "rahul",
        meeting_id: "m1",
        owner: [{ name: "Rahul" }],
        meeting: { id: "m1", title: "Launch planning", recorded_at: "2026-10-20T13:00:00.000Z" },
      }),
    ).toMatchObject({ ownerName: "Rahul", meetingTitle: "Launch planning", misses: 1 });

    const links = toHistoryLinks([
      readStoredEvent({
        commitment_id: "deck",
        meeting_id: "m3",
        status: "done",
        quote: "fixed",
        segment_idx: 1,
        start_ms: 4000,
        note: null,
        meeting: { id: "m3", title: "Pre-launch check", recorded_at: "2026-10-24T13:00:00.000Z" },
      })!,
      readStoredEvent({
        commitment_id: "deck",
        meeting_id: "m2",
        status: "not_mentioned",
        quote: null,
        segment_idx: null,
        start_ms: null,
        note: null,
        meeting: { id: "m2", title: "Weekly sync", recorded_at: "2026-10-22T13:00:00.000Z" },
      })!,
    ]);
    expect(links.map((link) => link.line)).toEqual([
      "Not mentioned in Weekly sync, Oct 22",
      "Done in Pre-launch check, Oct 24 — 'fixed'",
    ]);
  });
});
