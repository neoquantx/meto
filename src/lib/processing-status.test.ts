import { describe, expect, it } from "vitest";
import { QUOTA_MESSAGE } from "./extraction-messages";
import {
  processingStepMark,
  shouldAutoExtract,
  shouldAutoTranscribe,
  shouldPollExtraction,
  shouldPollTranscription,
  showExtractionRetry,
  showTranscriptionRetry,
} from "./processing-status";

describe("processing status", () => {
  it("starts transcription only after a finished upload", () => {
    expect(shouldAutoTranscribe("uploaded")).toBe(true);
    expect(shouldAutoTranscribe("transcribing")).toBe(false);
    expect(shouldAutoTranscribe("failed")).toBe(false);
    expect(shouldPollTranscription("transcribing")).toBe(true);
    expect(shouldPollTranscription("uploaded")).toBe(false);
    expect(shouldAutoExtract("transcribed")).toBe(true);
    expect(shouldAutoExtract("ready")).toBe(false);
    expect(shouldPollExtraction("extracting")).toBe(true);
    expect(shouldPollExtraction("transcribed")).toBe(false);
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

  it("marks an extraction failure on the extract step and retries that step", () => {
    expect(processingStepMark("transcribed", "extracting", true)).toBe("done");
    expect(processingStepMark("extracting", "extracting", true)).toBe("current");
    expect(processingStepMark("extracting", "ready", true)).toBe("done");
    expect(processingStepMark("extracting", "failed", true, QUOTA_MESSAGE)).toBe("failed");
    expect(processingStepMark("transcribing", "failed", true, QUOTA_MESSAGE)).toBe("done");
    expect(
      showExtractionRetry({ status: "failed", error: QUOTA_MESSAGE, busy: false, stalled: false }),
    ).toBe(true);
    expect(
      showTranscriptionRetry({
        status: "failed",
        hasAudio: true,
        busy: false,
        stalled: false,
        error: QUOTA_MESSAGE,
      }),
    ).toBe(false);
    expect(
      showExtractionRetry({
        status: "failed",
        error: "Transcription is not configured.",
        busy: false,
        stalled: false,
      }),
    ).toBe(false);
  });
});
