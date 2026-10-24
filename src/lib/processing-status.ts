export type StepId = "uploaded" | "transcribing" | "transcribed";
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
};

export function processingStepMark(step: StepId, status: string, hasAudio: boolean): StepMark {
  if (status === "failed") {
    if (!hasAudio) return step === "uploaded" ? "failed" : "upcoming";
    if (step === "uploaded") return "done";
    if (step === "transcribing") return "failed";
    return "upcoming";
  }

  const current = STATUS_RANK[status] ?? 0;
  const rank = STEP_RANK[step];
  if (current > rank) return "done";
  if (current === rank) return status === "transcribing" ? "current" : "done";
  return "upcoming";
}

export function shouldAutoTranscribe(status: string) {
  return status === "uploaded";
}

export function shouldPollTranscription(status: string) {
  return status === "transcribing";
}

export function showTranscriptionRetry(input: {
  status: string;
  hasAudio: boolean;
  busy: boolean;
  stalled: boolean;
}) {
  if (input.busy || !input.hasAudio) return false;
  if (input.status === "failed") return true;
  return input.status === "transcribing" && input.stalled;
}
