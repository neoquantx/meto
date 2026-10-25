import Link from "next/link";
import { cn } from "cn";
import { loadLedgerList } from "@/lib/ledger-data";
import {
  LEDGER_FILTERS,
  evidenceHref,
  formatLedgerDate,
  groupLedger,
  ledgerStatusLabel,
  parseLedgerFilter,
} from "@/lib/ledger-view";
import { kindLabel } from "@/lib/meeting-view";
import { formatTimestamp } from "@/lib/playback";
import { createAdminClient } from "@/lib/supabase/admin";
import { getUserOrThrow } from "@/lib/supabase/server";

export default async function LedgerPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string | string[] }>;
}) {
  const query = await searchParams;
  const raw = Array.isArray(query.status) ? query.status[0] : query.status;
  const filter = parseLedgerFilter(raw);
  const user = await getUserOrThrow();
  const admin = createAdminClient();

  let items: Awaited<ReturnType<typeof loadLedgerList>> = [];
  let loadError: string | null = null;
  try {
    items = await loadLedgerList(admin, user.id);
  } catch (error) {
    loadError = error instanceof Error ? error.message : "Could not load the ledger.";
  }

  const groups = groupLedger(items, filter);
  const hasAny = items.some((item) => item.review !== "rejected" && item.kind !== "suggestion");

  return (
    <section>
      <h1 className="text-2xl font-semibold tracking-tight">Ledger</h1>
      <p className="mt-3 max-w-xl text-muted-foreground">
        Promises by person. A meeting only updates promises from earlier dates.
      </p>
      <nav className="mt-6 flex flex-wrap gap-1" aria-label="Status">
        {LEDGER_FILTERS.map(([status, label]) => {
          const active = status === filter;
          return (
            <Link
              key={status}
              href={status === "all" ? "/ledger" : `/ledger?status=${status}`}
              aria-current={active ? "page" : undefined}
              className={cn(
                "rounded-md px-2.5 py-1.5 text-sm",
                active
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              {label}
            </Link>
          );
        })}
      </nav>
      {loadError ? <p className="mt-6 text-sm text-destructive">{loadError}</p> : null}
      {!loadError && !hasAny ? (
        <p className="mt-6 max-w-lg text-sm text-muted-foreground">
          Name the speakers on a meeting. The next meeting with those people marks each open promise.
        </p>
      ) : null}
      {!loadError && hasAny && groups.length === 0 ? (
        <p className="mt-6 text-sm text-muted-foreground">Nothing in this filter.</p>
      ) : null}
      <div className="mt-8 space-y-8">
        {groups.map((group) => (
          <section key={group.id}>
            <h2 className="text-lg font-medium">{group.label}</h2>
            <ul className="mt-3 space-y-3">
              {group.items.map((item) => (
                <li key={item.id} className="rounded-lg border p-3">
                  <p className="flex flex-wrap items-center gap-2 text-xs">
                    <span className="rounded-full border px-2 py-0.5">{ledgerStatusLabel(item.status)}</span>
                    <span className="rounded-full border px-2 py-0.5">{kindLabel(item.kind)}</span>
                    {item.dueDate ? <span className="text-muted-foreground">Due {item.dueDate}</span> : null}
                  </p>
                  <p className="mt-2 text-sm">{item.text}</p>
                  {item.changeNote ? <p className="mt-1 text-sm text-muted-foreground">{item.changeNote}</p> : null}
                  <Link
                    className="mt-2 block text-xs text-muted-foreground underline-offset-4 hover:underline"
                    href={evidenceHref(item.meetingId, item.startMs, item.segmentIdx)}
                  >
                    {item.meetingTitle}, {formatLedgerDate(item.recordedAt)} · {formatTimestamp(item.startMs)} · “
                    {item.quote}”
                  </Link>
                  {item.history.length > 0 ? (
                    <ul className="mt-2 space-y-1">
                      {item.history.map((event, index) => (
                        <li key={`${event.meetingId}-${index}`}>
                          <Link
                            className="text-xs text-muted-foreground underline-offset-4 hover:underline"
                            href={evidenceHref(event.meetingId, event.startMs, event.segmentIdx)}
                          >
                            {event.line}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </section>
  );
}
