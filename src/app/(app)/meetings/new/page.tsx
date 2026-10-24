import { NewMeetingForm } from "@/components/new-meeting-form";
import { RecoverBanner } from "@/components/recover-banner";

export default function NewMeetingPage() {
  return (
    <section className="max-w-xl">
      <h1 className="text-2xl font-semibold tracking-tight">New meeting</h1>
      <p className="mt-2 text-muted-foreground">
        Record with the microphone or upload a file. On desktop Chrome you can also capture a
        meeting tab.
      </p>
      <div className="mt-6">
        <RecoverBanner />
      </div>
      <div className="mt-6">
        <NewMeetingForm />
      </div>
    </section>
  );
}
