import { isExtractionFailure } from "@/lib/extraction-messages";

export type StepId = "uploaded" | "transcribing" | "transcribed" | "extracting";
export type StepMark = "done" | "current" | "upcoming" | "failed";

const STATUS_RANK: Record<string, number> = {
  created: 0,
  uploaded: 1,
  transcribing: 2,
  transcribed: 3,
  extracting: 4,
  ready: 5,
};

const STEP_RANK: Record<StepId, number> = {
  uploaded: 1,
  transcribing: 2,
  transcribed: 3,
  extracting: 4,
};

export function processingStepMark(
  step: StepId,
  status: string,
  hasAudio: boolean,
  error: string | null = null,
): StepMark {
  if (status === "failed") {
    if (!hasAudio) return step === "uploaded" ? "failed" : "upcoming";
    if (isExtractionFailure(error)) return step === "extracting" ? "failed" : "done";
    if (step === "uploaded") return "done";
    if (step === "transcribing") return "failed";
    return "upcoming";
  }

  const current = STATUS_RANK[status] ?? 0;
  const rank = STEP_RANK[step];
  if (current > rank) return "done";
  if (current === rank) return status === "transcribing" || status === "extracting" ? "current" : "done";
  return "upcoming";
}

export function shouldAutoTranscribe(status: string) {
  return status === "uploaded";
}

export function shouldPollTranscription(status: string) {
  return status === "transcribing";
}

export function shouldAutoExtract(status: string) {
  return status === "transcribed";
}

export function shouldPollExtraction(status: string) {
  return status === "extracting";
}

export function showTranscriptionRetry(input: {
  status: string;
  hasAudio: boolean;
  busy: boolean;
  stalled: boolean;
  error?: string | null;
}) {
  if (input.busy || !input.hasAudio) return false;
  if (isExtractionFailure(input.error ?? null)) return false;
  if (input.status === "failed") return true;
  return input.status === "transcribing" && input.stalled;
}

export function showExtractionRetry(input: {
  status: string;
  error: string | null;
  busy: boolean;
  stalled: boolean;
}) {
  if (input.busy) return false;
  if (input.status === "failed" && isExtractionFailure(input.error)) return true;
  return input.status === "extracting" && input.stalled;
}
