"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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
  }

  return (
    <div className={showSide ? "grid items-start gap-8 lg:grid-cols-2" : undefined}>
      <div className="min-w-0">
        {playbackUrl ? (
          video ? (
            <video
              ref={videoRef}
              controls
              playsInline
              preload="metadata"
              src={playbackUrl}
              className="w-full rounded-lg"
              onTimeUpdate={syncFromMedia}
              onSeeked={syncFromMedia}
              onLoadedMetadata={onLoadedMetadata}
            />
          ) : (
            <audio
              ref={audioRef}
              controls
              preload="metadata"
              src={playbackUrl}
              className="w-full"
              onTimeUpdate={syncFromMedia}
              onSeeked={syncFromMedia}
              onLoadedMetadata={onLoadedMetadata}
            />
          )
        ) : (
          <p className="text-sm text-muted-foreground">Playback is unavailable.</p>
        )}

        {segments.length > 0 ? (
          <div className="mt-6">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-lg font-medium">Transcript</h2>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={follow}
                  onChange={(event) => setFollow(event.target.checked)}
                />
                Follow playback
              </label>
            </div>
            <ol
              ref={listRef}
              className="relative mt-3 max-h-[28rem] space-y-1 overflow-y-auto rounded-lg border p-2"
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
                        className={`w-full rounded-md px-2 py-2 text-left ${current ? "bg-accent text-accent-foreground" : "hover:bg-muted"}`}
                        onClick={() => seek(segment.start_ms, segment.idx)}
                      >
                        <span className="text-xs text-muted-foreground">
                          {formatTimestamp(segment.start_ms)} · {ownerLabel(nameBySpeaker.get(segment.speaker), segment.speaker)}
                        </span>
                        <span className="mt-1 block text-sm break-words">{segment.text}</span>
                      </button>
                    </li>
                  );
                }

                const at = marker.kind === "gap" ? marker.start_ms : marker.at_ms;
                return (
                  <li key={`${marker.kind}-${at}`}>
                    <button
                      type="button"
                      className="w-full rounded-md px-2 py-2 text-left text-xs text-muted-foreground hover:bg-muted"
                      onClick={() => seek(at)}
                    >
                      {formatTimestamp(at)} · {marker.label}
                    </button>
                  </li>
                );
              })}
            </ol>
          </div>
        ) : null}
        {speechChecked && segments.length === 0 ? (
          <p className="mt-6 text-sm text-muted-foreground">No speech was detected.</p>
        ) : null}
      </div>

      {showSide ? (
        <div className="min-w-0 space-y-8">
          {speakers.length > 0 ? (
            <SpeakerPanel
              key={speakers.map((speaker) => speaker.speaker).join(",")}
              meetingId={meetingId}
              speakers={speakers}
              ledgerChecked={ledgerChecked}
              readOnly={readOnly}
            />
          ) : null}
          {ready ? (
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
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
