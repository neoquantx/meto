import Link from "next/link";
import { notFound } from "next/navigation";
import { cn } from "cn";
import { BriefBoard } from "@/components/brief-board";
import { MeetingRoom } from "@/components/meeting-room";
import { RecoverBanner } from "@/components/recover-banner";
import { SharePanel } from "@/components/share-panel";
import { TranscriptionPanel } from "@/components/transcription-panel";
import { buttonVariants } from "@/components/ui/button";
import { parseOffRecordRanges } from "@/lib/capture-limits";
import {
  fallbackBriefData,
  fallbackDecisionList,
  fallbackLedgerList,
  fallbackLibraryData,
  fallbackMeetingDetail,
  isUuid,
} from "@/lib/demo";
import {
  loadBriefData,
  loadCommitmentHistory,
  loadDecisionList,
  loadLedgerList,
} from "@/lib/ledger-data";
import {
  LEDGER_FILTERS,
  evidenceHref,
  formatLedgerDate,
  groupLedger,
  ledgerStatusLabel,
  parseEvidenceQuery,
  parseLedgerFilter,
} from "@/lib/ledger-view";
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
  type LibraryMeeting,
  type TranscriptHit,
} from "@/lib/library";
import {
  kindLabel,
  parseChapters,
  parseTldr,
  readCommitment,
  readDecision,
  readPersonName,
  readSegment,
  readSpeaker,
  type CommitmentRow,
  type DecisionRow,
  type SpeakerRow,
  type TranscriptSegment,
} from "@/lib/meeting-view";
import { formatDuration, formatTimestamp } from "@/lib/playback";
import { readShareLink, sharePeople, type ShareLink } from "@/lib/share-view";
import { createAdminClient } from "@/lib/supabase/admin";

const fieldClass =
  "h-8 min-w-0 flex-1 rounded-lg border bg-background px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

const sourceLabel = {
  mic: "Microphone",
  tab: "Meeting tab",
  upload: "Upload",
} as const;

const WITH_TRANSCRIPT = new Set(["transcribed", "extracting", "ready", "failed"]);
const SPEECH_CHECKED = new Set(["transcribed", "extracting", "ready"]);

function rows<T>(data: unknown[] | null, read: (row: unknown) => T | null) {
  const parsed: T[] = [];
  for (const row of data ?? []) {
    const item = read(row);
    if (item) parsed.push(item);
  }
  return parsed;
}

function recordedLabel(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return `${date.toISOString().replace("T", " ").slice(0, 16)} UTC`;
}

function tryAdminClient() {
  try {
    return createAdminClient();
  } catch {
    return null;
  }
}

async function hasLiveDemoMeetings(
  admin: ReturnType<typeof createAdminClient> | null,
  ownerId: string | null,
) {
  if (!admin || !ownerId) return false;
  const { count, error } = await admin
    .from("meetings")
    .select("id", { count: "exact", head: true })
    .eq("owner_id", ownerId);
  if (error) return false;
  return (count ?? 0) > 0;
}

