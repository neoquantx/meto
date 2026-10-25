import { describe, expect, it } from "vitest";
import { EXTRACT_UNUSABLE } from "./extraction-messages";
import { ExtractError, buildTranscript, parseExtraction, transcriptStamp } from "./extract";

describe("extraction parsing", () => {
  it("formats transcript lines and accepts an empty extraction", () => {
    expect(transcriptStamp(65_000)).toBe("01:05");
    expect(
      buildTranscript(
        [{ idx: 0, speaker: 1, start_ms: 65_000, text: "I'll send the deck." }],
        "en",
      ),
    ).toContain("[S0] [Speaker 1] [01:05] I'll send the deck.");

    expect(
      parseExtraction(
        JSON.stringify({
          tldr: [],
          chapters: [],
          decisions: [],
          commitments: [
            {
              text: "Send the deck.",
              kind: "explicit",
              condition: "",
              owner_mode: "self",
              due_phrase: "",
              quote: "I'll send the deck.",
              segment_idx: 0,
            },
          ],
          speaker_name_hints: [],
        }),
      ).commitments[0],
    ).toMatchObject({ condition: null, due_phrase: null, acknowledged_segment_idx: null });
  });

  it("rejects a response that is not the extraction schema", () => {
    expect(() => parseExtraction("not json")).toThrow(ExtractError);
    expect(() => parseExtraction('{"tldr":[]}')).toThrow(EXTRACT_UNUSABLE);
  });
});
