import { NewMeetingForm } from "@/components/new-meeting-form";
import { RecoverBanner } from "@/components/recover-banner";
import { readSettings } from "@/lib/settings-form";
import { createAdminClient } from "@/lib/supabase/admin";
import { getUserOrThrow } from "@/lib/supabase/server";

export default async function NewMeetingPage() {
  const user = await getUserOrThrow();
  const admin = createAdminClient();
  const { data } = await admin
    .from("settings")
    .select("glossary, summary_language")
    .eq("owner_id", user.id)
    .maybeSingle();
  const settings = readSettings(data);

  return (
    <section className="mx-auto w-full max-w-3xl">
      <p className="page-eyebrow">Capture a conversation</p>
      <h1 className="page-title">New meeting</h1>
      <p className="page-description">
        Record with the microphone or upload a file. On desktop Chrome you can also capture a
        meeting tab.
      </p>
      <div className="mt-6">
        <RecoverBanner />
      </div>
      <div className="mt-6">
        <NewMeetingForm defaultLanguage={settings.summaryLanguage} />
      </div>
    </section>
  );
}
