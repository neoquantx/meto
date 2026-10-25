import Link from "next/link";
import { notFound } from "next/navigation";
import { MeetingRoom } from "@/components/meeting-room";
import { TranscriptionPanel } from "@/components/transcription-panel";
import { buttonVariants } from "@/components/ui/button";
import { parseOffRecordRanges } from "@/lib/capture-limits";
import {
  parseChapters,
  parseTldr,
  readCommitment,
  readDecision,
  readSegment,
  readSpeaker,
  type CommitmentRow,
  type DecisionRow,
  type SpeakerRow,
  type TranscriptSegment,
} from "@/lib/meeting-view";
import { formatDuration } from "@/lib/playback";
import { createAdminClient } from "@/lib/supabase/admin";
import { getUserOrThrow } from "@/lib/supabase/server";

const sourceLabel = {
  mic: "Microphone",
  tab: "Meeting tab",
  upload: "Upload",
} as const;

const WITH_TRANSCRIPT = new Set(["transcribed", "extracting", "ready", "failed"]);
const SPEECH_CHECKED = new Set(["transcribed", "extracting", "ready"]);

function rows<T>(data: unknown[] | null, read: (row: unknown) => T | null) {
  const parsed: T[] = [];
  for (const row of data ?? []) {
    const item = read(row);
    if (item) parsed.push(item);
  }
  return parsed;
}

function recordedLabel(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return `${date.toISOString().replace("T", " ").slice(0, 16)} UTC`;
}

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
      "id, title, status, error, recorded_at, duration_sec, source, mime_type, audio_path, off_record_ranges, dropped_count, tldr, chapters",
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

  let segments: TranscriptSegment[] = [];
  let speakers: SpeakerRow[] = [];
  let loadError: string | null = null;
  if (WITH_TRANSCRIPT.has(meeting.status)) {
    const [segmentResult, speakerResult] = await Promise.all([
      admin
        .from("segments")
        .select("idx, speaker, start_ms, end_ms, text")
        .eq("meeting_id", id)
        .order("idx", { ascending: true }),
      admin
        .from("meeting_speakers")
        .select("speaker, name_hint, person:people(name)")
        .eq("meeting_id", id)
        .order("speaker", { ascending: true }),
    ]);
    if (segmentResult.error) loadError = segmentResult.error.message;
    else segments = rows(segmentResult.data, readSegment);
    if (speakerResult.error) loadError = speakerResult.error.message;
    else speakers = rows(speakerResult.data, readSpeaker);
  }

  let decisions: DecisionRow[] = [];
  let commitments: CommitmentRow[] = [];
  if (meeting.status === "ready") {
    const [decisionResult, commitmentResult] = await Promise.all([
      admin
        .from("decisions")
        .select("id, text, quote, start_ms, segment_idx, review")
        .eq("meeting_id", id)
        .eq("owner_id", user.id)
        .order("start_ms", { ascending: true }),
      admin
        .from("commitments")
        .select(
          "id, text, quote, kind, condition, due_date, start_ms, segment_idx, review, status, owner_speaker, owner:people(name)",
        )
        .eq("meeting_id", id)
        .eq("owner_id", user.id)
        .order("start_ms", { ascending: true }),
    ]);
    if (decisionResult.error) loadError = decisionResult.error.message;
    else decisions = rows(decisionResult.data, readDecision);
    if (commitmentResult.error) loadError = commitmentResult.error.message;
    else commitments = rows(commitmentResult.data, readCommitment);
  }

  const ready = meeting.status === "ready";
  const showRoom = Boolean(playbackUrl) || segments.length > 0 || speakers.length > 0 || ready;
  const video = typeof meeting.mime_type === "string" && meeting.mime_type.startsWith("video/");
  const source = sourceLabel[meeting.source as keyof typeof sourceLabel] ?? meeting.source;

  return (
    <section>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{meeting.title}</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {source}
            {meeting.duration_sec ? ` · ${formatDuration(meeting.duration_sec)}` : ""}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">Recorded {recordedLabel(meeting.recorded_at)}</p>
        </div>
        <Link href="/meetings/new" className={buttonVariants({ variant: "outline" })}>
          New meeting
        </Link>
      </div>
      {meeting.status !== "ready" ? (
        <div className="mt-6 max-w-2xl">
          <TranscriptionPanel
            key={`${meeting.status}:${meeting.error ?? ""}`}
            meetingId={meeting.id}
            status={meeting.status}
            error={meeting.error}
            hasAudio={hasAudio}
          />
        </div>
      ) : null}
      {loadError ? <p className="mt-6 text-sm text-destructive">{loadError}</p> : null}
      {showRoom ? (
        <div className="mt-8">
          <MeetingRoom
            meetingId={meeting.id}
            playbackUrl={playbackUrl}
            video={video}
            segments={segments}
            pauses={parseOffRecordRanges(meeting.off_record_ranges)}
            speakers={speakers}
            speechChecked={SPEECH_CHECKED.has(meeting.status) && !loadError}
            ready={ready}
            tldr={parseTldr(meeting.tldr)}
            chapters={parseChapters(meeting.chapters)}
            decisions={decisions}
            commitments={commitments}
            droppedCount={Number(meeting.dropped_count ?? 0)}
          />
        </div>
      ) : null}
    </section>
  );
}
