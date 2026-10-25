export const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;
export const MAX_DURATION_SEC = 90 * 60;
export const DEFAULT_DAILY_CAP_MINUTES = 120;

export type SummaryLanguage = "en" | "hi" | "hinglish";
export type MeetingSource = "mic" | "tab" | "upload";

export type OffRecordRange = {
  at_ms: number;
  paused_ms: number;
};

export type CaptureCode =
  | "empty"
  | "too_large"
  | "too_long"
  | "too_short"
  | "unreadable"
  | "quota"
  | "unsupported_type";

export type CaptureIssue = {
  code: CaptureCode;
  error: string;
};

const EXTENSIONS: Record<string, string> = {
  "audio/webm": "webm",
  "video/webm": "webm",
  "audio/mp4": "mp4",
  "video/mp4": "mp4",
  "audio/mpeg": "mp3",
  "audio/mp3": "mp3",
  "audio/wav": "wav",
  "audio/x-wav": "wav",
  "audio/wave": "wav",
  "audio/ogg": "ogg",
  "video/ogg": "ogg",
  "audio/m4a": "m4a",
  "audio/x-m4a": "m4a",
  "audio/aac": "aac",
  "video/quicktime": "mov",
};

export function baseMime(mime: string) {
  return mime.split(";")[0]?.trim().toLowerCase() ?? "";
}

export function extensionForMime(mime: string) {
  return EXTENSIONS[baseMime(mime)] ?? "bin";
}

export function isSupportedMime(mime: string) {
  const base = baseMime(mime);
  if (!base.startsWith("audio/") && !base.startsWith("video/")) return false;
  return extensionForMime(mime) !== "bin";
}

export function audioObjectPath(ownerId: string, meetingId: string, mime: string) {
  return `${ownerId}/${meetingId}.${extensionForMime(mime)}`;
}

export function checkSize(sizeBytes: number): CaptureIssue | null {
  if (!Number.isFinite(sizeBytes) || sizeBytes <= 0) {
    return { code: "empty", error: "This file is empty." };
  }
  if (sizeBytes > MAX_UPLOAD_BYTES) {
    return {
      code: "too_large",
      error: "This file is over 50 MB. The limit is 50 MB.",
    };
  }
  return null;
}

export function checkDuration(durationSec: number): CaptureIssue | null {
  if (!Number.isFinite(durationSec) || durationSec <= 0) {
    return {
      code: "unreadable",
      error: "Could not read the length of this file.",
    };
  }
  if (durationSec < 1) {
    return { code: "too_short", error: "Record at least one second of audio." };
  }
  if (durationSec > MAX_DURATION_SEC) {
    return {
      code: "too_long",
      error: "This recording is longer than 90 minutes.",
    };
  }
  return null;
}

export function checkFileLimits(sizeBytes: number, durationSec: number) {
  return checkSize(sizeBytes) ?? checkDuration(durationSec);
}

export function checkDailyCap(input: {
  durationSec: number;
  usedMinutes: number;
  pendingMinutes: number;
  capMinutes: number;
}): CaptureIssue | null {
  const incoming = input.durationSec / 60;
  const used = input.usedMinutes + input.pendingMinutes;
  if (used + incoming <= input.capMinutes + 1e-6) return null;

  const left = Math.max(0, input.capMinutes - used);
  if (left <= 0) {
    return {
      code: "quota",
      error: "Daily audio limit reached. Try again tomorrow.",
    };
  }
  if (left < 1) {
    return {
      code: "quota",
      error: "Daily audio limit reached. Less than a minute left today.",
    };
  }
  const rounded = Math.floor(left);
  const unit = rounded === 1 ? "minute" : "minutes";
  return {
    code: "quota",
    error: `Daily audio limit reached. About ${rounded} ${unit} left today.`,
  };
}

export function shouldDiscardLocal(code: string | undefined) {
  return code === "empty" || code === "too_large" || code === "too_long" || code === "too_short";
}

export function dailyCapMinutes(raw: string | undefined) {
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) return DEFAULT_DAILY_CAP_MINUTES;
  return value;
}

export function asMinutes(value: unknown) {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return parsed;
}

export function pendingMinutes(rows: { duration_sec: number | null }[]) {
  const seconds = rows.reduce((total, row) => {
    const value = row.duration_sec ?? 0;
    return total + (Number.isFinite(value) && value > 0 ? value : 0);
  }, 0);
  return seconds / 60;
}

export function utcDay(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

export function storedByteSize(info: {
  size?: number | null;
  metadata?: { size?: number | null; contentLength?: number | null } | null;
}) {
  const values = [info.size, info.metadata?.size, info.metadata?.contentLength];
  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value) && value >= 0) return value;
  }
  return null;
}

export function parseOffRecordRanges(value: unknown): OffRecordRange[] {
  if (!Array.isArray(value)) return [];
  const ranges: OffRecordRange[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const at = "at_ms" in item ? item.at_ms : undefined;
    const paused = "paused_ms" in item ? item.paused_ms : undefined;
    if (typeof at !== "number" || typeof paused !== "number") continue;
    if (!Number.isInteger(at) || at < 0) continue;
    if (!Number.isInteger(paused) || paused <= 0) continue;
    ranges.push({ at_ms: at, paused_ms: paused });
  }
  return ranges;
}

export function isChromeDesktop(userAgent: string) {
  if (/Android|iPhone|iPad|iPod|Mobile/i.test(userAgent)) return false;
  if (!/Chrome\/\d+/.test(userAgent)) return false;
  if (/SamsungBrowser|Firefox\//.test(userAgent)) return false;
  return true;
}

export function canOfferTabCapture(userAgent: string, hasDisplayMedia: boolean) {
  return hasDisplayMedia && isChromeDesktop(userAgent);
}

export function mimeFromFileName(name: string) {
  const ext = name.split(".").pop()?.toLowerCase();
  const map: Record<string, string> = {
    mp3: "audio/mpeg",
    wav: "audio/wav",
    webm: "audio/webm",
    m4a: "audio/mp4",
    mp4: "video/mp4",
    mov: "video/quicktime",
    ogg: "audio/ogg",
    aac: "audio/aac",
  };
  return ext ? (map[ext] ?? "") : "";
}
