import { jsonError, requireApiUser } from "@/lib/http";
import { newShareToken, parseShareCreate } from "@/lib/share-view";
import { readPersonName } from "@/lib/meeting-view";
import { createAdminClient } from "@/lib/supabase/admin";

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
  const parsed = parseShareCreate(json);
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
  if (meeting.status !== "ready") {
    return jsonError("Wait until processing finishes.", 409, "bad_status");
  }

  let personName: string | null = null;
  if (parsed.personId) {
    const { data: speakerRows, error: speakerError } = await admin
      .from("meeting_speakers")
      .select("person_id, person:people(name)")
      .eq("meeting_id", id)
      .eq("person_id", parsed.personId)
      .limit(1);
    if (speakerError) return jsonError(speakerError.message, 500, "database");
    const speaker = speakerRows?.[0];
    personName = readPersonName(speaker?.person);
    if (!speaker || !personName) {
      return jsonError("Choose a person from this meeting.", 400, "bad_request");
    }
  }

  let lookup = admin
    .from("shares")
    .select("token")
    .eq("owner_id", auth.user.id)
    .eq("meeting_id", id)
    .eq("revoked", false)
    .limit(1);
  lookup = parsed.personId ? lookup.eq("person_id", parsed.personId) : lookup.is("person_id", null);
  const { data: priorRows, error: priorError } = await lookup;
  if (priorError) return jsonError(priorError.message, 500, "database");
  const prior = priorRows?.[0];
  if (prior && typeof prior.token === "string") {
    return Response.json({ token: prior.token, personId: parsed.personId, personName });
  }

  const token = newShareToken();
  const { error: insertError } = await admin.from("shares").insert({
    token,
    owner_id: auth.user.id,
    meeting_id: id,
    person_id: parsed.personId,
  });
  if (insertError) return jsonError(insertError.message, 500, "database");
  return Response.json({ token, personId: parsed.personId, personName });
}
