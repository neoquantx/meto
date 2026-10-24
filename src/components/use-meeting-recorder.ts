"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { durationForRecording } from "@/lib/media-duration";
import {
  appendChunk,
  buildRecordingBlob,
  deleteSession,
  getLiveSession,
  loadSession,
  saveSession,
  setLiveSession,
  type LocalSession,
} from "@/lib/recording-store";
import { UploadError, uploadMeetingBlob } from "@/lib/upload-meeting";
import { shouldDiscardLocal, type OffRecordRange, type SummaryLanguage } from "@/lib/capture-limits";

export type CaptureDetails = {
  title: string;
  summaryLanguage: SummaryLanguage;
  recordedAt: string;
  consentNote: string | null;
};

type Phase = "idle" | "recording" | "paused" | "uploading";

function pickRecorderMime() {
  if (typeof MediaRecorder === "undefined") return "";
  if (MediaRecorder.isTypeSupported("audio/webm;codecs=opus")) return "audio/webm;codecs=opus";
  if (MediaRecorder.isTypeSupported("audio/mp4")) return "audio/mp4";
  return "";
}

function createRecorder(stream: MediaStream, mime: string) {
  try {
    return new MediaRecorder(stream, { mimeType: mime, audioBitsPerSecond: 32000 });
  } catch {
    return new MediaRecorder(stream, { mimeType: mime });
  }
}

function stopTracks(stream: MediaStream | null) {
  stream?.getTracks().forEach((track) => track.stop());
}

