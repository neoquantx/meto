export type TimedSegment = {
  idx: number;
  start_ms: number;
  end_ms: number;
};

/** Segments must be sorted by start_ms, then idx. The latest start that still covers the playhead wins. */
export function activeSegmentAt(segments: TimedSegment[], timeMs: number): number | null {
  if (!Number.isFinite(timeMs) || segments.length === 0) return null;

  let low = 0;
  let high = segments.length - 1;
  let rightmost = -1;
  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const start = segments[mid]?.start_ms;
    if (start == null) return null;
    if (start <= timeMs) {
      rightmost = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }

  for (let index = rightmost; index >= 0; index -= 1) {
    const segment = segments[index];
    if (!segment || segment.start_ms > timeMs) break;
    if (timeMs < segment.end_ms) return segment.idx;
  }
  return null;
}

export function formatTimestamp(ms: number) {
  if (!Number.isFinite(ms)) return "0:00";
  const total = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const clock = `${minutes}:${String(seconds).padStart(2, "0")}`;
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }
  return clock;
}

export function formatDuration(seconds: number) {
  if (!Number.isFinite(seconds)) return "0:00";
  return formatTimestamp(Math.round(seconds) * 1000);
}
