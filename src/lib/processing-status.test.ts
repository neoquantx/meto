import { describe, expect, it } from "vitest";
import {
  processingStepMark,
  shouldAutoTranscribe,
  shouldPollTranscription,
  showTranscriptionRetry,
} from "./processing-status";

describe("processing status", () => {
  it("starts transcription only after a finished upload", () => {
    expect(shouldAutoTranscribe("uploaded")).toBe(true);
    expect(shouldAutoTranscribe("transcribing")).toBe(false);
    expect(shouldAutoTranscribe("failed")).toBe(false);
    expect(shouldPollTranscription("transcribing")).toBe(true);
    expect(shouldPollTranscription("uploaded")).toBe(false);
  });

  it("marks the transcribe step failed when the audio is still stored", () => {
    expect(processingStepMark("uploaded", "transcribing", true)).toBe("done");
    expect(processingStepMark("transcribing", "transcribing", true)).toBe("current");
    expect(processingStepMark("transcribed", "transcribing", true)).toBe("upcoming");
    expect(processingStepMark("transcribed", "ready", true)).toBe("done");
    expect(processingStepMark("uploaded", "failed", true)).toBe("done");
    expect(processingStepMark("transcribing", "failed", true)).toBe("failed");
    expect(processingStepMark("uploaded", "failed", false)).toBe("failed");
    expect(processingStepMark("transcribing", "failed", false)).toBe("upcoming");
  });

  it("offers retry after a failed transcription, and for a job that stays in progress", () => {
    expect(
      showTranscriptionRetry({ status: "failed", hasAudio: true, busy: false, stalled: false }),
    ).toBe(true);
    expect(
      showTranscriptionRetry({
        status: "transcribing",
        hasAudio: true,
        busy: false,
        stalled: false,
      }),
    ).toBe(false);
    expect(
      showTranscriptionRetry({ status: "transcribing", hasAudio: true, busy: false, stalled: true }),
    ).toBe(true);
    expect(
      showTranscriptionRetry({ status: "failed", hasAudio: false, busy: false, stalled: true }),
    ).toBe(false);
    expect(
      showTranscriptionRetry({ status: "transcribed", hasAudio: true, busy: false, stalled: true }),
    ).toBe(false);
  });
});
