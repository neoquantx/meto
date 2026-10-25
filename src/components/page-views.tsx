import Link from "next/link";
import { notFound } from "next/navigation";
import { cn } from "cn";
import {
  ArrowLeft,
  ArrowUpRight,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  CircleAlert,
  Clock3,
  FileAudio2,
  Inbox,
  Mic2,
  Plus,
  Search,
  Sparkles,
  Upload,
} from "lucide-react";
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
  "field min-w-0 flex-1";

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
      <section className="surface p-6 sm:p-8">
        <CircleAlert className="size-6 text-destructive" aria-hidden="true" />
        <h1 className="mt-4 text-2xl font-semibold tracking-tight">Meetings could not load</h1>
        <p className="mt-2 text-sm text-destructive">{loadError}</p>
      </section>
    );
  }

  const groups = searching
    ? libraryGroups({ meetings, hits, titleMatchIds, query, readOnly })
    : [];

  return (
    <section className="mx-auto w-full max-w-6xl">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="page-eyebrow">{readOnly ? "Product walkthrough" : "Your workspace"}</p>
          <h1 className="page-title">Meetings</h1>
          <p className="page-description">
            {readOnly ? (
              <>
              Three connected meetings between Himanshu and Rahul. Open a meeting or check the{" "}
              <Link href="/demo/ledger" className="font-medium text-primary underline underline-offset-4">
                Ledger
              </Link>{" "}
              to see how open promises are tracked across calls.
              </>
            ) : (
              "Record, revisit, and search every conversation from one place."
            )}
          </p>
        </div>
        {!readOnly ? (
          <Link href="/meetings/new" className={buttonVariants({ size: "lg" })}>
            <Plus className="size-4" aria-hidden="true" />
            New meeting
          </Link>
        ) : null}
      </div>
      {!readOnly ? (
        <div className="mt-6">
          <RecoverBanner />
        </div>
      ) : null}
      <form className="surface mt-7 flex gap-2 p-2" action={basePath} method="get">
        <label className="sr-only" htmlFor="meeting-search">
          Search titles and transcripts
        </label>
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <input
            id="meeting-search"
            className={`${fieldClass} border-transparent bg-transparent pl-10 shadow-none`}
            name="q"
            defaultValue={query}
            placeholder="Search titles and transcripts"
            maxLength={200}
          />
        </div>
        <button className={buttonVariants()} type="submit">
          <span className="hidden sm:inline">Search</span>
          <Search className="size-4 sm:hidden" aria-hidden="true" />
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
        <div className="surface mt-6 grid place-items-center px-6 py-16 text-center">
          <Inbox className="size-9 text-muted-foreground/60" aria-hidden="true" />
          <h2 className="mt-4 text-lg font-semibold">No meetings yet</h2>
          <p className="mt-2 max-w-sm text-sm leading-6 text-muted-foreground">
            {readOnly
              ? "No demo meetings have been added yet."
              : "Record or upload your first conversation. It will appear here once processing begins."}
          </p>
          {!readOnly ? (
            <Link href="/meetings/new" className={cn(buttonVariants(), "mt-5")}>
              <Plus className="size-4" aria-hidden="true" />
              Create meeting
            </Link>
          ) : null}
        </div>
      ) : null}
      {searching && !searchError && groups.length === 0 ? (
        <div className="surface mt-6 grid place-items-center px-6 py-12 text-center">
          <Search className="size-8 text-muted-foreground/60" aria-hidden="true" />
          <p className="mt-3 text-sm font-medium">No meetings match “{query}”</p>
          <Link href={basePath} className="mt-2 text-sm font-medium text-primary hover:underline">
            Clear search
          </Link>
        </div>
      ) : null}
      {!searching ? (
        <ul className="mt-6 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {meetings.map((meeting) => (
            <li key={meeting.id} className="surface group transition-[border-color,box-shadow,transform] hover:-translate-y-0.5 hover:border-primary/25 hover:shadow-lg">
              <MeetingLine meeting={meeting} readOnly={readOnly} />
            </li>
          ))}
        </ul>
      ) : (
        <ul className="mt-6 space-y-4">
          {groups.map((group) => (
            <li key={group.meeting.id} className="surface p-1">
              <MeetingLine meeting={group.meeting} readOnly={readOnly} />
              {group.titleMatch ? <p className="mx-4 mt-1 text-xs font-medium text-primary">Title match</p> : null}
              {group.snippets.length > 0 ? (
                <ul className="mx-2 mb-2 mt-2 space-y-1 border-t border-border/70 pt-2">
                  {group.snippets.map((snippet) => (
                    <li key={`${snippet.idx}-${snippet.startMs}`}>
                      <Link
                        className="flex items-start gap-2 rounded-lg px-2 py-2 text-sm leading-6 text-muted-foreground hover:bg-muted hover:text-foreground"
                        href={snippet.href}
                      >
                        <span className="mt-0.5 shrink-0 rounded-md bg-primary/8 px-1.5 py-0.5 font-mono text-[0.68rem] font-medium text-primary">
                          {formatTimestamp(snippet.startMs)}
                        </span>
                        <span className="break-words">{snippet.text}</span>
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
  const Icon = meeting.source === "mic" ? Mic2 : meeting.source === "upload" ? Upload : FileAudio2;
  return (
    <div className="relative flex min-h-34 flex-col p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <span className="grid size-10 place-items-center rounded-xl bg-primary/8 text-primary">
          <Icon className="size-4.5" aria-hidden="true" />
        </span>
        <span className="status-pill">
          {meeting.status === "ready" ? (
            <CheckCircle2 className="size-3 text-emerald-600" aria-hidden="true" />
          ) : null}
          {meetingStatusLabel(meeting.status)}
        </span>
      </div>
      <Link className="mt-5 pr-8 font-semibold tracking-[-0.01em] break-words after:absolute after:inset-0" href={href}>
        {meeting.title}
      </Link>
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <CalendarDays className="size-3.5" aria-hidden="true" />
          {formatMeetingWhen(meeting.recordedAt)}
        </span>
        {meeting.durationSec ? (
          <span className="flex items-center gap-1.5">
            <Clock3 className="size-3.5" aria-hidden="true" />
            {formatDuration(meeting.durationSec)}
          </span>
        ) : null}
        <span className="sr-only">{meetingSourceLabel(meeting.source)}</span>
      </div>
      <ChevronRight className="absolute bottom-5 right-5 size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary" aria-hidden="true" />
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
      <section className="mx-auto w-full max-w-7xl">
        <Link href="/demo/meetings" className="mb-6 inline-flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" aria-hidden="true" />
          Back to meetings
        </Link>
        <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="page-eyebrow">Meeting record</p>
            <h1 className="page-title break-words">{detail.title}</h1>
            <div className="mt-4 flex flex-wrap gap-2">
              <span className="status-pill"><Mic2 className="size-3" aria-hidden="true" />{source}</span>
              {detail.durationSec ? <span className="status-pill"><Clock3 className="size-3" aria-hidden="true" />{formatDuration(detail.durationSec)}</span> : null}
              <span className="status-pill"><CalendarDays className="size-3" aria-hidden="true" />{recordedLabel(detail.recordedAt)}</span>
            </div>
          </div>
          <Link href="/demo/meetings" className={buttonVariants({ variant: "outline", size: "lg" })}>
            All demo meetings
          </Link>
        </div>
        <div className="mt-8 lg:mt-10">
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
    <section className="mx-auto w-full max-w-7xl">
      <Link href="/meetings" className="mb-6 inline-flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden="true" />
        Back to meetings
      </Link>
      <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="page-eyebrow">Meeting record</p>
          <h1 className="page-title break-words">{meeting.title}</h1>
          <div className="mt-4 flex flex-wrap gap-2">
            <span className="status-pill"><FileAudio2 className="size-3" aria-hidden="true" />{source}</span>
            {meeting.duration_sec ? <span className="status-pill"><Clock3 className="size-3" aria-hidden="true" />{formatDuration(meeting.duration_sec)}</span> : null}
            <span className="status-pill"><CalendarDays className="size-3" aria-hidden="true" />{recordedLabel(meeting.recorded_at)}</span>
          </div>
        </div>
        {readOnly ? (
          <Link href="/demo/meetings" className={buttonVariants({ variant: "outline" })}>
            All demo meetings
          </Link>
        ) : (
          <Link href="/meetings/new" className={buttonVariants({ variant: "outline", size: "lg" })}>
            <Plus className="size-4" aria-hidden="true" />
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
    <section className="mx-auto w-full max-w-6xl">
      <p className="page-eyebrow">Follow-through</p>
      <h1 className="page-title">Commitment ledger</h1>
      <p className="page-description">
        Promises by person. A meeting only updates promises from earlier dates.
      </p>
      <nav className="mt-7 flex max-w-full gap-1 overflow-x-auto rounded-xl border border-border/70 bg-card/70 p-1 shadow-xs [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" aria-label="Status">
        {LEDGER_FILTERS.map(([status, label]) => {
          const active = status === filter;
          return (
            <Link
              key={status}
              href={status === "all" ? basePath : `${basePath}?status=${status}`}
              aria-current={active ? "page" : undefined}
              className={cn(
                "shrink-0 rounded-lg px-3.5 py-2 text-sm font-medium transition-colors",
                active
                  ? "bg-primary text-primary-foreground shadow-sm"
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
      <div className="mt-8 space-y-10">
        {groups.map((group) => (
          <section key={group.id}>
            <div className="flex items-center gap-3">
              <span className="grid size-9 place-items-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
                {group.label.slice(0, 1).toUpperCase()}
              </span>
              <div>
                <h2 className="font-semibold">{group.label}</h2>
                <p className="text-xs text-muted-foreground">{group.items.length} {group.items.length === 1 ? "commitment" : "commitments"}</p>
              </div>
            </div>
            <ul className="mt-4 grid gap-3 lg:grid-cols-2">
              {group.items.map((item) => (
                <li key={item.id} className="surface p-4 sm:p-5">
                  <p className="flex flex-wrap items-center gap-2 text-xs">
                    <span className="rounded-full border px-2 py-0.5">{ledgerStatusLabel(item.status)}</span>
                    <span className="rounded-full border px-2 py-0.5">{kindLabel(item.kind)}</span>
                    {item.dueDate ? <span className="text-muted-foreground">Due {item.dueDate}</span> : null}
                  </p>
                  <p className="mt-3 font-medium leading-6 break-words">{item.text}</p>
                  {item.condition ? (
                    <p className="mt-1 text-sm text-muted-foreground break-words">If {item.condition}</p>
                  ) : null}
                  {item.changeNote ? (
                    <p className="mt-1 text-sm text-muted-foreground break-words">{item.changeNote}</p>
                  ) : null}
                  <Link
                    className="surface-muted mt-4 flex items-start gap-2 p-3 text-xs leading-5 text-muted-foreground transition-colors hover:border-primary/25 hover:text-foreground"
                    href={evidenceHref(item.meetingId, item.startMs, item.segmentIdx, { readOnly })}
                  >
                    <ArrowUpRight className="mt-0.5 size-3.5 shrink-0 text-primary" aria-hidden="true" />
                    <span className="break-words">{item.meetingTitle}, {formatLedgerDate(item.recordedAt)} · {formatTimestamp(item.startMs)} · “{item.quote}”</span>
                  </Link>
                  {item.history.length > 0 ? (
                    <ul className="mt-3 space-y-2 border-l-2 border-primary/15 pl-3">
                      {item.history.map((event, index) => (
                        <li key={`${event.meetingId}-${index}`}>
                          <Link
                            className="text-xs leading-5 text-muted-foreground underline-offset-4 hover:text-primary hover:underline break-words"
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
    <section className="mx-auto w-full max-w-5xl">
      <p className="page-eyebrow">One source of truth</p>
      <h1 className="page-title">Decisions</h1>
      <p className="page-description">
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
      <ul className="mt-8 grid gap-3 md:grid-cols-2">
        {decisions.map((item) => (
          <li key={item.id} className="surface flex flex-col p-4 sm:p-5">
            <div className="flex items-center justify-between gap-3">
              <span className="grid size-9 place-items-center rounded-xl bg-primary/8 text-primary">
                <Sparkles className="size-4" aria-hidden="true" />
              </span>
            {item.review === "confirmed" ? (
                <span className="status-pill"><CheckCircle2 className="size-3 text-emerald-600" aria-hidden="true" />Confirmed</span>
            ) : null}
            </div>
            <p className="mt-4 font-medium leading-6 break-words">{item.text}</p>
            <Link
              className="surface-muted mt-5 flex items-start gap-2 p-3 text-xs leading-5 text-muted-foreground hover:border-primary/25 hover:text-foreground"
              href={evidenceHref(item.meetingId, item.startMs, item.segmentIdx, { readOnly })}
            >
              <ArrowUpRight className="mt-0.5 size-3.5 shrink-0 text-primary" aria-hidden="true" />
              <span className="break-words">{item.meetingTitle}, {formatLedgerDate(item.recordedAt)} · {formatTimestamp(item.startMs)} · “{item.quote}”</span>
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
    <section className="mx-auto w-full max-w-6xl">
      <p className="page-eyebrow">Before your next call</p>
      <h1 className="page-title">Pre-meeting brief</h1>
      <p className="page-description">
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
