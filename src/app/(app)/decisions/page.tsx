import Link from "next/link";
import { loadDecisionList } from "@/lib/ledger-data";
import { evidenceHref, formatLedgerDate } from "@/lib/ledger-view";
import { formatTimestamp } from "@/lib/playback";
import { createAdminClient } from "@/lib/supabase/admin";
import { getUserOrThrow } from "@/lib/supabase/server";

export default async function DecisionsPage() {
  const user = await getUserOrThrow();
  const admin = createAdminClient();
  let decisions: Awaited<ReturnType<typeof loadDecisionList>> = [];
  let loadError: string | null = null;
  try {
    decisions = await loadDecisionList(admin, user.id);
  } catch (error) {
    loadError = error instanceof Error ? error.message : "Could not load decisions.";
  }

  return (
    <section>
      <h1 className="text-2xl font-semibold tracking-tight">Decisions</h1>
      <p className="mt-3 max-w-xl text-muted-foreground">
        Decisions from your meetings, each with the line it came from.
      </p>
      {loadError ? <p className="mt-6 text-sm text-destructive">{loadError}</p> : null}
      {!loadError && decisions.length === 0 ? (
        <p className="mt-6 text-sm text-muted-foreground">Decisions show up here after a meeting is processed.</p>
      ) : null}
      <ul className="mt-8 space-y-3">
        {decisions.map((item) => (
          <li key={item.id} className="rounded-lg border p-3">
            <p className="text-sm">{item.text}</p>
            {item.review === "confirmed" ? (
              <p className="mt-1 text-xs text-muted-foreground">Confirmed</p>
            ) : null}
            <Link
              className="mt-2 block text-xs text-muted-foreground underline-offset-4 hover:underline"
              href={evidenceHref(item.meetingId, item.startMs, item.segmentIdx)}
            >
              {item.meetingTitle}, {formatLedgerDate(item.recordedAt)} · {formatTimestamp(item.startMs)} · “{item.quote}”
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
