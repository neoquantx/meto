import { asMinutes, utcDay } from "@/lib/capture-limits";
import {
  DeepgramError,
  billedMinutes,
  glossaryKeyterms,
  segmentsFromUtterances,
  speakerIds,
  transcribeAudio,
} from "@/lib/deepgram";
import { jsonError, requireApiUser } from "@/lib/http";
import { createAdminClient } from "@/lib/supabase/admin";

export const maxDuration = 300;

const DONE = new Set(["transcribed", "extracting", "ready"]);
const RUNNABLE = new Set(["uploaded", "transcribing", "failed"]);

type Admin = ReturnType<typeof createAdminClient>;

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireApiUser();
  if (!auth.user) return auth.response;

  const { id } = await params;
  const admin = createAdminClient();
  const { data: meeting, error: loadError } = await admin
    .from("meetings")
    .select("id, status, audio_path, duration_sec")
    .eq("id", id)
    .eq("owner_id", auth.user.id)
    .maybeSingle();

  if (loadError) return jsonError(loadError.message, 500, "database");
  if (!meeting) return jsonError("Meeting not found.", 404, "not_found");
  if (DONE.has(meeting.status)) {
    return Response.json({ ok: true, id, status: meeting.status });
  }
  if (!RUNNABLE.has(meeting.status)) {
    return jsonError("Upload the audio before transcribing.", 409, "bad_status");
  }
  if (!meeting.audio_path) {
    return jsonError("Upload the audio before transcribing.", 409, "missing_file");
  }

  const { data: info, error: infoError } = await admin.storage.from("audio").info(meeting.audio_path);
  if (infoError || !info) {
    if (meeting.status !== "failed") {
      await setStatus(admin, id, auth.user.id, ["uploaded", "transcribing"], {
        status: "failed",
        error: "Upload the audio before transcribing.",
      });
    }
    return jsonError("Upload the audio before transcribing.", 409, "missing_file");
  }

  if (!process.env.DEEPGRAM_API_KEY) {
    await setStatus(admin, id, auth.user.id, ["uploaded", "transcribing", "failed"], {
      status: "failed",
      error: "Transcription is not configured.",
    });
    return jsonError("Transcription is not configured.", 500, "config");
  }

  const claimed = await setStatus(admin, id, auth.user.id, ["uploaded", "transcribing", "failed"], {
    status: "transcribing",
    error: null,
  });
  if (claimed.error) return jsonError(claimed.error, 500, "database");
  if (!claimed.updated) {
    const { data: current } = await admin
      .from("meetings")
      .select("status")
      .eq("id", id)
      .eq("owner_id", auth.user.id)
      .maybeSingle();
    if (current && DONE.has(current.status)) {
      return Response.json({ ok: true, id, status: current.status });
    }
    return jsonError("This meeting cannot be transcribed right now.", 409, "bad_status");
  }

  try {
    const { data: settings, error: settingsError } = await admin
      .from("settings")
      .select("glossary")
      .eq("owner_id", auth.user.id)
      .maybeSingle();
    if (settingsError) throw new Error(settingsError.message);

    const { data: signed, error: signError } = await admin.storage
      .from("audio")
      .createSignedUrl(meeting.audio_path, 60 * 30);
    if (signError || !signed?.signedUrl) {
      throw new DeepgramError(signError?.message ?? "Could not read the audio.", 502, "storage");
    }

    const listen = await transcribeAudio({
      apiKey: process.env.DEEPGRAM_API_KEY,
      audioUrl: signed.signedUrl,
      keyterms: glossaryKeyterms(settings?.glossary),
    });
    const segments = segmentsFromUtterances(listen.utterances);
    const speakers = speakerIds(segments);

    const { error: deleteSegmentsError } = await admin.from("segments").delete().eq("meeting_id", id);
    if (deleteSegmentsError) throw new Error(deleteSegmentsError.message);
    const { error: deleteSpeakersError } = await admin
      .from("meeting_speakers")
      .delete()
      .eq("meeting_id", id);
    if (deleteSpeakersError) throw new Error(deleteSpeakersError.message);

    if (segments.length > 0) {
      const { error: insertError } = await admin.from("segments").insert(
        segments.map((segment) => ({
          meeting_id: id,
          idx: segment.idx,
          speaker: segment.speaker,
          start_ms: segment.start_ms,
          end_ms: segment.end_ms,
          text: segment.text,
        })),
      );
      if (insertError) throw new Error(insertError.message);
    }

    if (speakers.length > 0) {
      const { error: speakerError } = await admin.from("meeting_speakers").insert(
        speakers.map((speaker) => ({
          meeting_id: id,
          speaker,
        })),
      );
      if (speakerError) throw new Error(speakerError.message);
    }

    const marked = await setStatus(admin, id, auth.user.id, ["transcribing"], {
      status: "transcribed",
      error: null,
    });
    if (marked.error) throw new Error(marked.error);
    if (!marked.updated) {
      const { data: current } = await admin
        .from("meetings")
        .select("status")
        .eq("id", id)
        .eq("owner_id", auth.user.id)
        .maybeSingle();
      if (current && DONE.has(current.status)) {
        return Response.json({ ok: true, id, status: current.status, segments: segments.length });
      }
      throw new Error("Could not save the transcript.");
    }

    const minutes = billedMinutes(meeting.duration_sec, listen.durationSec);
    if (minutes > 0) {
      const usageError = await addAudioMinutes(admin, auth.user.id, minutes);
      if (usageError) {
        await setStatus(admin, id, auth.user.id, ["transcribed"], {
          status: "failed",
          error: "The transcript was saved, but today's usage could not be recorded. Try again.",
        });
        return jsonError(
          "The transcript was saved, but today's usage could not be recorded. Try again.",
          500,
          "database",
        );
      }
    }

    return Response.json({ ok: true, id, status: "transcribed", segments: segments.length });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Transcription failed. Try again.";
    const status = error instanceof DeepgramError ? error.status : 500;
    const code = error instanceof DeepgramError ? error.code : "database";
    await setStatus(admin, id, auth.user.id, ["transcribing"], {
      status: "failed",
      error: message,
    });
    return jsonError(message, status, code);
  }
}

async function setStatus(
  admin: Admin,
  id: string,
  ownerId: string,
  from: string[],
  next: { status: string; error: string | null },
) {
  const { data, error } = await admin
    .from("meetings")
    .update(next)
    .eq("id", id)
    .eq("owner_id", ownerId)
    .in("status", from)
    .select("id");
  return { error: error?.message ?? null, updated: (data?.length ?? 0) > 0 };
}

async function addAudioMinutes(admin: Admin, ownerId: string, minutes: number) {
  const day = utcDay();
  const { data, error } = await admin
    .from("usage_daily")
    .select("audio_minutes")
    .eq("owner_id", ownerId)
    .eq("day", day)
    .maybeSingle();
  if (error) return error.message;

  const { error: writeError } = await admin.from("usage_daily").upsert(
    {
      owner_id: ownerId,
      day,
      audio_minutes: asMinutes(data?.audio_minutes) + minutes,
    },
    { onConflict: "owner_id,day" },
  );
  return writeError?.message ?? null;
}
