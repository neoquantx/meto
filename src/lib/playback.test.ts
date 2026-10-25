import { describe, expect, it } from "vitest";
import { activeSegmentAt, formatDuration, formatTimestamp } from "./playback";

const segments = [
  { idx: 0, start_ms: 0, end_ms: 5_000 },
  { idx: 1, start_ms: 5_000, end_ms: 8_000 },
  { idx: 2, start_ms: 40_000, end_ms: 45_000 },
  { idx: 3, start_ms: 45_000, end_ms: 50_000 },
  { idx: 4, start_ms: 70_000, end_ms: 75_000 },
  { idx: 5, start_ms: 90_000, end_ms: 95_000 },
  { idx: 6, start_ms: 120_000, end_ms: 130_000 },
  { idx: 7, start_ms: 130_000, end_ms: 140_000 },
];

describe("activeSegmentAt", () => {
  it("returns null before the first word, in a gap, and after the last word", () => {
    expect(activeSegmentAt([], 0)).toBeNull();
    expect(activeSegmentAt(segments, -1)).toBeNull();
    expect(activeSegmentAt(segments, 8_000)).toBeNull();
    expect(activeSegmentAt(segments, 39_999)).toBeNull();
    expect(activeSegmentAt(segments, 140_000)).toBeNull();
  });

  it("finds a middle segment by start time, including the exact start", () => {
    expect(activeSegmentAt(segments, 0)).toBe(0);
    expect(activeSegmentAt(segments, 4_999)).toBe(0);
    expect(activeSegmentAt(segments, 5_000)).toBe(1);
    expect(activeSegmentAt(segments, 90_500)).toBe(5);
    expect(activeSegmentAt(segments, 139_999)).toBe(7);
  });

  it("keeps the earlier utterance when a later one has already ended", () => {
    const overlapping = [
      { idx: 0, start_ms: 0, end_ms: 10_000 },
      { idx: 1, start_ms: 2_000, end_ms: 3_000 },
    ];
    expect(activeSegmentAt(overlapping, 2_500)).toBe(1);
    expect(activeSegmentAt(overlapping, 5_000)).toBe(0);
  });
});

describe("formatTimestamp", () => {
  it("formats minutes and hours", () => {
    expect(formatTimestamp(0)).toBe("0:00");
    expect(formatTimestamp(12_400)).toBe("0:12");
    expect(formatTimestamp(3_661_000)).toBe("1:01:01");
    expect(formatDuration(75)).toBe("1:15");
  });
});
