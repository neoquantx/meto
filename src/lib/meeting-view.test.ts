import { describe, expect, it } from "vitest";
import {
  parseChapters,
  parseReviewSave,
  parseTldr,
  readCommitment,
  whoOwesWhat,
} from "./meeting-view";

const item = {
  id: "c1",
  text: "Send the deck",
  kind: "explicit" as const,
  review: "pending" as const,
  status: "open",
  owner_speaker: 1 as number | null,
  owner_name: null as string | null,
};

describe("meeting view", () => {
  it("keeps three summary lines and chapters that have a time", () => {
    expect(parseTldr(["  One  ", "", "Two", 4, "Three", "Four"])).toEqual(["One", "Two", "Three"]);
    expect(
      parseChapters([
        { title: " Deck ", segment_idx: 1, start_ms: 1500.4 },
        { title: "", segment_idx: 2, start_ms: 2000 },
        { title: "Later", segment_idx: -1, start_ms: 3000 },
      ]),
    ).toEqual([{ title: "Deck", segment_idx: 1, start_ms: 1500 }]);
  });

  it("groups open promises by person and leaves out suggestions, rejections, and finished items", () => {
    expect(
      whoOwesWhat([
        { ...item, id: "a", owner_name: "Rahul", text: "Send the deck" },
        { ...item, id: "b", owner_name: "rahul", text: "Book the room", kind: "conditional" },
        { ...item, id: "c", owner_speaker: 0, text: "Fix the bug" },
        { ...item, id: "d", kind: "suggestion", text: "Try referrals" },
        { ...item, id: "e", review: "rejected", text: "Ignore this" },
        { ...item, id: "f", status: "done", text: "Already sent" },
        { ...item, id: "g", owner_speaker: null, text: "Someone should follow up" },
      ]),
    ).toEqual([
      {
        id: "name:rahul",
        label: "Rahul",
        items: [
          { id: "a", text: "Send the deck", kind: "explicit" },
          { id: "b", text: "Book the room", kind: "conditional" },
        ],
      },
      { id: "speaker:0", label: "Speaker 0", items: [{ id: "c", text: "Fix the bug", kind: "explicit" }] },
      {
        id: "unassigned",
        label: "Unassigned",
        items: [{ id: "g", text: "Someone should follow up", kind: "explicit" }],
      },
    ]);
  });

  it("reads a commitment owner from the joined person", () => {
    expect(
      readCommitment({
        id: "c1",
        text: "Send the deck",
        quote: "I'll send the deck",
        kind: "explicit",
        condition: "  ",
        due_date: "2026-10-24",
        start_ms: 1200,
        segment_idx: 2,
        review: "confirmed",
        status: "open",
        owner_speaker: 1,
        owner: { name: " Rahul " },
      }),
    ).toMatchObject({
      owner_name: "Rahul",
      review: "confirmed",
      condition: null,
      due_date: "2026-10-24",
    });
  });

  it("accepts confirm and reject for a decision or commitment", () => {
    const id = "123e4567-e89b-12d3-a456-426614174000";
    expect(parseReviewSave({ target: "commitment", id, review: "rejected" })).toEqual({
      ok: true,
      target: "commitment",
      id,
      review: "rejected",
    });
    expect(parseReviewSave({ target: "note", id, review: "confirmed" }).ok).toBe(false);
    expect(parseReviewSave({ target: "decision", id: "nope", review: "confirmed" }).ok).toBe(false);
  });
});
