import Link from "next/link";
import { notFound } from "next/navigation";
import { TranscriptionPanel } from "@/components/transcription-panel";
import { buttonVariants } from "@/components/ui/button";
import { parseOffRecordRanges } from "@/lib/capture-limits";
import { createAdminClient } from "@/lib/supabase/admin";
import { getUserOrThrow } from "@/lib/supabase/server";

function formatClock(seconds: number) {
  const total = Math.max(0, Math.round(seconds));
  const minutes = Math.floor(total / 60);
  const rest = total % 60;
  return `${minutes}:${String(rest).padStart(2, "0")}`;
}

function formatMs(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const clock = `${minutes}:${String(seconds).padStart(2, "0")}`;
  return hours > 0 ? `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}` : clock;
}

const sourceLabel = {
  mic: "Microphone",
  tab: "Meeting tab",
  upload: "Upload",
} as const;

const TRANSCRIBED = new Set(["transcribed", "extracting", "ready"]);

export default async function MeetingPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await getUserOrThrow();
  const admin = createAdminClient();
  const { data: meeting, error } = await admin
    .from("meetings")
    .select(
      "id, title, status, error, recorded_at, duration_sec, source, mime_type, audio_path, off_record_ranges",
    )
    .eq("id", id)
    .eq("owner_id", user.id)
    .maybeSingle();

  if (error) {
    return (
      <section>
        <h1 className="text-2xl font-semibold tracking-tight">Meeting</h1>
        <p className="mt-3 text-sm text-destructive">{error.message}</p>
      </section>
    );
  }
  if (!meeting) notFound();

  let hasAudio = false;
  let playbackUrl: string | null = null;
  if (meeting.audio_path && meeting.status !== "created") {
    if (meeting.status === "failed") {
      const { data, error: infoError } = await admin.storage.from("audio").info(meeting.audio_path);
      hasAudio = !infoError && Boolean(data);
    } else {
      hasAudio = true;
    }
    if (hasAudio && meeting.audio_path) {
      const { data } = await admin.storage.from("audio").createSignedUrl(meeting.audio_path, 60 * 60);
      playbackUrl = data?.signedUrl ?? null;
    }
  }

  let segments: {
    idx: number;
    speaker: number;
    start_ms: number;
    text: string;
  }[] = [];
  let segmentError: string | null = null;
  if (TRANSCRIBED.has(meeting.status)) {
    const { data, error: segmentsError } = await admin
      .from("segments")
      .select("idx, speaker, start_ms, text")
      .eq("meeting_id", id)
      .order("idx", { ascending: true });
    if (segmentsError) segmentError = segmentsError.message;
    else segments = data ?? [];
  }

  const video = typeof meeting.mime_type === "string" && meeting.mime_type.startsWith("video/");
  const pauses = parseOffRecordRanges(meeting.off_record_ranges);
  const source = sourceLabel[meeting.source as keyof typeof sourceLabel] ?? meeting.source;

  return (
    <section className="max-w-2xl">
      <h1 className="text-2xl font-semibold tracking-tight">{meeting.title}</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        {source}
        {meeting.duration_sec ? ` · ${formatClock(meeting.duration_sec)}` : ""}
      </p>
      <p className="mt-1 text-sm text-muted-foreground">
        Recorded {new Date(meeting.recorded_at).toISOString().replace("T", " ").slice(0, 16)} UTC
      </p>
      <div className="mt-6">
        <TranscriptionPanel
          key={`${meeting.status}:${meeting.error ?? ""}`}
          meetingId={meeting.id}
          status={meeting.status}
          error={meeting.error}
          hasAudio={hasAudio}
        />
      </div>
      {playbackUrl ? (
        <div className="mt-6">
          {video ? (
            <video controls src={playbackUrl} className="w-full rounded-lg" />
          ) : (
            <audio controls src={playbackUrl} className="w-full" />
          )}
        </div>
      ) : null}
      {segmentError ? <p className="mt-6 text-sm text-destructive">{segmentError}</p> : null}
      {TRANSCRIBED.has(meeting.status) && !segmentError && segments.length === 0 ? (
        <p className="mt-6 text-sm text-muted-foreground">No speech was detected.</p>
      ) : null}
      {segments.length > 0 ? (
        <div className="mt-6">
          <h2 className="text-lg font-medium">Transcript</h2>
          <ol className="mt-3 space-y-3">
            {segments.map((segment) => (
              <li key={segment.idx}>
                <p className="text-xs text-muted-foreground">
                  {formatMs(segment.start_ms)} · Speaker {segment.speaker}
                </p>
                <p className="text-sm">{segment.text}</p>
              </li>
            ))}
          </ol>
        </div>
      ) : null}
      {pauses.length > 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">
          Off the record: {pauses.length} {pauses.length === 1 ? "pause" : "pauses"} saved.
        </p>
      ) : null}
      <Link href="/meetings/new" className={`${buttonVariants({ variant: "outline" })} mt-6`}>
        New meeting
      </Link>
    </section>
  );
}
