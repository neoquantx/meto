import Link from "next/link";
import { RecoverBanner } from "@/components/recover-banner";
import { buttonVariants } from "@/components/ui/button";

export default function MeetingsPage() {
  return (
    <section>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold tracking-tight">Meetings</h1>
        <Link href="/meetings/new" className={buttonVariants()}>
          New meeting
        </Link>
      </div>
      <div className="mt-6">
        <RecoverBanner />
      </div>
      <p className="mt-6 max-w-lg text-muted-foreground">
        Finished recordings are saved, but the library list comes later. After an upload, the
        meeting page plays the file back.
      </p>
    </section>
  );
}
