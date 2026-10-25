import { BriefBoard } from "@/components/brief-board";
import { loadBriefData } from "@/lib/ledger-data";
import { createAdminClient } from "@/lib/supabase/admin";
import { getUserOrThrow } from "@/lib/supabase/server";

export default async function BriefPage() {
  const user = await getUserOrThrow();
  const admin = createAdminClient();
  let data: Awaited<ReturnType<typeof loadBriefData>> | null = null;
  let loadError: string | null = null;
  try {
    data = await loadBriefData(admin, user.id);
  } catch (error) {
    loadError = error instanceof Error ? error.message : "Could not load the brief.";
  }

  return (
    <section>
      <h1 className="text-2xl font-semibold tracking-tight">Brief</h1>
      <p className="mt-3 max-w-xl text-muted-foreground">
        Pick who will be there. This lists what is already saved. It does not write a new summary.
      </p>
      {loadError ? <p className="mt-6 text-sm text-destructive">{loadError}</p> : null}
      {data && data.people.length === 0 ? (
        <p className="mt-6 text-sm text-muted-foreground">Name the speakers on a meeting first.</p>
      ) : null}
      {data && data.people.length > 0 ? (
        <BriefBoard people={data.people} commitments={data.commitments} decisions={data.decisions} />
      ) : null}
    </section>
  );
}
