import { z } from "zod";
import {
  audioObjectPath,
  isSupportedMime,
  parseOffRecordRanges,
} from "@/lib/capture-limits";
import { jsonError, requireApiUser } from "@/lib/http";
import { createAdminClient } from "@/lib/supabase/admin";

const createMeetingSchema = z.object({
  title: z.string().max(200, "Title must be 200 characters or less.").optional(),
  source: z.enum(["mic", "tab", "upload"], "Choose a recording source."),
  summary_language: z.enum(
    ["en", "hi", "hinglish"],
    "Choose English, Hindi, or Hinglish.",
  ),
  recorded_at: z.string().min(1, "Enter a meeting date."),
  consent: z.literal(true, "Consent is required before recording."),
  consent_note: z.string().max(1000, "The consent note is too long.").nullable(),
  off_record_ranges: z
    .array(
      z.object({
        at_ms: z.number().int().nonnegative(),
        paused_ms: z.number().int().positive(),
      }),
    )
    .max(200),
  mime_type: z.string().min(1).max(120),
});

export async function POST(request: Request) {
  const auth = await requireApiUser();
  if (!auth.user) return auth.response;

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return jsonError("The request body must be JSON.", 400, "bad_request");
  }

  const parsed = createMeetingSchema.safeParse(json);
  if (!parsed.success) {
    return jsonError(parsed.error.issues[0]?.message ?? "Invalid request.", 400, "bad_request");
  }

  const body = parsed.data;
  if (!isSupportedMime(body.mime_type)) {
    return jsonError(
      "This file type is not supported. Use an audio or video file.",
      400,
      "unsupported_type",
    );
  }

  const recordedAt = new Date(body.recorded_at);
  if (Number.isNaN(recordedAt.getTime())) {
    return jsonError("Enter a valid meeting date.", 400, "bad_request");
  }

  const title = body.title?.trim() || "Untitled meeting";
  const consentNote = body.consent_note?.trim() || null;
  const admin = createAdminClient();
  const { data: meeting, error: insertError } = await admin
    .from("meetings")
    .insert({
      owner_id: auth.user.id,
      title,
      recorded_at: recordedAt.toISOString(),
      source: body.source,
      summary_language: body.summary_language,
      status: "created",
      consent_at: new Date().toISOString(),
      consent_note: consentNote,
      off_record_ranges: parseOffRecordRanges(body.off_record_ranges),
      mime_type: body.mime_type,
    })
    .select("id")
    .single();

  if (insertError || !meeting) {
    return jsonError(insertError?.message ?? "Could not save the meeting.", 500, "database");
  }

  const path = audioObjectPath(auth.user.id, meeting.id, body.mime_type);
  const { data: signed, error: signError } = await admin.storage
    .from("audio")
    .createSignedUploadUrl(path, { upsert: true });

  if (signError || !signed) {
    await admin
      .from("meetings")
      .update({
        status: "failed",
        error: signError?.message ?? "Could not prepare the upload.",
      })
      .eq("id", meeting.id)
      .eq("owner_id", auth.user.id);
    return jsonError(signError?.message ?? "Could not prepare the upload.", 502, "storage");
  }

  const { error: pathError } = await admin
    .from("meetings")
    .update({ audio_path: path })
    .eq("id", meeting.id)
    .eq("owner_id", auth.user.id);

  if (pathError) {
    return jsonError(pathError.message, 500, "database");
  }

  return Response.json({
    meetingId: meeting.id,
    path: signed.path,
    token: signed.token,
    signedUrl: signed.signedUrl,
  });
}
