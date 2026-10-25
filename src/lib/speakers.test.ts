import { describe, expect, it } from "vitest";
import {
  commitmentOwnerUpdates,
  normalizePersonName,
  parseSpeakerSave,
  personIdForOwner,
  personNameKey,
} from "./speakers";

describe("speaker names", () => {
  it("collapses whitespace and treats case as the same person", () => {
    expect(normalizePersonName("  Rahul\nSharma  ")).toEqual({ ok: true, name: "Rahul Sharma" });
    expect(normalizePersonName("   ")).toEqual({ ok: true, name: null });
    expect(normalizePersonName("a".repeat(81)).ok).toBe(false);
    expect(personNameKey("Rahul")).toBe(personNameKey("rahul"));
  });

  it("requires every known speaker and keeps an empty name as a clear", () => {
    expect(parseSpeakerSave({ speakers: [{ speaker: 0, name: "Rahul" }] }, [0, 1])).toEqual({
      ok: false,
      error: "Send a name for each speaker.",
    });
    expect(parseSpeakerSave({ speakers: [{ speaker: 3, name: "Rahul" }] }, [0])).toEqual({
      ok: false,
      error: "That speaker is not in this meeting.",
    });

    const saved = parseSpeakerSave(
      {
        speakers: [
          { speaker: 1, name: "rahul" },
          { speaker: 0, name: "  " },
        ],
      },
      [0, 1],
    );
    expect(saved).toEqual({
      ok: true,
      assignments: [
        { speaker: 0, name: null },
        { speaker: 1, name: "rahul" },
      ],
    });
  });

  it("points each commitment at the person mapped to its speaker", () => {
    expect(personIdForOwner(null, new Map([[0, "person-rahul"]]))).toBeNull();
    expect(personIdForOwner(4, new Map([[0, "person-rahul"]]))).toBeNull();

    expect(
      commitmentOwnerUpdates(
        [
          { id: "c1", owner_speaker: 1, owner_person_id: null },
          { id: "c2", owner_speaker: 0, owner_person_id: "person-old" },
          { id: "c3", owner_speaker: null, owner_person_id: null },
          { id: "c4", owner_speaker: 1, owner_person_id: "person-rahul" },
        ],
        [
          { speaker: 0, person_id: null },
          { speaker: 1, person_id: "person-rahul" },
        ],
      ),
    ).toEqual([
      { id: "c1", owner_person_id: "person-rahul" },
      { id: "c2", owner_person_id: null },
    ]);
  });
});
