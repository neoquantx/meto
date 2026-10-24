import { describe, expect, it } from "vitest";
import {
  SILENCE_MARKER,
  buildTranscriptMarkers,
  findTranscriptGaps,
  offRecordMarker,
} from "./transcript-gaps";

describe("transcript gaps", () => {
  it("flags a gap longer than 30 seconds and ignores a 30 second gap", () => {
    expect(
      findTranscriptGaps([
        { idx: 0, start_ms: 0, end_ms: 10_000 },
        { idx: 1, start_ms: 40_001, end_ms: 50_000 },
      ]),
    ).toEqual([
      {
        after_idx: 0,
        before_idx: 1,
        start_ms: 10_000,
        end_ms: 40_001,
        gap_ms: 30_001,
      },
    ]);

    expect(
      findTranscriptGaps([
        { idx: 0, start_ms: 0, end_ms: 1_000 },
        { idx: 1, start_ms: 31_000, end_ms: 32_000 },
      ]),
    ).toEqual([]);
  });

  it("uses segment order when the array is shuffled", () => {
    expect(
      findTranscriptGaps([
        { idx: 2, start_ms: 80_000, end_ms: 90_000 },
        { idx: 0, start_ms: 0, end_ms: 5_000 },
        { idx: 1, start_ms: 10_000, end_ms: 12_000 },
      ]),
    ).toEqual([
      {
        after_idx: 1,
        before_idx: 2,
        start_ms: 12_000,
        end_ms: 80_000,
        gap_ms: 68_000,
      },
    ]);
  });

  it("ignores overlapping speech", () => {
    expect(
      findTranscriptGaps([
        { idx: 0, start_ms: 0, end_ms: 10_000 },
        { idx: 1, start_ms: 8_000, end_ms: 12_000 },
      ]),
    ).toEqual([]);
  });

  it("places silence and off-the-record markers on the timeline", () => {
    expect(offRecordMarker(45_000)).toBe("Off the record (paused 1 min)");
    expect(offRecordMarker(90_000)).toBe("Off the record (paused 2 min)");
    expect(offRecordMarker(60_000)).toBe("Off the record (paused 1 min)");

    expect(
      buildTranscriptMarkers(
        [
          { idx: 0, start_ms: 0, end_ms: 5_000 },
          { idx: 1, start_ms: 40_000, end_ms: 45_000 },
        ],
        [{ at_ms: 5_000, paused_ms: 120_000 }],
      ),
    ).toEqual([
      { kind: "segment", idx: 0, start_ms: 0 },
      {
        kind: "off_record",
        at_ms: 5_000,
        paused_ms: 120_000,
        label: "Off the record (paused 2 min)",
      },
      {
        kind: "gap",
        after_idx: 0,
        start_ms: 5_000,
        end_ms: 40_000,
        label: SILENCE_MARKER,
      },
      { kind: "segment", idx: 1, start_ms: 40_000 },
    ]);
  });

  it("keeps an off-the-record pause when there is no speech", () => {
    expect(buildTranscriptMarkers([], [{ at_ms: 0, paused_ms: 60_000 }])).toEqual([
      {
        kind: "off_record",
        at_ms: 0,
        paused_ms: 60_000,
        label: "Off the record (paused 1 min)",
      },
    ]);
  });
});
