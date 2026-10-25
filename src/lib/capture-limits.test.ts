import { describe, expect, it } from "vitest";
import {
  MAX_DURATION_SEC,
  MAX_UPLOAD_BYTES,
  asMinutes,
  audioObjectPath,
  canOfferTabCapture,
  checkDailyCap,
  checkFileLimits,
  extensionForMime,
  isChromeDesktop,
  mimeFromFileName,
  parseOffRecordRanges,
  pendingMinutes,
  shouldDiscardLocal,
  storedByteSize,
} from "./capture-limits";

const CHROME =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";
const EDGE = `${CHROME} Edg/130.0.0.0`;
const ANDROID =
  "Mozilla/5.0 (Linux; Android 14; Pixel) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36";

describe("capture limits", () => {
  it("rejects an empty file, a file over 50 MB, and a recording over 90 minutes", () => {
    expect(checkFileLimits(0, 60)?.error).toBe("This file is empty.");
    expect(checkFileLimits(MAX_UPLOAD_BYTES + 1, 60)).toMatchObject({
      code: "too_large",
      error: "This file is over 50 MB. The limit is 50 MB.",
    });
    expect(checkFileLimits(MAX_UPLOAD_BYTES, 60)).toBeNull();
    expect(checkFileLimits(1000, MAX_DURATION_SEC + 1)?.error).toBe(
      "This recording is longer than 90 minutes.",
    );
    expect(checkFileLimits(1000, MAX_DURATION_SEC)).toBeNull();
  });

  it("says 50 MB even when the length is also unusable", () => {
    expect(checkFileLimits(MAX_UPLOAD_BYTES + 1, Number.NaN)?.code).toBe("too_large");
  });

  it("counts processed and still-uploading minutes against the daily cap", () => {
    expect(
      checkDailyCap({
        durationSec: 60,
        usedMinutes: 119,
        pendingMinutes: 0,
        capMinutes: 120,
      }),
    ).toBeNull();
    expect(
      checkDailyCap({
        durationSec: 61,
        usedMinutes: 119,
        pendingMinutes: 0,
        capMinutes: 120,
      })?.error,
    ).toBe("Daily audio limit reached. About 1 minute left today.");
    expect(
      checkDailyCap({
        durationSec: 30,
        usedMinutes: 10,
        pendingMinutes: pendingMinutes([{ duration_sec: 600 }, { duration_sec: null }]),
        capMinutes: 20,
      })?.code,
    ).toBe("quota");
    expect(
      checkDailyCap({
        durationSec: 60,
        usedMinutes: 120,
        pendingMinutes: 0,
        capMinutes: 120,
      })?.error,
    ).toBe("Daily audio limit reached. Try again tomorrow.");
  });

  it("reads usage numbers that arrive as strings", () => {
    expect(asMinutes("12.5")).toBe(12.5);
    expect(asMinutes(null)).toBe(0);
  });

  it("keeps a local recording when the only problem is the daily cap", () => {
    expect(shouldDiscardLocal("quota")).toBe(false);
    expect(shouldDiscardLocal("unreadable")).toBe(false);
    expect(shouldDiscardLocal("too_large")).toBe(true);
  });
});

describe("audio paths and browsers", () => {
  it("maps recorder and upload types onto the storage path", () => {
    expect(extensionForMime("audio/webm;codecs=opus")).toBe("webm");
    expect(extensionForMime("audio/mp4")).toBe("mp4");
    expect(audioObjectPath("owner", "meeting", "audio/mpeg")).toBe("owner/meeting.mp3");
    expect(mimeFromFileName("notes.m4a")).toBe("audio/mp4");
  });

  it("offers tab capture on desktop Chromium browsers only", () => {
    expect(isChromeDesktop(CHROME)).toBe(true);
    expect(isChromeDesktop(EDGE)).toBe(true);
    expect(isChromeDesktop(ANDROID)).toBe(false);
    expect(canOfferTabCapture(CHROME, true)).toBe(true);
    expect(canOfferTabCapture(CHROME, false)).toBe(false);
  });
});

describe("stored upload metadata", () => {
  it("reads the file size from the storage info payload", () => {
    expect(storedByteSize({ size: 12 })).toBe(12);
    expect(storedByteSize({ metadata: { size: 40, contentLength: 40 } })).toBe(40);
    expect(storedByteSize({})).toBeNull();
  });

  it("keeps only real off-the-record ranges", () => {
    expect(
      parseOffRecordRanges([
        { at_ms: 1000, paused_ms: 5000 },
        { at_ms: -1, paused_ms: 5 },
        { at_ms: 1.5, paused_ms: 5 },
        null,
      ]),
    ).toEqual([{ at_ms: 1000, paused_ms: 5000 }]);
  });
});
