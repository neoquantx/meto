"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  processingStepMark,
  shouldAutoTranscribe,
  shouldPollTranscription,
  showTranscriptionRetry,
  type StepId,
  type StepMark,
} from "@/lib/processing-status";

const STEPS: { id: StepId; label: string }[] = [
  { id: "uploaded", label: "Uploaded" },
  { id: "transcribing", label: "Transcribing" },
  { id: "transcribed", label: "Transcribed" },
];

const MARK_LABEL: Record<StepMark, string> = {
  done: "Done",
  current: "In progress",
  upcoming: "Waiting",
  failed: "Failed",
};

type RunResult = { ok: true; status: string } | { ok: false; error: string };

const inflight = new Map<string, Promise<RunResult>>();

function runTranscribe(meetingId: string) {
  const existing = inflight.get(meetingId);
  if (existing) return existing;

  const promise = fetch(`/api/meetings/${meetingId}/transcribe`, { method: "POST" })
    .then(async (response) => {
      let body: { error?: string; status?: string } = {};
      try {
        body = (await response.json()) as { error?: string; status?: string };
      } catch {
        body = {};
      }
      if (!response.ok) {
        return { ok: false as const, error: body.error || "Transcription failed. Try again." };
      }
      return { ok: true as const, status: body.status || "transcribed" };
    })
    .catch(() => ({ ok: false as const, error: "Transcription failed. Try again." }))
    .finally(() => {
      inflight.delete(meetingId);
    });

  inflight.set(meetingId, promise);
  return promise;
}

export function TranscriptionPanel({
  meetingId,
  status: initialStatus,
  error: initialError,
  hasAudio,
}: {
  meetingId: string;
  status: string;
  error: string | null;
  hasAudio: boolean;
}) {
  const router = useRouter();
  const [override, setOverride] = useState<{ status: string; error: string | null } | null>(null);
  const [busy, setBusy] = useState(initialStatus === "uploaded");
  const [stalled, setStalled] = useState(false);
  const status = override?.status ?? (initialStatus === "uploaded" ? "transcribing" : initialStatus);
  const error = override ? override.error : initialError;

  useEffect(() => {
    if (!shouldAutoTranscribe(initialStatus)) return;
    let cancelled = false;
    void runTranscribe(meetingId).then((result) => {
      if (cancelled) return;
      if (!result.ok) setOverride({ status: "failed", error: result.error });
      else setOverride({ status: result.status, error: null });
      setBusy(false);
      router.refresh();
    });
    return () => {
      cancelled = true;
    };
  }, [initialStatus, meetingId, router]);

  useEffect(() => {
    if (!shouldPollTranscription(initialStatus) || override) return;
    const poll = window.setInterval(() => router.refresh(), 4000);
    const stall = window.setTimeout(() => setStalled(true), 20_000);
    return () => {
      window.clearInterval(poll);
      window.clearTimeout(stall);
    };
  }, [initialStatus, override, router]);

  async function retry() {
    setBusy(true);
    setOverride({ status: "transcribing", error: null });
    const result = await runTranscribe(meetingId);
    if (!result.ok) setOverride({ status: "failed", error: result.error });
    else setOverride({ status: result.status, error: null });
    setBusy(false);
    router.refresh();
  }

  const showRetry = showTranscriptionRetry({ status, hasAudio, busy, stalled });

  return (
    <div>
      <h2 className="text-lg font-medium">Processing</h2>
      {status === "created" ? (
        <p className="mt-2 text-sm text-muted-foreground">The upload did not finish.</p>
      ) : (
        <ol className="mt-3 space-y-1 text-sm">
          {STEPS.map((step) => {
            const mark = processingStepMark(step.id, status, hasAudio);
            return (
              <li
                key={step.id}
                aria-current={mark === "current" ? "step" : undefined}
                className={mark === "upcoming" ? "text-muted-foreground" : undefined}
              >
                <span className={mark === "failed" ? "text-destructive" : undefined}>
                  {MARK_LABEL[mark]}
                </span>
                {" · "}
                {step.label}
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
      {status === "transcribed" || status === "extracting" || status === "ready" ? (
        <p className="mt-3 text-sm text-muted-foreground">Speaker labels and timestamps are saved.</p>
      ) : null}
      {status === "failed" && error ? <p className="mt-3 text-sm text-destructive">{error}</p> : null}
      {showRetry ? (
        <Button className="mt-4" type="button" onClick={() => void retry()}>
          Retry
        </Button>
      ) : null}
    </div>
  );
}
