import {
  DEFAULT_GEMINI_MODEL,
  ExtractError,
  requestExtraction,
} from "@/lib/extract";
import {
  EXTRACT_UNCONFIGURED,
  extractionFailure,
  isExtractionFailure,
} from "@/lib/extraction-messages";
import { jsonError, requireApiUser } from "@/lib/http";
import { createAdminClient } from "@/lib/supabase/admin";
import { personIdForOwner } from "@/lib/speakers";
import { verifyExtraction, type VerifiedExtraction } from "@/lib/verify";

export const maxDuration = 300;

const DONE = new Set(["ready"]);
const RUNNABLE = new Set(["transcribed", "extracting", "failed"]);

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
    .select("id, status, error, recorded_at, summary_language")
    .eq("id", id)
    .eq("owner_id", auth.user.id)
    .maybeSingle();

  if (loadError) return jsonError(loadError.message, 500, "database");
  if (!meeting) return jsonError("Meeting not found.", 404, "not_found");
  if (DONE.has(meeting.status)) return Response.json({ ok: true, id, status: meeting.status });
  if (!RUNNABLE.has(meeting.status)) {
    return jsonError("Transcribe the meeting before extracting.", 409, "bad_status");
  }
  if (meeting.status === "failed" && isUsageAccountingFailure(meeting.error)) {
    return jsonError("Transcription usage was not recorded. Retry transcription.", 409, "bad_status");
  }

  const { data: segmentRows, error: segmentError } = await admin
    .from("segments")
    .select("idx, speaker, start_ms, text")
    .eq("meeting_id", id)
    .order("idx", { ascending: true });
  if (segmentError) return jsonError(segmentError.message, 500, "database");

  const segments = (segmentRows ?? []).map((row) => ({
    idx: row.idx,
    speaker: row.speaker,
    start_ms: row.start_ms,
    text: row.text,
  }));
  if (
    meeting.status === "failed" &&
    segments.length === 0 &&
    !isExtractionFailure(meeting.error)
  ) {
    return jsonError("Transcribe the meeting before extracting.", 409, "bad_status");
  }

  if (!process.env.GEMINI_API_KEY) {
    await setStatus(admin, id, auth.user.id, ["transcribed", "extracting", "failed"], {
      status: "failed",
      error: EXTRACT_UNCONFIGURED,
    });
    return jsonError(EXTRACT_UNCONFIGURED, 500, "config");
  }

  const claimed = await setStatus(admin, id, auth.user.id, ["transcribed", "extracting", "failed"], {
    status: "extracting",
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
    if (current && DONE.has(current.status)) return Response.json({ ok: true, id, status: current.status });
    return jsonError("This meeting cannot be extracted right now.", 409, "bad_status");
  }

  try {
    const recordedAt = new Date(meeting.recorded_at);
    const when = Number.isNaN(recordedAt.getTime()) ? new Date() : recordedAt;
    const hasSpeech = segments.some((segment) => segment.text.trim());
    const extraction = hasSpeech
      ? await requestExtraction({
          apiKey: process.env.GEMINI_API_KEY,
          model: process.env.GEMINI_MODEL?.trim() || DEFAULT_GEMINI_MODEL,
          summaryLanguage: meeting.summary_language,
          segments,
        })
      : emptyDraft();
    const verified = verifyExtraction({ extraction, segments, recordedAt: when });
    await saveExtraction(admin, id, auth.user.id, verified);
    return Response.json({
      ok: true,
      id,
      status: "ready",
      dropped_count: verified.dropped_count,
    });
  } catch (error) {
    const message = error instanceof ExtractError ? error.message : extractionFailure(errorMessage(error));
    const status = error instanceof ExtractError ? error.status : 500;
    const code = error instanceof ExtractError ? error.code : "database";
    await setStatus(admin, id, auth.user.id, ["extracting"], {
      status: "failed",
      error: message,
    });
    return jsonError(message, status, code);
  }
}

async function saveExtraction(admin: Admin, id: string, ownerId: string, verified: VerifiedExtraction) {
  const { error: deleteDecisionsError } = await admin
    .from("decisions")
    .delete()
    .eq("meeting_id", id)
    .eq("owner_id", ownerId);
  if (deleteDecisionsError) throw new Error(deleteDecisionsError.message);

  const { error: deleteCommitmentsError } = await admin
    .from("commitments")
    .delete()
    .eq("meeting_id", id)
    .eq("owner_id", ownerId);
  if (deleteCommitmentsError) throw new Error(deleteCommitmentsError.message);

  if (verified.decisions.length > 0) {
    const { error } = await admin.from("decisions").insert(
      verified.decisions.map((item) => ({
        owner_id: ownerId,
        meeting_id: id,
        text: item.text,
        quote: item.quote,
        segment_idx: item.segment_idx,
        start_ms: item.start_ms,
      })),
    );
    if (error) throw new Error(error.message);
  }

  const { data: speakerRows, error: speakerRowsError } = await admin
    .from("meeting_speakers")
    .select("speaker, person_id")
    .eq("meeting_id", id);
  if (speakerRowsError) throw new Error(speakerRowsError.message);
  const personBySpeaker = new Map<number, string | null>(
    (speakerRows ?? []).map((row) => [row.speaker, row.person_id]),
  );

  if (verified.commitments.length > 0) {
    const { error } = await admin.from("commitments").insert(
      verified.commitments.map((item) => ({
        owner_id: ownerId,
        meeting_id: id,
        text: item.text,
        kind: item.kind,
        condition: item.condition,
        owner_speaker: item.owner_speaker,
        owner_person_id: personIdForOwner(item.owner_speaker, personBySpeaker),
        due_phrase: item.due_phrase,
        due_date: item.due_date,
        quote: item.quote,
        segment_idx: item.segment_idx,
        start_ms: item.start_ms,
      })),
    );
    if (error) throw new Error(error.message);
  }

  const { error: clearHintsError } = await admin
    .from("meeting_speakers")
    .update({ name_hint: null })
    .eq("meeting_id", id);
  if (clearHintsError) throw new Error(clearHintsError.message);

  for (const hint of verified.speaker_name_hints) {
    const { error } = await admin
      .from("meeting_speakers")
      .update({ name_hint: hint.name })
      .eq("meeting_id", id)
      .eq("speaker", hint.speaker);
    if (error) throw new Error(error.message);
  }

  const marked = await setStatus(admin, id, ownerId, ["extracting"], {
    status: "ready",
    error: null,
    tldr: verified.tldr,
    chapters: verified.chapters,
    dropped_count: verified.dropped_count,
  });
  if (marked.error) throw new Error(marked.error);
  if (!marked.updated) throw new Error("Could not save the extraction.");
}

function emptyDraft() {
  return {
    tldr: [],
    chapters: [],
    decisions: [],
    commitments: [],
    speaker_name_hints: [],
  };
}

function isUsageAccountingFailure(error: string | null) {
  return Boolean(error?.includes("usage could not be recorded"));
}

function errorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : "Extraction failed. Try again.";
  return message.replace(/\s+/g, " ").trim().slice(0, 240);
}

async function setStatus(
  admin: Admin,
  id: string,
  ownerId: string,
  from: string[],
  next: {
    status: string;
    error: string | null;
    tldr?: string[];
    chapters?: VerifiedExtraction["chapters"];
    dropped_count?: number;
  },
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
