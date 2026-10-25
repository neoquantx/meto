"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Headphones, Radio, ScrollText } from "lucide-react";
import { EvidencePanel, SpeakerPanel } from "@/components/meeting-panels";
import type { OffRecordRange } from "@/lib/capture-limits";
import {
  ownerLabel,
  type ChapterRow,
  type CommitmentRow,
  type DecisionRow,
  type SpeakerRow,
  type TranscriptSegment,
} from "@/lib/meeting-view";
import { activeSegmentAt, formatTimestamp } from "@/lib/playback";
import { buildTranscriptMarkers } from "@/lib/transcript-gaps";

function openingMoment(segments: TranscriptSegment[], startAtMs: number | null, startLine: number | null) {
  if (startAtMs == null && startLine == null) return null;
  const fromLine = startLine == null ? undefined : segments.find((segment) => segment.idx === startLine);
  const ms = startAtMs ?? fromLine?.start_ms;
  if (ms == null) return null;
  const idx = startLine ?? activeSegmentAt(segments, ms);
  return { ms, idx };
}

export function MeetingRoom({
  meetingId,
  playbackUrl,
  video,
  segments,
  pauses,
  speakers,
  ledgerChecked,
  startAtMs,
  startLine,
  speechChecked,
  ready,
  tldr,
  chapters,
  decisions,
  commitments,
  droppedCount,
  readOnly = false,
}: {
  meetingId: string;
  playbackUrl: string | null;
  video: boolean;
  segments: TranscriptSegment[];
  pauses: OffRecordRange[];
  speakers: SpeakerRow[];
  ledgerChecked: boolean;
  startAtMs: number | null;
  startLine: number | null;
  speechChecked: boolean;
  ready: boolean;
  tldr: string[];
  chapters: ChapterRow[];
  decisions: DecisionRow[];
  commitments: CommitmentRow[];
  droppedCount: number;
  readOnly?: boolean;
}) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const listRef = useRef<HTMLOListElement | null>(null);
  const rowRefs = useRef(new Map<number, HTMLLIElement>());
  const ordered = useMemo(
    () => [...segments].sort((a, b) => a.start_ms - b.start_ms || a.idx - b.idx),
    [segments],
  );
  const opening = useMemo(() => openingMoment(ordered, startAtMs, startLine), [ordered, startAtMs, startLine]);
  const [active, setActive] = useState<number | null>(opening?.idx ?? null);
  const [follow, setFollow] = useState(true);
  const pendingMs = useRef<number | null>(opening?.ms ?? null);
  const jumped = useRef(false);
  const markers = useMemo(() => buildTranscriptMarkers(ordered, pauses), [ordered, pauses]);
  const byIdx = useMemo(() => new Map(ordered.map((segment) => [segment.idx, segment])), [ordered]);
  const nameBySpeaker = useMemo(() => {
    const names = new Map<number, string | null>();
    for (const speaker of speakers) names.set(speaker.speaker, speaker.name);
    return names;
  }, [speakers]);
  const showSide = speakers.length > 0 || ready;

  function media() {
    return video ? videoRef.current : audioRef.current;
  }

  function scrollRow(idx: number | null) {
    if (idx == null) return;
    const row = rowRefs.current.get(idx);
    const container = listRef.current;
    if (!row || !container) return;
    const top = row.offsetTop;
    const bottom = top + row.offsetHeight;
    const viewBottom = container.scrollTop + container.clientHeight;
    if (top < container.scrollTop) container.scrollTop = top;
    else if (bottom > viewBottom) container.scrollTop = bottom - container.clientHeight;
  }

  function scrollTo(idx: number | null) {
    window.requestAnimationFrame(() => scrollRow(idx));
  }

  function syncFromMedia() {
    const element = media();
    if (!element) return;
    const idx = activeSegmentAt(ordered, element.currentTime * 1000);
    setActive((current) => (current === idx ? current : idx));
  }

  useEffect(() => {
    if (!follow) return;
    scrollRow(active);
  }, [active, follow]);

  useEffect(() => {
    if (jumped.current || !opening) return;
    jumped.current = true;
    pendingMs.current = opening.ms;
    const element = video ? videoRef.current : audioRef.current;
    if (!element || element.readyState < 1) return;
    pendingMs.current = null;
    element.currentTime = Math.max(0, opening.ms) / 1000;
  }, [opening, video]);

  function onLoadedMetadata() {
    const ms = pendingMs.current;
    if (ms == null) return;
    pendingMs.current = null;
    const element = video ? videoRef.current : audioRef.current;
    if (element) element.currentTime = Math.max(0, ms) / 1000;
  }

  function seek(ms: number, segmentIdx?: number) {
    const element = media();
    if (element && Number.isFinite(ms)) element.currentTime = Math.max(0, ms) / 1000;
    const idx = segmentIdx ?? activeSegmentAt(ordered, ms);
    setActive(idx);
    scrollTo(idx);
    if (typeof window !== "undefined" && Number.isFinite(ms)) {
      const url = new URL(window.location.href);
      url.searchParams.set("t", String(Math.max(0, Math.floor(ms))));
      if (idx != null) url.searchParams.set("line", String(idx));
      else url.searchParams.delete("line");
      window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
    }
  }

  return (
    <div className={showSide ? "grid items-start gap-6 xl:grid-cols-[minmax(0,1.05fr)_minmax(22rem,0.95fr)] xl:gap-8" : undefined}>
      <div className="min-w-0">
        {playbackUrl ? (
          <div className="surface overflow-hidden p-3 sm:p-4">
            {video ? (
              <video
                ref={videoRef}
                controls
                playsInline
                preload="metadata"
                src={playbackUrl}
                className="aspect-video w-full rounded-xl bg-slate-950"
                onTimeUpdate={syncFromMedia}
                onSeeked={syncFromMedia}
                onLoadedMetadata={onLoadedMetadata}
              />
            ) : (
              <div className="rounded-xl bg-gradient-to-br from-slate-900 to-indigo-950 p-4 sm:p-5">
                <div className="mb-4 flex items-center gap-3 text-white">
                  <span className="grid size-10 place-items-center rounded-xl bg-white/10">
                    <Headphones className="size-5" aria-hidden="true" />
                  </span>
                  <div>
                    <p className="text-sm font-semibold">Meeting audio</p>
                    <p className="text-xs text-white/55">Click transcript lines to seek</p>
                  </div>
                </div>
                <audio
                  ref={audioRef}
                  controls
                  preload="metadata"
                  src={playbackUrl}
                  className="h-10 w-full"
                  onTimeUpdate={syncFromMedia}
                  onSeeked={syncFromMedia}
                  onLoadedMetadata={onLoadedMetadata}
                />
              </div>
            )}
          </div>
        ) : (
          <div className="surface-muted flex items-center gap-3 p-4 text-sm text-muted-foreground">
            <Radio className="size-5 shrink-0" aria-hidden="true" />
            <div>
              <p className="font-medium text-foreground">Transcript preview</p>
              <p>Audio is unavailable in the built-in demo. Every timestamp remains interactive.</p>
            </div>
          </div>
        )}

        {segments.length > 0 ? (
          <section className="surface mt-5 overflow-hidden">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 px-4 pt-4 sm:px-5 sm:pt-5">
                <ScrollText className="size-4 text-primary" aria-hidden="true" />
                <h2 className="font-semibold">Transcript</h2>
              </div>
              <label className="mr-4 mt-4 flex items-center gap-2 text-xs font-medium text-muted-foreground sm:mr-5 sm:mt-5">
                <input
                  type="checkbox"
                  checked={follow}
                  onChange={(event) => setFollow(event.target.checked)}
                  className="size-4 accent-primary"
                />
                Follow playback
              </label>
            </div>
            <ol
              ref={listRef}
              className="relative mt-3 max-h-[32rem] space-y-1 overflow-y-auto border-t border-border/70 p-2 sm:p-3"
            >
              {markers.map((marker) => {
                if (marker.kind === "segment") {
                  const segment = byIdx.get(marker.idx);
                  if (!segment) return null;
                  const current = active === segment.idx;
                  return (
                    <li
                      key={`segment-${segment.idx}`}
                      id={`segment-${segment.idx}`}
                      ref={(node) => {
                        if (node) rowRefs.current.set(segment.idx, node);
                        else rowRefs.current.delete(segment.idx);
                      }}
                    >
                      <button
                        type="button"
                        aria-current={current ? "true" : undefined}
                        className={`w-full rounded-xl px-3 py-3 text-left transition-colors ${current ? "bg-primary/9 text-accent-foreground ring-1 ring-primary/15" : "hover:bg-muted/80"}`}
                        onClick={() => seek(segment.start_ms, segment.idx)}
                      >
                        <span className="flex items-center gap-2 text-xs">
                          <span className="rounded-md bg-primary/8 px-1.5 py-0.5 font-mono font-medium text-primary">
                            {formatTimestamp(segment.start_ms)}
                          </span>
                          <span className="font-semibold text-foreground/75">
                            {ownerLabel(nameBySpeaker.get(segment.speaker), segment.speaker)}
                          </span>
                        </span>
                        <span className="mt-2 block text-sm leading-6 break-words">{segment.text}</span>
                      </button>
                    </li>
                  );
                }

                const at = marker.kind === "gap" ? marker.start_ms : marker.at_ms;
                return (
                  <li key={`${marker.kind}-${at}`}>
                    <button
                      type="button"
                      className="w-full rounded-xl border border-dashed border-border px-3 py-2.5 text-left text-xs text-muted-foreground hover:border-primary/30 hover:bg-muted"
                      onClick={() => seek(at)}
                    >
                      {formatTimestamp(at)} · {marker.label}
                    </button>
                  </li>
                );
              })}
            </ol>
          </section>
        ) : null}
        {speechChecked && segments.length === 0 ? (
          <p className="mt-6 text-sm text-muted-foreground">No speech was detected.</p>
        ) : null}
      </div>

      {showSide ? (
        <div className="min-w-0 space-y-5">
          {speakers.length > 0 ? (
            <div className="surface p-4 sm:p-5">
              <SpeakerPanel
                key={speakers.map((speaker) => speaker.speaker).join(",")}
                meetingId={meetingId}
                speakers={speakers}
                ledgerChecked={ledgerChecked}
                readOnly={readOnly}
              />
            </div>
          ) : null}
          {ready ? (
            <div className="surface p-4 sm:p-5 lg:p-6">
              <EvidencePanel
                meetingId={meetingId}
                tldr={tldr}
                chapters={chapters}
                decisions={decisions}
                commitments={commitments}
                droppedCount={droppedCount}
                onSeek={seek}
                readOnly={readOnly}
              />
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
