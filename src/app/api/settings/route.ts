import { jsonError, requireApiUser } from "@/lib/http";
import { parseSettingsSave } from "@/lib/settings-form";
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
  const parsed = parseSettingsSave(json);
  if (!parsed.ok) return jsonError(parsed.error, 400, "bad_request");

  const admin = createAdminClient();
  const { error } = await admin.from("settings").upsert(
    {
      owner_id: auth.user.id,
      glossary: parsed.glossary,
      summary_language: parsed.summaryLanguage,
    },
    { onConflict: "owner_id" },
  );
  if (error) return jsonError(error.message, 500, "database");
  return Response.json({
    ok: true,
    glossary: parsed.glossary,
    summary_language: parsed.summaryLanguage,
  });
}
