"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { shouldDiscardLocal } from "@/lib/capture-limits";
import { durationForRecording } from "@/lib/media-duration";
import {
  buildRecordingBlob,
  deleteSession,
  getLiveSession,
  loadSession,
  saveSession,
  subscribeLive,
  type LocalSession,
} from "@/lib/recording-store";
import { UploadError, uploadMeetingBlob } from "@/lib/upload-meeting";

export function RecoverBanner() {
  const router = useRouter();
  const [session, setSession] = useState<LocalSession | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<"upload" | "discard" | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function refresh() {
      try {
        const loaded = await loadSession();
        if (cancelled) return;
        if (!loaded || loaded.sessionId === getLiveSession() || loaded.seq === 0) {
          setSession(null);
          return;
        }
        setSession(loaded);
      } catch {
        if (!cancelled) setSession(null);
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
  }, []);

  if (!session && !error) return null;

  async function recover(current: LocalSession) {
    setPending("upload");
    setError(null);
    try {
      const blob = await buildRecordingBlob(current);
      const durationSec = await durationForRecording(blob, current.recordedMs);
      const meetingId = await uploadMeetingBlob({
        blob,
        mimeType: current.mimeType,
        title: current.title,
        source: current.source,
        summaryLanguage: current.summaryLanguage,
        recordedAt: current.recordedAt,
        consentNote: current.consentNote,
        offRecordRanges: current.offRecordRanges,
        durationSec,
        draft: current.draft,
        onDraft: async (draft) => {
          await saveSession({ ...current, draft, phase: "ready" });
        },
      });
      await deleteSession(current.sessionId);
      router.push(`/meetings/${meetingId}`);
      router.refresh();
    } catch (reason) {
      const code = reason instanceof UploadError ? reason.code : undefined;
      if (shouldDiscardLocal(code)) {
        await deleteSession(current.sessionId);
        setSession(null);
      }
      setError(reason instanceof Error ? reason.message : "Could not upload the recording.");
      setPending(null);
    }
  }

  async function discard(current: LocalSession) {
    const confirmed = window.confirm(
      "Discard this recording? The audio saved on this device will be deleted.",
    );
    if (!confirmed) return;
    setPending("discard");
    await deleteSession(current.sessionId);
    setSession(null);
    setError(null);
    setPending(null);
  }

  return (
    <div className="rounded-2xl border border-primary/20 bg-primary/5 px-4 py-4 shadow-xs">
      {session ? (
        <>
          <div className="flex items-start gap-3">
            <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
              <RotateCcw className="size-4" aria-hidden="true" />
            </span>
            <div>
          <p className="text-sm font-semibold">Recover recording</p>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">
            {session.title} is still saved on this device. If it is open in another tab, stop it
            there first.
          </p>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button type="button" disabled={pending != null} onClick={() => void recover(session)}>
              {pending === "upload" ? "Uploading…" : "Recover and upload"}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={pending != null}
              onClick={() => void discard(session)}
            >
              Discard
            </Button>
          </div>
        </>
      ) : null}
      {error ? <p className="mt-2 text-sm text-destructive">{error}</p> : null}
    </div>
  );
}
