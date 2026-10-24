import Link from "next/link";
import { notFound } from "next/navigation";
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

const sourceLabel = {
  mic: "Microphone",
  tab: "Meeting tab",
  upload: "Upload",
} as const;

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

  let playbackUrl: string | null = null;
  if (meeting.audio_path && meeting.status !== "created" && meeting.status !== "failed") {
    const { data } = await admin.storage.from("audio").createSignedUrl(meeting.audio_path, 60 * 60);
    playbackUrl = data?.signedUrl ?? null;
  }

  const video = typeof meeting.mime_type === "string" && meeting.mime_type.startsWith("video/");
  const pauses = parseOffRecordRanges(meeting.off_record_ranges);
  const source = sourceLabel[meeting.source as keyof typeof sourceLabel] ?? meeting.source;

  return (
    <section className="max-w-xl">
      <h1 className="text-2xl font-semibold tracking-tight">{meeting.title}</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        {source}
        {meeting.duration_sec ? ` · ${formatClock(meeting.duration_sec)}` : ""} · {meeting.status}
      </p>
      <p className="mt-1 text-sm text-muted-foreground">
        Recorded {new Date(meeting.recorded_at).toISOString().replace("T", " ").slice(0, 16)} UTC
      </p>
      {meeting.status === "failed" && meeting.error ? (
        <p className="mt-4 text-sm text-destructive">{meeting.error}</p>
      ) : null}
      {meeting.status === "created" ? (
        <p className="mt-4 text-sm text-muted-foreground">The upload did not finish.</p>
      ) : null}
      {playbackUrl ? (
        <div className="mt-6">
          {video ? (
            <video controls src={playbackUrl} className="w-full rounded-lg" />
          ) : (
            <audio controls src={playbackUrl} className="w-full" />
          )}
          <p className="mt-3 text-sm text-muted-foreground">
            Audio is saved. Transcription is the next step, so this page only plays the file back.
          </p>
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
