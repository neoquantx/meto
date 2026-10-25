import Link from "next/link";
import { RecoverBanner } from "@/components/recover-banner";
import { buttonVariants } from "@/components/ui/button";
import { formatDuration, formatTimestamp } from "@/lib/playback";
import {
  chunkItems,
  formatMeetingWhen,
  hasSearchWords,
  libraryGroups,
  meetingSourceLabel,
  meetingStatusLabel,
  readId,
  readLibraryMeeting,
  readTranscriptHit,
  searchQuery,
  type TranscriptHit,
} from "@/lib/library";
import { createAdminClient } from "@/lib/supabase/admin";
import { getUserOrThrow } from "@/lib/supabase/server";

const fieldClass =
  "h-8 min-w-0 flex-1 rounded-lg border bg-background px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

function firstQuery(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function MeetingsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string | string[] }>;
}) {
  const params = await searchParams;
  const query = searchQuery(firstQuery(params.q));
  const searching = hasSearchWords(query);
  const user = await getUserOrThrow();
  const admin = createAdminClient();

  const list = await admin
    .from("meetings")
    .select("id, title, recorded_at, status, duration_sec, source")
    .eq("owner_id", user.id)
    .order("recorded_at", { ascending: false });

  if (list.error) {
    return (
      <section>
        <h1 className="text-2xl font-semibold tracking-tight">Meetings</h1>
        <p className="mt-3 text-sm text-destructive">{list.error.message}</p>
      </section>
    );
  }

  const meetings = (list.data ?? []).flatMap((row) => {
    const meeting = readLibraryMeeting(row);
    return meeting ? [meeting] : [];
  });

  let titleMatchIds = new Set<string>();
  const hits: TranscriptHit[] = [];
  let searchError: string | null = null;
  if (searching) {
    const titleSearch = await admin
      .from("meetings")
      .select("id")
      .eq("owner_id", user.id)
      .textSearch("title", query, { type: "plain", config: "simple" });
    if (titleSearch.error) searchError = titleSearch.error.message;
    else titleMatchIds = new Set((titleSearch.data ?? []).flatMap((row) => {
      const id = readId(row);
      return id ? [id] : [];
    }));

    const ids = meetings.map((meeting) => meeting.id);
    for (const group of chunkItems(ids, 80)) {
      if (hits.length >= 200) break;
      const found = await admin
        .from("segments")
        .select("meeting_id, idx, start_ms, text")
        .in("meeting_id", group)
        .textSearch("tsv", query, { type: "plain", config: "simple" })
        .order("start_ms", { ascending: true })
        .limit(200);
      if (found.error) {
        searchError = found.error.message;
        break;
      }
      for (const row of found.data ?? []) {
        const hit = readTranscriptHit(row);
        if (hit) hits.push(hit);
        if (hits.length >= 200) break;
      }
    }
  }

  const groups = searching
    ? libraryGroups({ meetings, hits, titleMatchIds, query })
    : [];

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
      <form className="mt-6 flex flex-wrap gap-2" action="/meetings" method="get">
        <label className="sr-only" htmlFor="meeting-search">
          Search titles and transcripts
        </label>
        <input
          id="meeting-search"
          className={fieldClass}
          name="q"
          defaultValue={query}
          placeholder="Search titles and transcripts"
          maxLength={200}
        />
        <button className={buttonVariants()} type="submit">
          Search
        </button>
        {query ? (
          <Link href="/meetings" className={buttonVariants({ variant: "outline" })}>
            Clear
          </Link>
        ) : null}
      </form>
      {query && !searching ? (
        <p className="mt-4 text-sm text-muted-foreground">Enter a word to search.</p>
      ) : null}
      {searchError ? <p className="mt-4 text-sm text-destructive">{searchError}</p> : null}
      {!searching && meetings.length === 0 ? (
        <p className="mt-6 max-w-lg text-sm text-muted-foreground">
          No meetings yet. Record one and it will show up here.
        </p>
      ) : null}
      {searching && !searchError && groups.length === 0 ? (
        <p className="mt-6 text-sm text-muted-foreground">No meetings match that search.</p>
      ) : null}
      {!searching ? (
        <ul className="mt-6 space-y-3">
          {meetings.map((meeting) => (
            <li key={meeting.id}>
              <MeetingLine meeting={meeting} />
            </li>
          ))}
        </ul>
      ) : (
        <ul className="mt-6 space-y-4">
          {groups.map((group) => (
            <li key={group.meeting.id} className="rounded-lg border p-3">
              <MeetingLine meeting={group.meeting} />
              {group.titleMatch ? <p className="mt-2 text-xs text-muted-foreground">Title match</p> : null}
              {group.snippets.length > 0 ? (
                <ul className="mt-2 space-y-1">
                  {group.snippets.map((snippet) => (
                    <li key={`${snippet.idx}-${snippet.startMs}`}>
                      <Link
                        className="text-sm text-muted-foreground underline-offset-4 hover:underline"
                        href={snippet.href}
                      >
                        {formatTimestamp(snippet.startMs)} · {snippet.text}
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : null}
              {group.extra > 0 ? (
                <p className="mt-2 text-xs text-muted-foreground">
                  {group.extra} more {group.extra === 1 ? "match" : "matches"} in this meeting
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function MeetingLine({
  meeting,
}: {
  meeting: {
    id: string;
    title: string;
    recordedAt: string;
    status: string;
    durationSec: number | null;
    source: string;
  };
}) {
  return (
    <div>
      <Link className="font-medium underline-offset-4 hover:underline" href={`/meetings/${meeting.id}`}>
        {meeting.title}
      </Link>
      <p className="mt-1 text-sm text-muted-foreground">
        {formatMeetingWhen(meeting.recordedAt)}
        {" · "}
        {meetingSourceLabel(meeting.source)}
        {meeting.durationSec ? ` · ${formatDuration(meeting.durationSec)}` : ""}
        {meeting.status !== "ready" ? ` · ${meetingStatusLabel(meeting.status)}` : ""}
      </p>
    </div>
  );
}
