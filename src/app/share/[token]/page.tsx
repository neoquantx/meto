import { notFound } from "next/navigation";
import { ShareDocumentView, ShareFrame } from "@/components/share-document";
import {
  parseChapters,
  parseTldr,
  readKind,
  readPersonName,
} from "@/lib/meeting-view";
import { buildShareDocument, isShareToken, type ShareSource } from "@/lib/share-view";
import { createAdminClient } from "@/lib/supabase/admin";

function textOf(value: unknown) {
  return typeof value === "string" ? value : "";
}

export default async function SharePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  if (!isShareToken(token)) notFound();

  let admin: ReturnType<typeof createAdminClient>;
  try {
    admin = createAdminClient();
  } catch {
    return (
      <ShareFrame>
        <h1 className="text-2xl font-semibold tracking-tight">Share link</h1>
        <p className="mt-3 text-sm text-muted-foreground">This link could not be opened.</p>
      </ShareFrame>
    );
  }

  const { data: share, error } = await admin
    .from("shares")
    .select("owner_id, meeting_id, person_id, revoked")
    .eq("token", token)
    .maybeSingle();
  if (error) {
    return (
      <ShareFrame>
        <h1 className="text-2xl font-semibold tracking-tight">Share link</h1>
        <p className="mt-3 text-sm text-muted-foreground">This link could not be opened.</p>
      </ShareFrame>
    );
  }
  if (!share) notFound();
  if (share.revoked) {
    return (
      <ShareFrame>
        <h1 className="text-2xl font-semibold tracking-tight">Link revoked</h1>
        <p className="mt-3 text-sm text-muted-foreground">The owner turned this share link off.</p>
      </ShareFrame>
    );
  }

  const meetingId = textOf(share.meeting_id);
  const ownerId = textOf(share.owner_id);
  const personId = typeof share.person_id === "string" ? share.person_id : null;
  const { data: meeting, error: meetingError } = await admin
    .from("meetings")
    .select("title, recorded_at, tldr, chapters")
    .eq("id", meetingId)
    .eq("owner_id", ownerId)
    .maybeSingle();
  if (meetingError || !meeting) notFound();

  const [segmentResult, decisionResult, commitmentResult, speakerResult, personResult] = await Promise.all([
    admin
      .from("segments")
      .select("speaker, start_ms, text")
      .eq("meeting_id", meetingId)
      .order("idx", { ascending: true }),
    admin
      .from("decisions")
      .select("text, quote, start_ms, review")
      .eq("meeting_id", meetingId)
      .eq("owner_id", ownerId),
    admin
      .from("commitments")
      .select(
        "text, quote, kind, condition, due_date, change_note, status, review, start_ms, owner_speaker, owner_person_id, owner:people(name)",
      )
      .eq("meeting_id", meetingId)
      .eq("owner_id", ownerId),
    admin
      .from("meeting_speakers")
      .select("speaker, person_id, person:people(name)")
      .eq("meeting_id", meetingId),
    personId
      ? admin.from("people").select("name").eq("id", personId).eq("owner_id", ownerId).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);
  if (segmentResult.error || decisionResult.error || commitmentResult.error || speakerResult.error || personResult.error) {
    return (
      <ShareFrame>
        <h1 className="text-2xl font-semibold tracking-tight">Share link</h1>
        <p className="mt-3 text-sm text-muted-foreground">This link could not be opened.</p>
      </ShareFrame>
    );
  }

  const source = shareSource({
    personId,
    personName: readPersonName(personResult.data),
    title: textOf(meeting.title),
    recordedAt: textOf(meeting.recorded_at),
    tldr: parseTldr(meeting.tldr),
    chapters: parseChapters(meeting.chapters).map((chapter) => ({
      title: chapter.title,
      startMs: chapter.start_ms,
    })),
    decisions: decisionResult.data ?? [],
    commitments: commitmentResult.data ?? [],
    segments: segmentResult.data ?? [],
    speakers: speakerResult.data ?? [],
  });

  return (
    <ShareFrame>
      <ShareDocumentView document={buildShareDocument(source)} />
    </ShareFrame>
  );
}

function shareSource(input: {
  personId: string | null;
  personName: string | null;
  title: string;
  recordedAt: string;
  tldr: string[];
  chapters: { title: string; startMs: number }[];
  decisions: unknown[];
  commitments: unknown[];
  segments: unknown[];
  speakers: unknown[];
}): ShareSource {
  const decisions: ShareSource["decisions"] = [];
  for (const row of input.decisions) {
    if (!row || typeof row !== "object") continue;
    const record = row as Record<string, unknown>;
    if (typeof record.text !== "string" || typeof record.quote !== "string") continue;
    if (typeof record.start_ms !== "number") continue;
    decisions.push({
      text: record.text,
      quote: record.quote,
      startMs: record.start_ms,
      review: typeof record.review === "string" ? record.review : "pending",
    });
  }

  const commitments: ShareSource["commitments"] = [];
  for (const row of input.commitments) {
    if (!row || typeof row !== "object") continue;
    const record = row as Record<string, unknown>;
    const kind = readKind(record.kind);
    if (!kind || typeof record.text !== "string" || typeof record.quote !== "string") continue;
    if (typeof record.start_ms !== "number") continue;
    const condition = typeof record.condition === "string" ? record.condition.trim() : "";
    const change = typeof record.change_note === "string" ? record.change_note.trim() : "";
    commitments.push({
      text: record.text,
      quote: record.quote,
      kind,
      ownerPersonId: typeof record.owner_person_id === "string" ? record.owner_person_id : null,
      ownerName: readPersonName(record.owner),
      ownerSpeaker: typeof record.owner_speaker === "number" ? record.owner_speaker : null,
      startMs: record.start_ms,
      status: typeof record.status === "string" ? record.status : "open",
      condition: condition || null,
      dueDate: typeof record.due_date === "string" ? record.due_date : null,
      changeNote: change || null,
      review: typeof record.review === "string" ? record.review : "pending",
    });
  }

  const segments: ShareSource["segments"] = [];
  for (const row of input.segments) {
    if (!row || typeof row !== "object") continue;
    const record = row as Record<string, unknown>;
    if (typeof record.speaker !== "number" || typeof record.start_ms !== "number") continue;
    if (typeof record.text !== "string") continue;
    segments.push({ speaker: record.speaker, startMs: record.start_ms, text: record.text });
  }

  const speakers: ShareSource["speakers"] = [];
  for (const row of input.speakers) {
    if (!row || typeof row !== "object") continue;
    const record = row as Record<string, unknown>;
    if (typeof record.speaker !== "number") continue;
    speakers.push({
      speaker: record.speaker,
      personId: typeof record.person_id === "string" ? record.person_id : null,
      name: readPersonName(record.person),
    });
  }

  return {
    personId: input.personId,
    personName: input.personName,
    title: input.title,
    recordedAt: input.recordedAt,
    tldr: input.tldr,
    chapters: input.chapters,
    decisions,
    commitments,
    segments,
    speakers,
  };
}
