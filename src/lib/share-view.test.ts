import { describe, expect, it } from "vitest";
import { buildShareDocument, isShareToken, newShareToken, parseShareCreate, type ShareSource } from "./share-view";

const rahul = "11111111-1111-4111-8111-111111111111";
const himanshu = "22222222-2222-4222-8222-222222222222";

function source(personId: string | null): ShareSource {
  return {
    personId,
    personName: personId === rahul ? "Rahul" : null,
    title: "Launch planning",
    recordedAt: "2026-10-20T15:00:00.000Z",
    tldr: ["Rahul will email the deck to rahul@example.com"],
    chapters: [{ title: "Pricing", startMs: 0 }],
    decisions: [
      {
        text: "Launch on November 3rd",
        quote: "we're launching on November 3rd",
        startMs: 4000,
        review: "pending",
      },
      {
        text: "Rejected idea",
        quote: "ignore this",
        startMs: 5000,
        review: "rejected",
      },
    ],
    commitments: [
      {
        text: "Send the deck",
        quote: "I'll send the deck",
        kind: "explicit",
        ownerPersonId: rahul,
        ownerName: "Rahul",
        ownerSpeaker: 1,
        startMs: 1000,
        status: "open",
        condition: null,
        dueDate: null,
        changeNote: null,
        review: "pending",
      },
      {
        text: "Call the venue",
        quote: "Call 9876543210 tonight",
        kind: "explicit",
        ownerPersonId: himanshu,
        ownerName: "Himanshu",
        ownerSpeaker: 0,
        startMs: 2000,
        status: "open",
        condition: null,
        dueDate: null,
        changeNote: "card 4111 1111 1111 1111",
        review: "pending",
      },
    ],
    segments: [
      { speaker: 1, startMs: 1000, text: "Email me at rahul@example.com when it is done." },
      { speaker: 0, startMs: 2000, text: "Call 9876543210 tonight." },
    ],
    speakers: [
      { speaker: 1, personId: rahul, name: "Rahul" },
      { speaker: 0, personId: himanshu, name: "Himanshu" },
    ],
  };
}

describe("share links", () => {
  it("makes a 24 character token and accepts a whole meeting or one person", () => {
    expect(newShareToken()).toMatch(/^[A-Za-z0-9_-]{24}$/);
    expect(isShareToken("short")).toBe(false);
    expect(parseShareCreate({})).toEqual({ ok: true, personId: null });
    expect(parseShareCreate({ person_id: rahul }).ok).toBe(true);
    expect(parseShareCreate({ person_id: "rahul" }).ok).toBe(false);
  });

  it("hides emails, phones, and card numbers, and keeps a person share to that person", () => {
    const whole = JSON.stringify(buildShareDocument(source(null)));
    expect(whole).not.toContain("rahul@example.com");
    expect(whole).not.toContain("9876543210");
    expect(whole).not.toContain("4111");
    expect(whole).toContain("[redacted]");
    expect(whole).toContain("Launch on November 3rd");
    expect(whole).not.toContain("Rejected idea");

    const person = buildShareDocument(source(rahul));
    const packed = JSON.stringify(person);
    expect(person.scope).toBe("person");
    expect(person.personName).toBe("Rahul");
    expect(person.tldr).toEqual([]);
    expect(person.decisions).toEqual([]);
    expect(person.commitments.map((item) => item.owner)).toEqual(["Rahul"]);
    expect(person.lines.map((line) => line.speaker)).toEqual(["Rahul"]);
    expect(packed).not.toContain("9876543210");
    expect(packed).not.toContain("rahul@example.com");
    expect(packed).toContain("[redacted]");
  });
});
