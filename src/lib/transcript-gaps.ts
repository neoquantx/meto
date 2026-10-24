import type { OffRecordRange } from "@/lib/capture-limits";

export const SILENCE_GAP_MS = 30_000;
export const SILENCE_MARKER = "Silence or untranscribed — listen";

export type GapSegment = {
  idx: number;
  start_ms: number;
  end_ms: number;
};

export type TranscriptGap = {
  after_idx: number;
  before_idx: number;
  start_ms: number;
  end_ms: number;
  gap_ms: number;
};

export type TranscriptMarker =
  | { kind: "segment"; idx: number; start_ms: number }
  | { kind: "gap"; after_idx: number; start_ms: number; end_ms: number; label: string }
  | { kind: "off_record"; at_ms: number; paused_ms: number; label: string };

export function offRecordMarker(pausedMs: number) {
  const minutes = Math.max(1, Math.round(pausedMs / 60_000));
  return `Off the record (paused ${minutes} min)`;
}

export function findTranscriptGaps(segments: GapSegment[]): TranscriptGap[] {
  const ordered = [...segments].sort((a, b) => a.idx - b.idx);
  const gaps: TranscriptGap[] = [];
  for (let i = 0; i < ordered.length - 1; i++) {
    const current = ordered[i];
    const next = ordered[i + 1];
    if (!current || !next) continue;
    const gapMs = next.start_ms - current.end_ms;
    if (gapMs > SILENCE_GAP_MS) {
      gaps.push({
        after_idx: current.idx,
        before_idx: next.idx,
        start_ms: current.end_ms,
        end_ms: next.start_ms,
        gap_ms: gapMs,
      });
    }
  }
  return gaps;
}

export function buildTranscriptMarkers(
  segments: GapSegment[],
  offRecord: OffRecordRange[] = [],
): TranscriptMarker[] {
  const ordered = [...segments].sort((a, b) => a.idx - b.idx);
  const timed: { at: number; order: number; marker: TranscriptMarker }[] = [];

  for (const segment of ordered) {
    timed.push({
      at: segment.start_ms,
      order: 2,
      marker: { kind: "segment", idx: segment.idx, start_ms: segment.start_ms },
    });
  }

  for (const gap of findTranscriptGaps(ordered)) {
    timed.push({
      at: gap.start_ms,
      order: 1,
      marker: {
        kind: "gap",
        after_idx: gap.after_idx,
        start_ms: gap.start_ms,
        end_ms: gap.end_ms,
        label: SILENCE_MARKER,
      },
    });
  }

  for (const pause of offRecord) {
    if (!Number.isFinite(pause.at_ms) || pause.at_ms < 0) continue;
    if (!Number.isFinite(pause.paused_ms) || pause.paused_ms <= 0) continue;
    timed.push({
      at: pause.at_ms,
      order: 0,
      marker: {
        kind: "off_record",
        at_ms: pause.at_ms,
        paused_ms: pause.paused_ms,
        label: offRecordMarker(pause.paused_ms),
      },
    });
  }

  timed.sort((a, b) => a.at - b.at || a.order - b.order);
  return timed.map((item) => item.marker);
}
