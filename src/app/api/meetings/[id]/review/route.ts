import { jsonError, requireApiUser } from "@/lib/http";
import { parseReviewSave } from "@/lib/meeting-view";
import { createAdminClient } from "@/lib/supabase/admin";

const READY = new Set(["ready"]);

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireApiUser();
  if (!auth.user) return auth.response;

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return jsonError("The request body must be JSON.", 400, "bad_request");
  }

  const parsed = parseReviewSave(json);
  if (!parsed.ok) return jsonError(parsed.error, 400, "bad_request");

  const { id } = await params;
  const admin = createAdminClient();
  const { data: meeting, error: loadError } = await admin
    .from("meetings")
    .select("id, status")
    .eq("id", id)
    .eq("owner_id", auth.user.id)
    .maybeSingle();
  if (loadError) return jsonError(loadError.message, 500, "database");
  if (!meeting) return jsonError("Meeting not found.", 404, "not_found");
  if (!READY.has(meeting.status)) {
    return jsonError("Wait until processing finishes.", 409, "bad_status");
  }

  const updated =
    parsed.target === "decision"
      ? await admin
          .from("decisions")
          .update({ review: parsed.review })
          .eq("id", parsed.id)
          .eq("meeting_id", id)
          .eq("owner_id", auth.user.id)
          .select("id")
      : await admin
          .from("commitments")
          .update({ review: parsed.review })
          .eq("id", parsed.id)
          .eq("meeting_id", id)
          .eq("owner_id", auth.user.id)
          .select("id");

  if (updated.error) return jsonError(updated.error.message, 500, "database");
  if (!updated.data?.length) return jsonError("That item was not found.", 404, "not_found");
  return Response.json({ ok: true, review: parsed.review });
}