export async function MeetingsView({
  ownerId,
  queryRaw,
  readOnly = false,
}: {
  ownerId: string | null;
  queryRaw?: string;
  readOnly?: boolean;
}) {
  const query = searchQuery(queryRaw);
  const searching = hasSearchWords(query);
  const basePath = readOnly ? "/demo/meetings" : "/meetings";
  const admin = tryAdminClient();

  let meetings: LibraryMeeting[] = [];
  let titleMatchIds = new Set<string>();
  let hits: TranscriptHit[] = [];
  let searchError: string | null = null;
  let loadError: string | null = null;

  const useFallback = readOnly && !(await hasLiveDemoMeetings(admin, ownerId));

  if (useFallback) {
    const fallback = fallbackLibraryData(query);
    meetings = fallback.meetings;
    titleMatchIds = fallback.titleMatchIds;
    hits = fallback.hits;
  } else if (!admin || !ownerId) {
    loadError = "Supabase is not configured.";
  } else {
    const list = await admin
      .from("meetings")
      .select("id, title, recorded_at, status, duration_sec, source")
      .eq("owner_id", ownerId)
      .order("recorded_at", { ascending: false });

    if (list.error) {
      loadError = list.error.message;
    } else {
      meetings = (list.data ?? []).flatMap((row) => {
        const meeting = readLibraryMeeting(row);
        return meeting ? [meeting] : [];
      });

      if (searching) {
        const titleSearch = await admin
          .from("meetings")
          .select("id")
          .eq("owner_id", ownerId)
          .textSearch("title", query, { type: "plain", config: "simple" });
        if (titleSearch.error) searchError = titleSearch.error.message;
        else {
          titleMatchIds = new Set(
            (titleSearch.data ?? []).flatMap((row) => {
              const id = readId(row);
              return id ? [id] : [];
            }),
          );
        }

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
    }
  }

  if (loadError) {
    return (
      <section>
        <h1 className="text-2xl font-semibold tracking-tight">Meetings</h1>
        <p className="mt-3 text-sm text-destructive">{loadError}</p>
      </section>
    );
  }

  const groups = searching
    ? libraryGroups({ meetings, hits, titleMatchIds, query, readOnly })
    : [];

  return (
    <section>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Meetings</h1>
          {readOnly ? (
            <p className="mt-2 max-w-xl text-sm text-muted-foreground">
              Three connected meetings between Himanshu and Rahul. Open a meeting or check the{" "}
              <Link href="/demo/ledger" className="underline underline-offset-4">
                Ledger
              </Link>{" "}
              to see how open promises are tracked across calls.
            </p>
          ) : null}
        </div>
        {!readOnly ? (
          <Link href="/meetings/new" className={buttonVariants()}>
            New meeting
          </Link>
        ) : null}
      </div>
      {!readOnly ? (
        <div className="mt-6">
          <RecoverBanner />
        </div>
      ) : null}
      <form className="mt-6 flex flex-wrap gap-2" action={basePath} method="get">
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
          <Link href={basePath} className={buttonVariants({ variant: "outline" })}>
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
          {readOnly
            ? "No demo meetings have been added yet."
            : "No meetings yet. Record one and it will show up here."}
        </p>
      ) : null}
      {searching && !searchError && groups.length === 0 ? (
        <p className="mt-6 text-sm text-muted-foreground">No meetings match that search.</p>
      ) : null}
      {!searching ? (
        <ul className="mt-6 space-y-3">
          {meetings.map((meeting) => (
            <li key={meeting.id} className="rounded-lg border p-3">
              <MeetingLine meeting={meeting} readOnly={readOnly} />
            </li>
          ))}
        </ul>
      ) : (
        <ul className="mt-6 space-y-4">
          {groups.map((group) => (
            <li key={group.meeting.id} className="rounded-lg border p-3">
              <MeetingLine meeting={group.meeting} readOnly={readOnly} />
              {group.titleMatch ? <p className="mt-2 text-xs text-muted-foreground">Title match</p> : null}
              {group.snippets.length > 0 ? (
                <ul className="mt-2 space-y-1">
                  {group.snippets.map((snippet) => (
                    <li key={`${snippet.idx}-${snippet.startMs}`}>
                      <Link
                        className="text-sm text-muted-foreground underline-offset-4 hover:underline break-words"
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
  readOnly,
}: {
  meeting: LibraryMeeting;
  readOnly: boolean;
}) {
  const href = readOnly ? `/demo/meetings/${meeting.id}` : `/meetings/${meeting.id}`;
  return (
    <div>
      <Link className="font-medium underline-offset-4 hover:underline break-words" href={href}>
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

export async function MeetingDetailView({
  id,
  ownerId,
  t,
  line,
  readOnly = false,
}: {
  id: string;
  ownerId: string | null;
  t?: string;
  line?: string;
  readOnly?: boolean;
}) {
  if (!isUuid(id)) notFound();
  const seek = parseEvidenceQuery(t, line);
  const admin = tryAdminClient();
  const useFallback = readOnly && !(await hasLiveDemoMeetings(admin, ownerId));

  if (useFallback) {
    const detail = fallbackMeetingDetail(id);
    if (!detail) notFound();
    const source = sourceLabel[detail.source] ?? detail.source;
    return (
      <section>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight break-words">{detail.title}</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              {source}
              {detail.durationSec ? ` · ${formatDuration(detail.durationSec)}` : ""}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              Recorded {recordedLabel(detail.recordedAt)}
            </p>
          </div>
          <Link href="/demo/meetings" className={buttonVariants({ variant: "outline" })}>
            All demo meetings
          </Link>
        </div>
        <div className="mt-8">
          <MeetingRoom
            meetingId={detail.id}
            playbackUrl={detail.playbackUrl}
            video={detail.video}
            segments={detail.segments}
            pauses={detail.pauses}
            speakers={detail.speakers}
            ledgerChecked={detail.ledgerChecked}
            startAtMs={seek.startAtMs}
            startLine={seek.startLine}
            speechChecked
            ready
            tldr={detail.tldr}
            chapters={detail.chapters}
            decisions={detail.decisions}
            commitments={detail.commitments}
            droppedCount={detail.droppedCount}
            readOnly
          />
        </div>
      </section>
    );
  }

  if (!admin || !ownerId) {
    return (
      <section>
        <h1 className="text-2xl font-semibold tracking-tight">Meeting</h1>
        <p className="mt-3 text-sm text-destructive">Supabase is not configured.</p>
      </section>
    );
  }

  const { data: meeting, error } = await admin
    .from("meetings")
    .select(
      "id, title, status, error, recorded_at, duration_sec, source, mime_type, audio_path, off_record_ranges, dropped_count, tldr, chapters, ledger_checked_at",
    )
    .eq("id", id)
    .eq("owner_id", ownerId)
    .maybeSingle();

  if (error) {
    return (
      <section>
        <h1 className="text-2xl font-semibold tracking-tight">Meeting</h1>
        <p className="mt-3 text-sm text-destructive">{error.message}</p>
      </section>
    );
  }
  if (!meeting) notFound();

  let hasAudio = false;
  let playbackUrl: string | null = null;
  if (meeting.audio_path && meeting.status !== "created") {
    if (meeting.status === "failed") {
      const { data, error: infoError } = await admin.storage.from("audio").info(meeting.audio_path);
      hasAudio = !infoError && Boolean(data);
    } else {
      hasAudio = true;
    }
    if (hasAudio && meeting.audio_path) {
      const { data } = await admin.storage.from("audio").createSignedUrl(meeting.audio_path, 60 * 60);
      playbackUrl = data?.signedUrl ?? null;
    }
  }

  let segments: TranscriptSegment[] = [];
  let speakers: SpeakerRow[] = [];
  let loadError: string | null = null;
  if (WITH_TRANSCRIPT.has(meeting.status)) {
    const [segmentResult, speakerResult] = await Promise.all([
      admin
        .from("segments")
        .select("idx, speaker, start_ms, end_ms, text")
        .eq("meeting_id", id)
        .order("idx", { ascending: true }),
      admin
        .from("meeting_speakers")
        .select("speaker, person_id, name_hint, person:people(name)")
        .eq("meeting_id", id)
        .order("speaker", { ascending: true }),
    ]);
    if (segmentResult.error) loadError = segmentResult.error.message;
    else segments = rows(segmentResult.data, readSegment);
    if (speakerResult.error) loadError = speakerResult.error.message;
    else speakers = rows(speakerResult.data, readSpeaker);
  }

  let decisions: DecisionRow[] = [];
  let commitments: CommitmentRow[] = [];
  let shares: ShareLink[] = [];
  if (meeting.status === "ready") {
    const [decisionResult, commitmentResult, shareResult] = await Promise.all([
      admin
        .from("decisions")
        .select("id, text, quote, start_ms, segment_idx, review")
        .eq("meeting_id", id)
        .eq("owner_id", ownerId)
        .order("start_ms", { ascending: true }),
      admin
        .from("commitments")
        .select(
          "id, text, quote, kind, condition, due_date, change_note, start_ms, segment_idx, review, status, owner_speaker, owner:people(name)",
        )
        .eq("meeting_id", id)
        .eq("owner_id", ownerId)
        .order("start_ms", { ascending: true }),
      readOnly
        ? Promise.resolve({ data: [], error: null })
        : admin
            .from("shares")
            .select("token, person_id, person:people(name)")
            .eq("meeting_id", id)
            .eq("owner_id", ownerId)
            .eq("revoked", false),
    ]);
    if (decisionResult.error) loadError = decisionResult.error.message;
    else decisions = rows(decisionResult.data, readDecision);
    if (commitmentResult.error) loadError = commitmentResult.error.message;
    else commitments = rows(commitmentResult.data, readCommitment);
    if (shareResult.error) loadError = shareResult.error.message;
    else {
      shares = [];
      for (const row of shareResult.data ?? []) {
        const link = readShareLink(row, readPersonName((row as { person?: unknown }).person));
        if (link) shares.push(link);
      }
    }
    if (!loadError && commitments.length > 0) {
      try {
        const history = await loadCommitmentHistory(
          admin,
          commitments.map((item) => item.id),
        );
        commitments = commitments.map((item) => ({ ...item, history: history.get(item.id) ?? [] }));
      } catch (historyError) {
        loadError = historyError instanceof Error ? historyError.message : "Could not load ledger history.";
      }
    }
  }

  const ready = meeting.status === "ready";
  const showRoom = Boolean(playbackUrl) || segments.length > 0 || speakers.length > 0 || ready;
  const video = typeof meeting.mime_type === "string" && meeting.mime_type.startsWith("video/");
  const source = sourceLabel[meeting.source as keyof typeof sourceLabel] ?? meeting.source;

  return (
    <section>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight break-words">{meeting.title}</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {source}
            {meeting.duration_sec ? ` · ${formatDuration(meeting.duration_sec)}` : ""}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">Recorded {recordedLabel(meeting.recorded_at)}</p>
        </div>
        {readOnly ? (
          <Link href="/demo/meetings" className={buttonVariants({ variant: "outline" })}>
            All demo meetings
          </Link>
        ) : (
          <Link href="/meetings/new" className={buttonVariants({ variant: "outline" })}>
            New meeting
          </Link>
        )}
      </div>
      {!readOnly && ready ? (
        <div className="mt-8 max-w-2xl">
          <SharePanel
            meetingId={meeting.id}
            people={sharePeople(speakers)}
            shares={shares}
          />
        </div>
      ) : null}
      {meeting.status !== "ready" ? (
        <div className="mt-6 max-w-2xl">
          <TranscriptionPanel
            key={`${meeting.status}:${meeting.error ?? ""}`}
            meetingId={meeting.id}
            status={meeting.status}
            error={meeting.error}
            hasAudio={hasAudio}
            readOnly={readOnly}
          />
        </div>
      ) : null}
      {loadError ? <p className="mt-6 text-sm text-destructive">{loadError}</p> : null}
      {showRoom ? (
        <div className="mt-8">
          <MeetingRoom
            meetingId={meeting.id}
            playbackUrl={playbackUrl}
            video={video}
            segments={segments}
            pauses={parseOffRecordRanges(meeting.off_record_ranges)}
            speakers={speakers}
            ledgerChecked={Boolean(meeting.ledger_checked_at)}
            startAtMs={seek.startAtMs}
            startLine={seek.startLine}
            speechChecked={SPEECH_CHECKED.has(meeting.status) && !loadError}
            ready={ready}
            tldr={parseTldr(meeting.tldr)}
            chapters={parseChapters(meeting.chapters)}
            decisions={decisions}
            commitments={commitments}
            droppedCount={Number(meeting.dropped_count ?? 0)}
            readOnly={readOnly}
          />
        </div>
      ) : null}
    </section>
  );
}

export async function LedgerView({
  ownerId,
  statusRaw,
  readOnly = false,
}: {
  ownerId: string | null;
  statusRaw?: string;
  readOnly?: boolean;
}) {
  const filter = parseLedgerFilter(statusRaw);
  const basePath = readOnly ? "/demo/ledger" : "/ledger";
  const admin = tryAdminClient();
  const useFallback = readOnly && !(await hasLiveDemoMeetings(admin, ownerId));

  let items: Awaited<ReturnType<typeof loadLedgerList>> = [];
  let loadError: string | null = null;

  if (useFallback) {
    items = fallbackLedgerList();
  } else if (!admin || !ownerId) {
    loadError = "Supabase is not configured.";
  } else {
    try {
      items = await loadLedgerList(admin, ownerId);
    } catch (error) {
      loadError = error instanceof Error ? error.message : "Could not load the ledger.";
    }
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
              href={status === "all" ? basePath : `${basePath}?status=${status}`}
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
          {readOnly
            ? "No tracked promises in the demo yet."
            : "Name the speakers on a meeting. The next meeting with those people marks each open promise."}
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
                  <p className="mt-2 text-sm break-words">{item.text}</p>
                  {item.condition ? (
                    <p className="mt-1 text-sm text-muted-foreground break-words">If {item.condition}</p>
                  ) : null}
                  {item.changeNote ? (
                    <p className="mt-1 text-sm text-muted-foreground break-words">{item.changeNote}</p>
                  ) : null}
                  <Link
                    className="mt-2 block text-xs text-muted-foreground underline-offset-4 hover:underline break-words"
                    href={evidenceHref(item.meetingId, item.startMs, item.segmentIdx, { readOnly })}
                  >
                    {item.meetingTitle}, {formatLedgerDate(item.recordedAt)} · {formatTimestamp(item.startMs)} · “
                    {item.quote}”
                  </Link>
                  {item.history.length > 0 ? (
                    <ul className="mt-2 space-y-1">
                      {item.history.map((event, index) => (
                        <li key={`${event.meetingId}-${index}`}>
                          <Link
                            className="text-xs text-muted-foreground underline-offset-4 hover:underline break-words"
                            href={evidenceHref(event.meetingId, event.startMs, event.segmentIdx, { readOnly })}
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

export async function DecisionsView({
  ownerId,
  readOnly = false,
}: {
  ownerId: string | null;
  readOnly?: boolean;
}) {
  const admin = tryAdminClient();
  const useFallback = readOnly && !(await hasLiveDemoMeetings(admin, ownerId));

  let decisions: Awaited<ReturnType<typeof loadDecisionList>> = [];
  let loadError: string | null = null;

  if (useFallback) {
    decisions = fallbackDecisionList();
  } else if (!admin || !ownerId) {
    loadError = "Supabase is not configured.";
  } else {
    try {
      decisions = await loadDecisionList(admin, ownerId);
    } catch (error) {
      loadError = error instanceof Error ? error.message : "Could not load decisions.";
    }
  }

  return (
    <section>
      <h1 className="text-2xl font-semibold tracking-tight">Decisions</h1>
      <p className="mt-3 max-w-xl text-muted-foreground">
        Decisions from {readOnly ? "the demo" : "your"} meetings, each with the line it came from.
      </p>
      {loadError ? <p className="mt-6 text-sm text-destructive">{loadError}</p> : null}
      {!loadError && decisions.length === 0 ? (
        <p className="mt-6 text-sm text-muted-foreground">
          {readOnly
            ? "No decisions in the demo yet."
            : "Decisions show up here after a meeting is processed."}
        </p>
      ) : null}
      <ul className="mt-8 space-y-3">
        {decisions.map((item) => (
          <li key={item.id} className="rounded-lg border p-3">
            <p className="text-sm break-words">{item.text}</p>
            {item.review === "confirmed" ? (
              <p className="mt-1 text-xs text-muted-foreground">Confirmed</p>
            ) : null}
            <Link
              className="mt-2 block text-xs text-muted-foreground underline-offset-4 hover:underline break-words"
              href={evidenceHref(item.meetingId, item.startMs, item.segmentIdx, { readOnly })}
            >
              {item.meetingTitle}, {formatLedgerDate(item.recordedAt)} · {formatTimestamp(item.startMs)} · “{item.quote}”
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

export async function BriefView({
  ownerId,
  readOnly = false,
}: {
  ownerId: string | null;
  readOnly?: boolean;
}) {
  const admin = tryAdminClient();
  const useFallback = readOnly && !(await hasLiveDemoMeetings(admin, ownerId));

  let data: Awaited<ReturnType<typeof loadBriefData>> | null = null;
  let loadError: string | null = null;

  if (useFallback) {
    data = fallbackBriefData();
  } else if (!admin || !ownerId) {
    loadError = "Supabase is not configured.";
  } else {
    try {
      data = await loadBriefData(admin, ownerId);
    } catch (error) {
      loadError = error instanceof Error ? error.message : "Could not load the brief.";
    }
  }

  return (
    <section>
      <h1 className="text-2xl font-semibold tracking-tight">Brief</h1>
      <p className="mt-3 max-w-xl text-muted-foreground">
        Pick who will be there. This lists what is already saved. It does not write a new summary.
      </p>
      {loadError ? <p className="mt-6 text-sm text-destructive">{loadError}</p> : null}
      {data && data.people.length === 0 ? (
        <p className="mt-6 text-sm text-muted-foreground">
          {readOnly ? "No named people in the demo yet." : "Name the speakers on a meeting first."}
        </p>
      ) : null}
      {data && data.people.length > 0 ? (
        <BriefBoard
          people={data.people}
          commitments={data.commitments}
          decisions={data.decisions}
          readOnly={readOnly}
        />
      ) : null}
    </section>
  );
}
