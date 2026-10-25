"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Check,
  FileUp,
  Mic2,
  MonitorUp,
  Pause,
  ShieldCheck,
  Square,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useMeetingRecorder, type CaptureDetails } from "@/components/use-meeting-recorder";
import {
  canOfferTabCapture,
  checkSize,
  isSupportedMime,
  mimeFromFileName,
  type SummaryLanguage,
} from "@/lib/capture-limits";
import { readMediaDuration } from "@/lib/media-duration";
import { getLiveSession, loadSession, subscribeLive } from "@/lib/recording-store";
import { uploadMeetingBlob } from "@/lib/upload-meeting";

const fieldClass =
  "field mt-1.5";

function subscribeMedia() {
  return () => undefined;
}

function chromeTabSnapshot() {
  const brave = "brave" in navigator;
  return (
    !brave &&
    canOfferTabCapture(
      navigator.userAgent,
      typeof navigator.mediaDevices?.getDisplayMedia === "function",
    )
  );
}

function mobileSnapshot() {
  return (
    window.matchMedia("(pointer: coarse)").matches ||
    /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent)
  );
}

function toDatetimeLocal(date: Date) {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function formatClock(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export function NewMeetingForm({
  defaultLanguage = "en",
}: {
  defaultLanguage?: SummaryLanguage;
}) {
  const router = useRouter();
  const recorder = useMeetingRecorder();
  const fileRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<"consent" | "details">("consent");
  const [consented, setConsented] = useState(false);
  const [consentNote, setConsentNote] = useState("");
  const [title, setTitle] = useState("");
  const [summaryLanguage, setSummaryLanguage] = useState<SummaryLanguage>(defaultLanguage);
  const [when, setWhen] = useState("");
  const [whenTouched, setWhenTouched] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
  const [fileBusy, setFileBusy] = useState(false);
  const [blocked, setBlocked] = useState(false);

  const supportsTab = useSyncExternalStore(subscribeMedia, chromeTabSnapshot, () => false);
  const mobile = useSyncExternalStore(subscribeMedia, mobileSnapshot, () => false);

  useEffect(() => {
    let cancelled = false;
    async function refresh() {
      try {
        const existing = await loadSession();
        if (cancelled) return;
        setBlocked(Boolean(existing && existing.seq > 0 && existing.sessionId !== getLiveSession()));
      } catch {
        if (!cancelled) setBlocked(false);
      }
    }
    const unsubscribe = subscribeLive(() => {
      void refresh();
    });
    void refresh();
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [recorder.phase]);

  function snapshot(): CaptureDetails | null {
    const raw = whenTouched ? when : toDatetimeLocal(new Date());
    if (!whenTouched) setWhen(raw);
    const date = new Date(raw);
    if (Number.isNaN(date.getTime())) return null;
    return {
      title: title.trim() || "Untitled meeting",
      summaryLanguage,
      recordedAt: date.toISOString(),
      consentNote: consentNote.trim() || null,
    };
  }

  function onMic() {
    setFileError(null);
    const details = snapshot();
    if (!details) {
      setFileError("Enter a valid meeting date.");
      return;
    }
    void recorder.startMic(details);
  }

  function onTab() {
    setFileError(null);
    const details = snapshot();
    if (!details) {
      setFileError("Enter a valid meeting date.");
      return;
    }
    void recorder.startTab(details);
  }

  async function onFile(file: File) {
    setFileError(null);
    recorder.clearError();
    const existing = await loadSession();
    if (existing && existing.seq > 0 && existing.sessionId !== getLiveSession()) {
      setBlocked(true);
      setFileError("Finish or discard the unfinished recording above before starting another.");
      return;
    }
    const details = snapshot();
    if (!details) {
      setFileError("Enter a valid meeting date.");
      return;
    }

    const mime = isSupportedMime(file.type) ? file.type : mimeFromFileName(file.name);
    if (!isSupportedMime(mime)) {
      setFileError("This file type is not supported. Use an audio or video file.");
      return;
    }

    const sizeIssue = checkSize(file.size);
    if (sizeIssue) {
      setFileError(sizeIssue.error);
      return;
    }

    setFileBusy(true);
    try {
      const durationSec = await readMediaDuration(file);
      const meetingId = await uploadMeetingBlob({
        blob: file,
        mimeType: mime,
        title: details.title,
        source: "upload",
        summaryLanguage: details.summaryLanguage,
        recordedAt: details.recordedAt,
        consentNote: details.consentNote,
        offRecordRanges: [],
        durationSec,
      });
      router.push(`/meetings/${meetingId}`);
      router.refresh();
    } catch (reason) {
      setFileError(reason instanceof Error ? reason.message : "Could not upload the file.");
      setFileBusy(false);
    }
  }

  const message = fileError ?? recorder.error;
  const recording = recorder.phase === "recording" || recorder.phase === "paused";

  return (
    <div className="space-y-6">
      {step === "consent" ? (
        <div className="surface overflow-hidden">
          <div className="border-b border-border/70 bg-gradient-to-r from-primary/8 to-cyan-500/5 p-5 sm:p-6">
            <span className="grid size-11 place-items-center rounded-2xl bg-primary text-primary-foreground shadow-md shadow-primary/20">
              <ShieldCheck className="size-5" aria-hidden="true" />
            </span>
            <p className="mt-5 text-xs font-semibold tracking-[0.14em] text-primary uppercase">Step 1 of 2</p>
            <h2 className="mt-1 text-xl font-semibold tracking-[-0.02em]">Confirm consent</h2>
            <p className="mt-2 max-w-lg text-sm leading-6 text-muted-foreground">
              Recording stays off until everyone in the meeting has agreed.
            </p>
          </div>
          <div className="space-y-5 p-5 sm:p-6">
          <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-border/80 bg-muted/35 p-4 text-sm leading-6 transition-colors hover:border-primary/25">
            <input
              type="checkbox"
              className="mt-1 size-4 accent-primary"
              checked={consented}
              onChange={(event) => setConsented(event.target.checked)}
            />
            <span>Everyone in this meeting knows it is being recorded and agreed to it.</span>
          </label>
          <label className="block text-sm font-medium">
            Line to read aloud (optional)
            <textarea
              className={fieldClass}
              maxLength={1000}
              rows={3}
              value={consentNote}
              placeholder="This meeting is being recorded."
              onChange={(event) => setConsentNote(event.target.value)}
            />
          </label>
          <Button
            type="button"
            size="lg"
            disabled={!consented}
            onClick={() => {
              if (!when) setWhen(toDatetimeLocal(new Date()));
              setStep("details");
            }}
          >
            <Check className="size-4" aria-hidden="true" />
            Continue
          </Button>
          </div>
        </div>
      ) : null}

      {step === "details" ? (
        <div className="surface p-5 sm:p-6">
          <button
            type="button"
            className="mb-6 inline-flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground"
            onClick={() => setStep("consent")}
          >
            <ArrowLeft className="size-4" aria-hidden="true" />
            Back to consent
          </button>
          <div className="mb-6">
            <p className="text-xs font-semibold tracking-[0.14em] text-primary uppercase">Step 2 of 2</p>
            <h2 className="mt-1 text-xl font-semibold tracking-[-0.02em]">Set up your meeting</h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Choose how to capture audio. Processing starts automatically after upload.
            </p>
          </div>
          <div className="space-y-5">
          <label className="block text-sm font-medium">
            Title
            <input
              className={fieldClass}
              maxLength={200}
              value={title}
              placeholder="Untitled meeting"
              onChange={(event) => setTitle(event.target.value)}
            />
          </label>
          <label className="block text-sm font-medium">
            Summary language
            <select
              className={fieldClass}
              value={summaryLanguage}
              onChange={(event) => setSummaryLanguage(event.target.value as SummaryLanguage)}
            >
              <option value="en">English</option>
              <option value="hi">Hindi</option>
              <option value="hinglish">Hinglish</option>
            </select>
            <span className="mt-1 block font-normal text-muted-foreground">
              Summaries are written in this language. The recording itself can mix Hindi and English.
            </span>
          </label>
          <label className="block text-sm font-medium">
            Meeting date and time
            <input
              type="datetime-local"
              className={fieldClass}
              value={when}
              onChange={(event) => {
                setWhen(event.target.value);
                setWhenTouched(true);
              }}
            />
            <span className="mt-1 block font-normal text-muted-foreground">
              Leave this as now, or set when the meeting actually happened. The ledger uses this order.
            </span>
          </label>

          {recording || recorder.phase === "uploading" ? (
            <div className="space-y-4 rounded-2xl border border-primary/20 bg-primary/5 p-4 sm:p-5">
              <div className="flex items-baseline justify-between gap-4">
                <p className="font-mono text-4xl font-semibold tracking-[-0.04em] tabular-nums">{formatClock(recorder.elapsedMs)}</p>
                <p className="text-sm text-muted-foreground">
                  {recorder.phase === "paused"
                    ? "Off the record"
                    : recorder.phase === "uploading"
                      ? "Uploading…"
                      : "Recording"}
                </p>
              </div>
              <div
                role="meter"
                aria-label="Microphone level"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={recorder.level}
                className="h-2 overflow-hidden rounded-full bg-muted"
              >
                <div className="h-full bg-primary" style={{ width: `${recorder.level}%` }} />
              </div>
              {recorder.silent ? (
                <p className="text-sm text-destructive" role="status">
                  No audio for 30 seconds. Check that the right microphone is selected and unmuted.
                </p>
              ) : null}
              {mobile && recorder.phase !== "uploading" ? (
                <p className="text-sm text-muted-foreground">
                  Keep this screen on — phones stop web recording when locked.
                </p>
              ) : null}
              <div className="flex flex-wrap gap-2">
                {recorder.phase === "recording" ? (
                  <Button type="button" variant="outline" onClick={recorder.pause}>
                    <Pause className="size-4" aria-hidden="true" />
                    Off the record
                  </Button>
                ) : null}
                {recorder.phase === "paused" ? (
                  <Button type="button" variant="outline" onClick={recorder.resume}>
                    Resume
                  </Button>
                ) : null}
                <Button type="button" disabled={recorder.phase === "uploading"} onClick={recorder.stop}>
                  <Square className="size-3.5 fill-current" aria-hidden="true" />
                  {recorder.phase === "uploading" ? "Uploading…" : "Stop and upload"}
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <Button className="h-auto justify-start p-4 text-left" type="button" variant="outline" disabled={fileBusy || blocked} onClick={onMic}>
                  <span className="grid size-9 place-items-center rounded-xl bg-primary/10 text-primary">
                    <Mic2 className="size-4" aria-hidden="true" />
                  </span>
                  <span>
                    <span className="block">Microphone</span>
                    <span className="mt-0.5 block text-xs font-normal text-muted-foreground">In-person or phone call</span>
                  </span>
                </Button>
                {supportsTab ? (
                  <Button
                    type="button"
                    variant="outline"
                    className="h-auto justify-start p-4 text-left"
                    disabled={fileBusy || blocked}
                    onClick={onTab}
                  >
                    <span className="grid size-9 place-items-center rounded-xl bg-primary/10 text-primary">
                      <MonitorUp className="size-4" aria-hidden="true" />
                    </span>
                    <span>
                      <span className="block">Meeting tab + mic</span>
                      <span className="mt-0.5 block text-xs font-normal text-muted-foreground">Chrome desktop, no bot</span>
                    </span>
                  </Button>
                ) : null}
              </div>
              {supportsTab ? (
                <p className="text-sm text-muted-foreground">
                  Share the meeting tab and tick Share tab audio. Your mic is mixed in. No bot joins
                  the call.
                </p>
              ) : null}
              <label className="block rounded-2xl border border-dashed border-border bg-muted/25 p-4 text-sm font-medium transition-colors hover:border-primary/35 hover:bg-primary/5 sm:p-5">
                <span className="flex items-center gap-2">
                  <FileUp className="size-4 text-primary" aria-hidden="true" />
                  Or upload a file
                </span>
                <input
                  ref={fileRef}
                  type="file"
                  accept="audio/*,video/*"
                  className="mt-3 block w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-primary file:px-3 file:py-2 file:text-xs file:font-semibold file:text-primary-foreground"
                  disabled={fileBusy || blocked}
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    event.target.value = "";
                    if (file) void onFile(file);
                  }}
                />
                <span className="mt-1 block font-normal text-muted-foreground">
                  Audio or video, up to 50 MB and 90 minutes.
                  {fileBusy ? " Uploading…" : ""}
                </span>
              </label>
            </div>
          )}
          </div>
        </div>
      ) : null}

      {message ? <p className="rounded-xl border border-destructive/20 bg-destructive/5 p-3 text-sm text-destructive">{message}</p> : null}
    </div>
  );
}
