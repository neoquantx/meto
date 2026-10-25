import { jsonError, requireApiUser } from "@/lib/http";
import { isShareToken } from "@/lib/share-view";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const auth = await requireApiUser();
  if (!auth.user) return auth.response;

  const { token } = await params;
  if (!isShareToken(token)) return jsonError("That link was not found.", 404, "not_found");

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("shares")
    .update({ revoked: true })
    .eq("token", token)
    .eq("owner_id", auth.user.id)
    .select("token");
  if (error) return jsonError(error.message, 500, "database");
  if (!data?.length) return jsonError("That link was not found.", 404, "not_found");
  return Response.json({ ok: true });
}
