import { jsonError, requireApiUser } from "@/lib/http";
import { audioPathsToRemove, parseDeleteAll } from "@/lib/settings-form";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(request: Request) {
  const auth = await requireApiUser();
  if (!auth.user) return auth.response;

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return jsonError("The request body must be JSON.", 400, "bad_request");
  }
  const parsed = parseDeleteAll(json);
  if (!parsed.ok) return jsonError(parsed.error, 400, "bad_request");

  const admin = createAdminClient();
  const ownerId = auth.user.id;
  const { data: meetings, error: listError } = await admin
    .from("meetings")
    .select("audio_path")
    .eq("owner_id", ownerId);
  if (listError) return jsonError(listError.message, 500, "database");

  const names: string[] = [];
  for (let offset = 0; offset < 5000; offset += 1000) {
    const listed = await admin.storage.from("audio").list(ownerId, { limit: 1000, offset });
    if (listed.error) return jsonError(listed.error.message, 502, "storage");
    const batch = listed.data ?? [];
    for (const file of batch) {
      if (file.name) names.push(file.name);
    }
    if (batch.length < 1000) break;
  }

  const stored = (meetings ?? []).map((row) =>
    row && typeof row.audio_path === "string" ? row.audio_path : null,
  );
  const paths = audioPathsToRemove(ownerId, names, stored);
  if (paths.length > 0) {
    const removed = await admin.storage.from("audio").remove(paths);
    if (removed.error) return jsonError(removed.error.message, 502, "storage");
  }

  const meetingsDeleted = await admin.from("meetings").delete().eq("owner_id", ownerId);
  if (meetingsDeleted.error) return jsonError(meetingsDeleted.error.message, 500, "database");
  const peopleDeleted = await admin.from("people").delete().eq("owner_id", ownerId);
  if (peopleDeleted.error) return jsonError(peopleDeleted.error.message, 500, "database");
  const usageDeleted = await admin.from("usage_daily").delete().eq("owner_id", ownerId);
  if (usageDeleted.error) return jsonError(usageDeleted.error.message, 500, "database");
  const settingsDeleted = await admin.from("settings").delete().eq("owner_id", ownerId);
  if (settingsDeleted.error) return jsonError(settingsDeleted.error.message, 500, "database");

  return Response.json({ ok: true });
}
