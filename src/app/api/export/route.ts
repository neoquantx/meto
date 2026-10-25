import {
  assembleExportMeetings,
  meetingsZip,
  readExportCommitment,
  readExportDecision,
  readExportHead,
  readExportSegment,
  readExportSpeaker,
  type ExportCommitment,
  type ExportDecision,
  type ExportHead,
  type ExportSegment,
  type ExportSpeaker,
} from "@/lib/export-archive";
import { chunkItems } from "@/lib/library";
import { jsonError, requireApiUser } from "@/lib/http";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET() {
  const auth = await requireApiUser();
  if (!auth.user) return auth.response;

  const admin = createAdminClient();
  const listed = await admin
    .from("meetings")
    .select("id, title, recorded_at, summary_language, tldr, chapters")
    .eq("owner_id", auth.user.id)
    .order("recorded_at", { ascending: true });
  if (listed.error) return jsonError(listed.error.message, 500, "database");

  const heads: ExportHead[] = [];
  for (const row of listed.data ?? []) {
    const head = readExportHead(row);
    if (head) heads.push(head);
  }
  const ids = heads.map((head) => head.id);
  const segments: ExportSegment[] = [];
  const decisions: ExportDecision[] = [];
  const commitments: ExportCommitment[] = [];
  const speakers: ExportSpeaker[] = [];

  for (const group of chunkItems(ids, 50)) {
    const [segmentResult, decisionResult, commitmentResult, speakerResult] = await Promise.all([
      admin
        .from("segments")
        .select("meeting_id, idx, speaker, start_ms, text")
        .in("meeting_id", group)
        .order("idx", { ascending: true }),
      admin
        .from("decisions")
        .select("meeting_id, text, quote, start_ms, review")
        .eq("owner_id", auth.user.id)
        .in("meeting_id", group),
      admin
        .from("commitments")
        .select(
          "meeting_id, text, quote, kind, condition, due_date, change_note, status, review, start_ms, owner:people(name)",
        )
        .eq("owner_id", auth.user.id)
        .in("meeting_id", group),
      admin
        .from("meeting_speakers")
        .select("meeting_id, speaker, person:people(name)")
        .in("meeting_id", group),
    ]);
    if (segmentResult.error) return jsonError(segmentResult.error.message, 500, "database");
    if (decisionResult.error) return jsonError(decisionResult.error.message, 500, "database");
    if (commitmentResult.error) return jsonError(commitmentResult.error.message, 500, "database");
    if (speakerResult.error) return jsonError(speakerResult.error.message, 500, "database");
    for (const row of segmentResult.data ?? []) {
      const item = readExportSegment(row);
      if (item) segments.push(item);
    }
    for (const row of decisionResult.data ?? []) {
      const item = readExportDecision(row);
      if (item) decisions.push(item);
    }
    for (const row of commitmentResult.data ?? []) {
      const item = readExportCommitment(row);
      if (item) commitments.push(item);
    }
    for (const row of speakerResult.data ?? []) {
      const item = readExportSpeaker(row);
      if (item) speakers.push(item);
    }
  }

  const zip = meetingsZip(assembleExportMeetings({ heads, segments, decisions, commitments, speakers }));
  return new Response(Buffer.from(zip), {
    headers: {
      "content-type": "application/zip",
      "content-disposition": 'attachment; filename="kept-export.zip"',
      "cache-control": "no-store",
    },
  });
}
