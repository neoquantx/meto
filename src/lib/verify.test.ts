import { describe, expect, it } from "vitest";
import {
  normalizeText,
  quoteIsSupported,
  resolveDueDate,
  resolveOwner,
  verifyExtraction,
  type EvidenceSegment,
  type ExtractionDraft,
} from "./verify";

const recordedAt = new Date("2026-10-19T12:00:00Z");

const segments: EvidenceSegment[] = [
  { idx: 0, speaker: 1, start_ms: 1_000, text: "I'll send the pricing deck by Friday." },
  { idx: 1, speaker: 0, start_ms: 8_000, text: "Rahul, can you book the demo room?" },
  { idx: 2, speaker: 1, start_ms: 12_000, text: "Sure, I'll do it." },
  { idx: 3, speaker: 0, start_ms: 16_000, text: "Hi, I'm Rahul." },
  { idx: 4, speaker: 1, start_ms: 20_000, text: "Pricing deck मैंने कल भेज दिया था।" },
];

function draft(overrides: Partial<ExtractionDraft> = {}): ExtractionDraft {
  return {
    tldr: [],
    chapters: [],
    decisions: [],
    commitments: [],
    speaker_name_hints: [],
    ...overrides,
  };
}

describe("evidence verification", () => {
  it("drops a made-up quote and keeps a quote from the transcript", () => {
    const verified = verifyExtraction({
      extraction: draft({
        decisions: [
          {
            text: "The pricing deck is due Friday.",
            quote: "I'll send the pricing deck by Friday.",
            segment_idx: 0,
          },
          {
            text: "The backend will be rewritten tonight.",
            quote: "I promise to rewrite the entire backend tonight.",
            segment_idx: 0,
          },
        ],
      }),
      segments,
      recordedAt,
    });

    expect(verified.decisions).toEqual([
      {
        text: "The pricing deck is due Friday.",
        quote: "I'll send the pricing deck by Friday.",
        segment_idx: 0,
        start_ms: 1_000,
      },
    ]);
    expect(verified.dropped_count).toBe(1);
    expect(quoteIsSupported("I promise to rewrite the entire backend tonight.", segments, 0)).toBe(false);
  });

  it("assigns a self commitment to the speaker of the quote", () => {
    const verified = verifyExtraction({
      extraction: draft({
        commitments: [
          {
            text: "Send the pricing deck.",
            kind: "explicit",
            condition: null,
            owner_mode: "self",
            acknowledged_segment_idx: null,
            due_phrase: null,
            quote: "I'll send the pricing deck by Friday.",
            segment_idx: 0,
          },
        ],
      }),
      segments,
      recordedAt,
    });

    expect(verified.commitments[0]?.owner_speaker).toBe(1);
    expect(verified.dropped_count).toBe(0);
  });

  it("assigns an owner only when a different speaker agrees within the next 3 lines", () => {
    const withAck = resolveOwner({
      mode: "assigned",
      segmentIdx: 1,
      acknowledgedSegmentIdx: 2,
      segments,
    });
    const withoutAck = resolveOwner({
      mode: "assigned",
      segmentIdx: 1,
      acknowledgedSegmentIdx: null,
      segments,
    });
    const tooLate = resolveOwner({
      mode: "assigned",
      segmentIdx: 1,
      acknowledgedSegmentIdx: 5,
      segments,
    });
    const sameSpeaker = resolveOwner({
      mode: "assigned",
      segmentIdx: 1,
      acknowledgedSegmentIdx: 3,
      segments,
    });

    expect(withAck).toBe(1);
    expect(withoutAck).toBeNull();
    expect(tooLate).toBeNull();
    expect(sameSpeaker).toBeNull();
  });

  it("keeps Devanagari letters and matches a quote in that script", () => {
    expect(normalizeText("मैंने, कल भेज दिया था!")).toBe("मैंने कल भेज दिया था");
    expect(quoteIsSupported("मैंने कल भेज दिया था", segments, 4)).toBe(true);

    const verified = verifyExtraction({
      extraction: draft({
        decisions: [
          {
            text: "The pricing deck was sent.",
            quote: "मैंने कल भेज दिया था",
            segment_idx: 4,
          },
        ],
      }),
      segments,
      recordedAt,
    });

    expect(verified.decisions[0]?.quote).toBe("मैंने कल भेज दिया था");
    expect(verified.dropped_count).toBe(0);
  });

  it("resolves by Friday against the meeting date and drops a due phrase that was not said", () => {
    expect(
      resolveDueDate({
        duePhrase: "by Friday",
        quote: "I'll send the pricing deck by Friday.",
        recordedAt,
      }),
    ).toEqual({ due_phrase: "by Friday", due_date: "2026-10-23" });

    expect(
      resolveDueDate({
        duePhrase: "by Friday",
        quote: "I'll send the pricing deck by Friday.",
        recordedAt: new Date("2026-10-23T12:00:00Z"),
      }).due_date,
    ).toBe("2026-10-30");

    expect(
      resolveDueDate({
        duePhrase: "next week",
        quote: "I'll send the pricing deck by Friday.",
        recordedAt,
      }),
    ).toEqual({ due_phrase: null, due_date: null });
  });

  it("accepts a quote when 85 percent of its words are in the neighboring lines", () => {
    const almost = "send the pricing deck by Friday please";
    const notEnough = "send the pricing deck before Monday night";
    expect(quoteIsSupported(almost, segments, 0)).toBe(true);
    expect(quoteIsSupported(notEnough, segments, 0)).toBe(false);
  });

  it("keeps a name hint only when that speaker says the name", () => {
    const verified = verifyExtraction({
      extraction: draft({
        speaker_name_hints: [
          { speaker: 0, name: "Rahul", segment_idx: 3 },
          { speaker: 1, name: "Rahul", segment_idx: 2 },
        ],
        chapters: [
          { title: "Deck", segment_idx: 0 },
          { title: "Missing", segment_idx: 40 },
        ],
        tldr: ["Send the deck.", "   ", Array.from({ length: 26 }, (_, index) => `word${index}`).join(" ")],
      }),
      segments,
      recordedAt,
    });

    expect(verified.speaker_name_hints).toEqual([{ speaker: 0, name: "Rahul", segment_idx: 3 }]);
    expect(verified.chapters).toEqual([{ title: "Deck", segment_idx: 0, start_ms: 1_000 }]);
    expect(verified.tldr).toEqual(["Send the deck."]);
  });
});
