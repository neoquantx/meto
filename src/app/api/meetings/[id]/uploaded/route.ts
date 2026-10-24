import { z } from "zod";
import {
  checkDailyCap,
  checkDuration,
  checkSize,
  dailyCapMinutes,
  asMinutes,
  pendingMinutes,
  storedByteSize,
  utcDay,
} from "@/lib/capture-limits";
import { jsonError, requireApiUser } from "@/lib/http";
import { createAdminClient } from "@/lib/supabase/admin";

const uploadedSchema = z.object({
  duration_sec: z.number().finite().positive("Record at least one second of audio."),
});

const FINISHED = new Set(["uploaded", "transcribing", "transcribed", "extracting", "ready"]);

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireApiUser();
  if (!auth.user) return auth.response;

  const { id } = await params;
  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return jsonError("The request body must be JSON.", 400, "bad_request");
  }

  const parsed = uploadedSchema.safeParse(json);
  if (!parsed.success) {
    return jsonError(parsed.error.issues[0]?.message ?? "Invalid request.", 400, "bad_request");
  }

  const durationSec = Math.round(parsed.data.duration_sec);
  const admin = createAdminClient();
  const { data: meeting, error: loadError } = await admin
    .from("meetings")
    .select("id, status, audio_path")
    .eq("id", id)
    .eq("owner_id", auth.user.id)
    .maybeSingle();

  if (loadError) return jsonError(loadError.message, 500, "database");
  if (!meeting) return jsonError("Meeting not found.", 404, "not_found");
  if (FINISHED.has(meeting.status)) return Response.json({ ok: true, id });
  if (meeting.status !== "created" && meeting.status !== "failed") {
    return jsonError("This meeting cannot accept an upload.", 409, "bad_status");
  }
  if (!meeting.audio_path) {
    return jsonError("The upload was not prepared.", 409, "missing_file");
  }

  const { data: info, error: infoError } = await admin.storage.from("audio").info(meeting.audio_path);
  if (infoError || !info) {
    return jsonError("Upload the audio before continuing.", 400, "missing_file");
  }

  const size = storedByteSize(info);
  if (size == null) {
    return jsonError(
      "The upload finished, but its size could not be checked. Try again.",
      502,
      "unreadable",
    );
  }

  const fileIssue = checkSize(size) ?? checkDuration(durationSec);
  let capIssue: ReturnType<typeof checkDailyCap> = null;
  if (!fileIssue) {
    const cap = await dailyCapIssue(admin, auth.user.id, id, durationSec);
    if (!cap.ok) return jsonError(cap.error, 500, "database");
    capIssue = cap.issue;
  }
  const issue = fileIssue ?? capIssue;

  if (issue) {
    if (issue.code !== "unreadable") {
      await admin.storage.from("audio").remove([meeting.audio_path]);
    }
    await admin
      .from("meetings")
      .update({ status: "failed", error: issue.error })
      .eq("id", id)
      .eq("owner_id", auth.user.id);
    return jsonError(issue.error, issue.code === "quota" ? 429 : 400, issue.code);
  }

  const { error: updateError } = await admin
    .from("meetings")
    .update({
      status: "uploaded",
      duration_sec: durationSec,
      error: null,
    })
    .eq("id", id)
    .eq("owner_id", auth.user.id);

  if (updateError) return jsonError(updateError.message, 500, "database");
  return Response.json({ ok: true, id });
}

async function dailyCapIssue(
  admin: ReturnType<typeof createAdminClient>,
  ownerId: string,
  meetingId: string,
  durationSec: number,
): Promise<{ ok: true; issue: ReturnType<typeof checkDailyCap> } | { ok: false; error: string }> {
  const { data: usage, error: usageError } = await admin
    .from("usage_daily")
    .select("audio_minutes")
    .eq("owner_id", ownerId)
    .eq("day", utcDay())
    .maybeSingle();
  if (usageError) return { ok: false, error: usageError.message };

  const { data: pending, error: pendingError } = await admin
    .from("meetings")
    .select("duration_sec")
    .eq("owner_id", ownerId)
    .in("status", ["uploaded", "transcribing"])
    .neq("id", meetingId);
  if (pendingError) return { ok: false, error: pendingError.message };

  return {
    ok: true,
    issue: checkDailyCap({
      durationSec,
      usedMinutes: asMinutes(usage?.audio_minutes),
      pendingMinutes: pendingMinutes(pending ?? []),
      capMinutes: dailyCapMinutes(process.env.DAILY_AUDIO_MINUTES_CAP),
    }),
  };
}
