import { SettingsForm } from "@/components/settings-form";
import { readSettings } from "@/lib/settings-form";
import { createAdminClient } from "@/lib/supabase/admin";
import { getUserOrThrow } from "@/lib/supabase/server";

export default async function SettingsPage() {
  const user = await getUserOrThrow();
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("settings")
    .select("glossary, summary_language")
    .eq("owner_id", user.id)
    .maybeSingle();
  const settings = readSettings(data);

  return (
    <section className="mx-auto w-full max-w-4xl">
      <p className="page-eyebrow">Workspace preferences</p>
      <h1 className="page-title">Settings</h1>
      <p className="page-description">
        Glossary terms, the language for new summaries, a redacted export, and a way to delete everything.
      </p>
      {error ? <p className="mt-4 text-sm text-destructive">{error.message}</p> : null}
      <SettingsForm
        userId={user.id}
        glossary={settings.glossary}
        summaryLanguage={settings.summaryLanguage}
      />
    </section>
  );
}
