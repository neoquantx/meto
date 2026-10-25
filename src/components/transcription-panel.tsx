"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, CircleAlert, LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EXTRACT_TEMPORARILY_UNAVAILABLE } from "@/lib/extraction-messages";
import {
  processingStepMark,
  shouldAutoExtract,
  shouldAutoTranscribe,
  shouldPollExtraction,
  shouldPollTranscription,
  showExtractionRetry,
  showTranscriptionRetry,
  type StepId,
  type StepMark,
} from "@/lib/processing-status";

const STEPS: { id: StepId; label: string }[] = [
  { id: "uploaded", label: "Uploaded" },
  { id: "transcribing", label: "Transcribing" },
  { id: "transcribed", label: "Transcribed" },
  { id: "extracting", label: "Extracting" },
];

const MARK_LABEL: Record<StepMark, string> = {
  done: "Done",
  current: "In progress",
  upcoming: "Waiting",
  failed: "Failed",
};

type RunResult = { ok: true; status: string } | { ok: false; error: string };

const inflight = new Map<string, Promise<RunResult>>();

function readableError(error: string) {
  if (/UNAVAILABLE|high demand|temporarily unavailable|service unavailable/i.test(error)) {
    return EXTRACT_TEMPORARILY_UNAVAILABLE;
  }
  return error;
}

function runStep(meetingId: string, step: "transcribe" | "extract") {
  const key = `${meetingId}:${step}`;
  const existing = inflight.get(key);
  if (existing) return existing;

  const promise = fetch(`/api/meetings/${meetingId}/${step}`, { method: "POST" })
    .then(async (response) => {
      let body: { error?: string; status?: string } = {};
      try {
        body = (await response.json()) as { error?: string; status?: string };
      } catch {
        body = {};
      }
      if (!response.ok) {
        const fallback = step === "extract" ? "Extraction failed. Try again." : "Transcription failed. Try again.";
        return { ok: false as const, error: body.error || fallback };
      }
      const done = step === "extract" ? "ready" : "transcribed";
      return { ok: true as const, status: body.status || done };
    })
    .catch(() => {
      const fallback = step === "extract" ? "Extraction failed. Try again." : "Transcription failed. Try again.";
      return { ok: false as const, error: fallback };
    })
    .finally(() => {
      inflight.delete(key);
    });

  inflight.set(key, promise);
  return promise;
}

export function TranscriptionPanel({
  meetingId,
  status: initialStatus,
  error: initialError,
  hasAudio,
  readOnly = false,
}: {
  meetingId: string;
  status: string;
  error: string | null;
  hasAudio: boolean;
  readOnly?: boolean;
}) {
  const router = useRouter();
  const [override, setOverride] = useState<{ status: string; error: string | null } | null>(null);
  const starting = readOnly
    ? null
    : initialStatus === "uploaded"
      ? "transcribing"
      : initialStatus === "transcribed"
        ? "extracting"
        : null;
  const [busy, setBusy] = useState(starting !== null);
  const [stalled, setStalled] = useState(false);
  const status = override?.status ?? starting ?? initialStatus;
  const error = override ? override.error : initialError;

  useEffect(() => {
    if (readOnly) return;
    const step = shouldAutoTranscribe(initialStatus)
      ? "transcribe"
      : shouldAutoExtract(initialStatus)
        ? "extract"
        : null;
    if (!step) return;
    let cancelled = false;
    void runStep(meetingId, step).then((result) => {
      if (cancelled) return;
      if (!result.ok) setOverride({ status: "failed", error: result.error });
      else setOverride({ status: result.status, error: null });
      setBusy(false);
      router.refresh();
    });
    return () => {
      cancelled = true;
    };
  }, [initialStatus, meetingId, readOnly, router]);

  useEffect(() => {
    if (readOnly || override) return;
    const pollingTranscription = shouldPollTranscription(initialStatus);
    const pollingExtraction = shouldPollExtraction(initialStatus);
    if (!pollingTranscription && !pollingExtraction) return;
    const poll = window.setInterval(() => router.refresh(), 4000);
    const stall = window.setTimeout(() => setStalled(true), pollingExtraction ? 60_000 : 20_000);
    return () => {
      window.clearInterval(poll);
      window.clearTimeout(stall);
    };
  }, [initialStatus, override, readOnly, router]);

  async function retry(step: "transcribe" | "extract") {
    if (readOnly) return;
    setBusy(true);
    setStalled(false);
    setOverride({ status: step === "extract" ? "extracting" : "transcribing", error: null });
    const result = await runStep(meetingId, step);
    if (!result.ok) setOverride({ status: "failed", error: result.error });
    else setOverride({ status: result.status, error: null });
    setBusy(false);
    router.refresh();
  }

  const extractionRetry = !readOnly && showExtractionRetry({ status, error, busy, stalled });
  const transcriptionRetry = !readOnly && showTranscriptionRetry({ status, hasAudio, busy, stalled, error });

  return (
    <div className="surface p-5 sm:p-6">
      <h2 className="font-semibold">Processing your meeting</h2>
      {status === "created" ? (
        <p className="mt-2 text-sm text-muted-foreground">The upload did not finish.</p>
      ) : (
        <ol className="mt-5 grid gap-2 sm:grid-cols-4">
          {STEPS.map((step) => {
            const mark = processingStepMark(step.id, status, hasAudio, error);
            return (
              <li
                key={step.id}
                aria-current={mark === "current" ? "step" : undefined}
                className={`rounded-xl border px-3 py-3 text-sm ${
                  mark === "done"
                    ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                    : mark === "current"
                      ? "border-primary/25 bg-primary/5 text-primary"
                      : mark === "failed"
                        ? "border-destructive/20 bg-destructive/5 text-destructive"
                        : "bg-muted/35 text-muted-foreground"
                }`}
              >
                <span className="flex items-center gap-1.5 text-xs font-medium">
                  {mark === "done" ? <Check className="size-3.5" aria-hidden="true" /> : null}
                  {mark === "current" ? <LoaderCircle className="size-3.5 animate-spin" aria-hidden="true" /> : null}
                  {mark === "failed" ? <CircleAlert className="size-3.5" aria-hidden="true" /> : null}
                  {MARK_LABEL[mark]}
                </span>
                <span className="mt-1 block font-medium">{step.label}</span>
              </li>
            );
          })}
        </ol>
      )}
      {status === "transcribing" ? (
        <p className="mt-3 text-sm text-muted-foreground">
          Labeling speakers and timestamps. This page checks again every few seconds.
        </p>
      ) : null}
      {status === "extracting" ? (
        <p className="mt-3 text-sm text-muted-foreground">
          Checking each quote against the transcript. This page checks again every few seconds.
        </p>
      ) : null}
      {status === "transcribed" ? (
        <p className="mt-3 text-sm text-muted-foreground">Speaker labels and timestamps are saved.</p>
      ) : null}
      {status === "ready" ? (
        <p className="mt-3 text-sm text-muted-foreground">Decisions and commitments are saved.</p>
      ) : null}
      {status === "failed" && error ? (
        <p className="mt-3 text-sm text-destructive">{readableError(error)}</p>
      ) : null}
      {extractionRetry ? (
        <Button className="mt-4" type="button" onClick={() => void retry("extract")}>
          Retry
        </Button>
      ) : null}
      {transcriptionRetry ? (
        <Button className="mt-4" type="button" onClick={() => void retry("transcribe")}>
          Retry
        </Button>
      ) : null}
    </div>
  );
}