export function useMeetingRecorder() {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("idle");
  const [elapsedMs, setElapsedMs] = useState(0);
  const [level, setLevel] = useState(0);
  const [silent, setSilent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const phaseRef = useRef<Phase>("idle");
  const sessionRef = useRef<LocalSession | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamsRef = useRef<MediaStream[]>([]);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);
  const meterRef = useRef<number | null>(null);
  const recordedMsRef = useRef(0);
  const segmentStartRef = useRef<number | null>(null);
  const pauseStartedRef = useRef<number | null>(null);
  const pauseAtMsRef = useRef(0);
  const rangesRef = useRef<OffRecordRange[]>([]);
  const silentSinceRef = useRef<number | null>(null);
  const stopIntentRef = useRef<"upload" | "keep">("keep");
  const chainRef = useRef(Promise.resolve());
  const chunkErrorRef = useRef<string | null>(null);
  const mountedRef = useRef(true);

  function currentRecordedMs() {
    const extra = segmentStartRef.current == null ? 0 : Date.now() - segmentStartRef.current;
    return recordedMsRef.current + extra;
  }

  function setPhaseBoth(next: Phase) {
    phaseRef.current = next;
    setPhase(next);
  }

  async function acquireWakeLock() {
    if (!("wakeLock" in navigator)) return;
    try {
      wakeLockRef.current = await navigator.wakeLock.request("screen");
    } catch {
      // The browser can refuse the lock. Recording still works with the screen on.
    }
  }

  function releaseMeter() {
    if (meterRef.current != null) {
      window.clearInterval(meterRef.current);
      meterRef.current = null;
    }
  }

  function releaseHardware() {
    releaseMeter();
    streamsRef.current.forEach((stream) => stopTracks(stream));
    streamsRef.current = [];
    const context = audioCtxRef.current;
    audioCtxRef.current = null;
    void context?.close();
    const lock = wakeLockRef.current;
    wakeLockRef.current = null;
    void lock?.release().catch(() => undefined);
    recorderRef.current = null;
  }

  function startMeter(analyser: AnalyserNode) {
    const data = new Uint8Array(analyser.fftSize);
    releaseMeter();
    meterRef.current = window.setInterval(() => {
      analyser.getByteTimeDomainData(data);
      let sum = 0;
      for (let index = 0; index < data.length; index += 1) {
        const sample = (data[index] - 128) / 128;
        sum += sample * sample;
      }
      const rms = Math.sqrt(sum / data.length);
      setLevel(Math.min(100, Math.round((rms / 0.2) * 100)));
      if (recorderRef.current?.state !== "recording") {
        silentSinceRef.current = null;
        setSilent(false);
        return;
      }
      if (rms < 0.012) {
        if (silentSinceRef.current == null) silentSinceRef.current = Date.now();
        else if (Date.now() - silentSinceRef.current >= 30_000) setSilent(true);
      } else {
        silentSinceRef.current = null;
        setSilent(false);
      }
    }, 200);
  }

  function meterStream(stream: MediaStream) {
    const context = audioCtxRef.current ?? new AudioContext();
    audioCtxRef.current = context;
    void context.resume();
    const analyser = context.createAnalyser();
    analyser.fftSize = 2048;
    context.createMediaStreamSource(stream).connect(analyser);
    startMeter(analyser);
  }

  function enqueue(blob: Blob) {
    if (blob.size === 0) return;
    chainRef.current = chainRef.current
      .then(async () => {
        const session = sessionRef.current;
        if (!session) return;
        const next = await appendChunk(
          {
            ...session,
            recordedMs: currentRecordedMs(),
            offRecordRanges: rangesRef.current,
          },
          blob,
        );
        sessionRef.current = next;
      })
      .catch((reason: unknown) => {
        chunkErrorRef.current =
          reason instanceof Error ? reason.message : "Could not save a piece of the recording.";
      });
  }

  async function finishUpload() {
    const session = sessionRef.current;
    if (!session) return;
    setPhaseBoth("uploading");
    try {
      const blob = await buildRecordingBlob(session);
      const durationSec = await durationForRecording(blob, session.recordedMs);
      const meetingId = await uploadMeetingBlob({
        blob,
        mimeType: session.mimeType,
        title: session.title,
        source: session.source,
        summaryLanguage: session.summaryLanguage,
        recordedAt: session.recordedAt,
        consentNote: session.consentNote,
        offRecordRanges: session.offRecordRanges,
        durationSec,
        draft: session.draft,
        onDraft: async (draft) => {
          const next = { ...(sessionRef.current ?? session), draft, phase: "ready" as const };
          sessionRef.current = next;
          await saveSession(next);
        },
      });
      await deleteSession(session.sessionId);
      sessionRef.current = null;
      setLiveSession(null);
      setPhaseBoth("idle");
      router.push(`/meetings/${meetingId}`);
      router.refresh();
    } catch (reason) {
      const code = reason instanceof UploadError ? reason.code : undefined;
      const message = reason instanceof Error ? reason.message : "Could not upload the recording.";
      if (shouldDiscardLocal(code)) {
        await deleteSession(session.sessionId);
        sessionRef.current = null;
      }
      setLiveSession(null);
      setPhaseBoth("idle");
      setError(message);
    }
  }

  function bindRecorder(recorder: MediaRecorder) {
    recorder.ondataavailable = (event) => enqueue(event.data);
    recorder.onstop = () => {
      void chainRef.current.then(async () => {
        if (pauseStartedRef.current != null) {
          const pausedMs = Date.now() - pauseStartedRef.current;
          if (pausedMs > 0) {
            rangesRef.current = [
              ...rangesRef.current,
              { at_ms: Math.round(pauseAtMsRef.current), paused_ms: Math.round(pausedMs) },
            ];
          }
          pauseStartedRef.current = null;
        }
        recordedMsRef.current = currentRecordedMs();
        segmentStartRef.current = null;
        const session = sessionRef.current;
        if (session) {
          const ready = {
            ...session,
            phase: "ready" as const,
            recordedMs: recordedMsRef.current,
            offRecordRanges: rangesRef.current,
          };
          sessionRef.current = ready;
          await saveSession(ready);
        }
        releaseHardware();
        if (chunkErrorRef.current) {
          setError(chunkErrorRef.current);
          setLiveSession(null);
          setPhaseBoth("idle");
          return;
        }
        if (stopIntentRef.current === "upload") await finishUpload();
        else {
          setLiveSession(null);
          setPhaseBoth("idle");
        }
      });
    };
  }

  async function unfinishedSession() {
    const existing = await loadSession();
    return Boolean(existing && existing.seq > 0 && existing.sessionId !== getLiveSession());
  }

  async function armRecorder(
    stream: MediaStream,
    source: "mic" | "tab",
    details: CaptureDetails,
    mime: string,
  ) {
    const session: LocalSession = {
      sessionId: crypto.randomUUID(),
      title: details.title.trim() || "Untitled meeting",
      summaryLanguage: details.summaryLanguage,
      recordedAt: details.recordedAt,
      consentNote: details.consentNote,
      source,
      mimeType: mime,
      seq: 0,
      offRecordRanges: [],
      recordedMs: 0,
      phase: "recording",
    };
    sessionRef.current = session;
    setLiveSession(session.sessionId);
    try {
      await saveSession(session);
    } catch {
      sessionRef.current = null;
      setLiveSession(null);
      stopTracks(stream);
      throw new Error("This browser blocked local storage, so recording cannot start safely.");
    }
    rangesRef.current = [];
    recordedMsRef.current = 0;
    segmentStartRef.current = Date.now();
    pauseStartedRef.current = null;
    chunkErrorRef.current = null;
    chainRef.current = Promise.resolve();
    setElapsedMs(0);
    setError(null);

    const recorder = createRecorder(stream, mime);
    const actualMime = recorder.mimeType || mime;
    if (actualMime !== session.mimeType) {
      session.mimeType = actualMime;
      sessionRef.current = { ...session };
      await saveSession(sessionRef.current);
    }
    recorderRef.current = recorder;
    bindRecorder(recorder);
    recorder.start(5000);
    if (!mountedRef.current) {
      stopIntentRef.current = "keep";
      recorder.stop();
      return;
    }
    setPhaseBoth("recording");
    void acquireWakeLock();
    if (source === "mic") meterStream(stream);
  }

  async function startMic(details: CaptureDetails) {
    if (phaseRef.current !== "idle") return;
    const mime = pickRecorderMime();
    if (!mime) {
      setError("This browser cannot record audio. Upload a file instead.");
      return;
    }
    phaseRef.current = "recording";
    setError(null);
    stopIntentRef.current = "keep";
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
      });
      if (!mountedRef.current) {
        stopTracks(stream);
        phaseRef.current = "idle";
        return;
      }
      if (await unfinishedSession()) {
        stopTracks(stream);
        phaseRef.current = "idle";
        setError("Finish or discard the unfinished recording above before starting another.");
        return;
      }
      streamsRef.current = [stream];
      await armRecorder(stream, "mic", details, mime);
    } catch (reason) {
      releaseHardware();
      setLiveSession(null);
      phaseRef.current = "idle";
      const message = reason instanceof Error ? reason.message : "Could not use the microphone.";
      setError(
        /denied|permission/i.test(message)
          ? "Microphone permission was blocked. Allow the mic and try again."
          : message,
      );
    }
  }

  async function startTab(details: CaptureDetails) {
    if (phaseRef.current !== "idle") return;
    const mime = pickRecorderMime();
    if (!mime) {
      setError("This browser cannot record audio. Upload a file instead.");
      return;
    }
    phaseRef.current = "recording";
    setError(null);
    stopIntentRef.current = "keep";
    let display: MediaStream | null = null;
    let mic: MediaStream | null = null;
    try {
      display = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
      if (!mountedRef.current) {
        stopTracks(display);
        phaseRef.current = "idle";
        return;
      }
      display.getVideoTracks().forEach((track) => track.stop());
      const tabAudio = display.getAudioTracks();
      if (tabAudio.length === 0) {
        stopTracks(display);
        phaseRef.current = "idle";
        setError("Tick 'Share tab audio' and try again.");
        return;
      }
      mic = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
      });
      if (!mountedRef.current) {
        stopTracks(display);
        stopTracks(mic);
        phaseRef.current = "idle";
        return;
      }
      if (await unfinishedSession()) {
        stopTracks(display);
        stopTracks(mic);
        phaseRef.current = "idle";
        setError("Finish or discard the unfinished recording above before starting another.");
        return;
      }
      const context = new AudioContext();
      audioCtxRef.current = context;
      void context.resume();
      const destination = context.createMediaStreamDestination();
      const tabSource = context.createMediaStreamSource(new MediaStream(tabAudio));
      const micSource = context.createMediaStreamSource(mic);
      const analyser = context.createAnalyser();
      analyser.fftSize = 2048;
      tabSource.connect(analyser);
      micSource.connect(analyser);
      tabSource.connect(destination);
      micSource.connect(destination);
      streamsRef.current = [display, mic, destination.stream];
      tabAudio[0].onended = () => {
        if (recorderRef.current && recorderRef.current.state !== "inactive") {
          stopIntentRef.current = "upload";
          recorderRef.current.stop();
        }
      };
      await armRecorder(destination.stream, "tab", details, mime);
      startMeter(analyser);
    } catch (reason) {
      stopTracks(display);
      stopTracks(mic);
      releaseHardware();
      setLiveSession(null);
      phaseRef.current = "idle";
      const message = reason instanceof Error ? reason.message : "Could not capture the meeting tab.";
      if (/denied|permission/i.test(message)) {
        setError("Microphone or tab sharing was blocked. Allow both and try again.");
      } else {
        setError(message);
      }
    }
  }

  function pause() {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state !== "recording") return;
    recordedMsRef.current = currentRecordedMs();
    segmentStartRef.current = null;
    pauseAtMsRef.current = recordedMsRef.current;
    pauseStartedRef.current = Date.now();
    recorder.pause();
    setElapsedMs(recordedMsRef.current);
    setPhaseBoth("paused");
    const session = sessionRef.current;
    if (session) {
      const next = { ...session, phase: "paused" as const, recordedMs: recordedMsRef.current };
      sessionRef.current = next;
      void saveSession(next);
    }
  }

  function resume() {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state !== "paused" || pauseStartedRef.current == null) return;
    const pausedMs = Date.now() - pauseStartedRef.current;
    if (pausedMs > 0) {
      rangesRef.current = [
        ...rangesRef.current,
        { at_ms: Math.round(pauseAtMsRef.current), paused_ms: Math.round(pausedMs) },
      ];
    }
    pauseStartedRef.current = null;
    recorder.resume();
    segmentStartRef.current = Date.now();
    setPhaseBoth("recording");
    void acquireWakeLock();
    const session = sessionRef.current;
    if (session) {
      const next = {
        ...session,
        phase: "recording" as const,
        offRecordRanges: rangesRef.current,
      };
      sessionRef.current = next;
      void saveSession(next);
    }
  }

  function stop() {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state === "inactive") return;
    stopIntentRef.current = "upload";
    recorder.stop();
  }

  useEffect(() => {
    if (phase !== "recording") return;
    const id = window.setInterval(() => setElapsedMs(currentRecordedMs()), 250);
    return () => window.clearInterval(id);
  }, [phase]);

  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === "visible" && phaseRef.current === "recording") {
        void acquireWakeLock();
      }
    };
    const onLeave = (event: BeforeUnloadEvent) => {
      if (phaseRef.current === "idle") return;
      event.preventDefault();
      event.returnValue = "";
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("beforeunload", onLeave);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("beforeunload", onLeave);
    };
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      const recorder = recorderRef.current;
      if (recorder && recorder.state !== "inactive") {
        if (stopIntentRef.current !== "upload") stopIntentRef.current = "keep";
        recorder.stop();
      }
    };
  }, []);

  return {
    phase,
    elapsedMs,
    level,
    silent,
    error,
    clearError: () => setError(null),
    startMic,
    startTab,
    pause,
    resume,
    stop,
  };
}
