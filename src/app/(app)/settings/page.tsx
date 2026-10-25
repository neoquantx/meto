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
    <section>
      <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
      <p className="mt-3 max-w-xl text-muted-foreground">
        Glossary terms, the language for new summaries, a redacted export, and a way to delete everything.
      </p>
      {error ? <p className="mt-4 text-sm text-destructive">{error.message}</p> : null}
      <SettingsForm glossary={settings.glossary} summaryLanguage={settings.summaryLanguage} />
    </section>
  );
}
