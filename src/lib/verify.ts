import * as chrono from "chrono-node";

const QUOTE_TOKEN_MATCH = 0.85;
const MAX_TLDR = 3;
const MAX_TLDR_WORDS = 25;

export type EvidenceSegment = {
  idx: number;
  speaker: number;
  start_ms: number;
  text: string;
};

export type OwnerMode = "self" | "assigned" | "unclear";

export type ExtractionDraft = {
  tldr: string[];
  chapters: { title: string; segment_idx: number }[];
  decisions: { text: string; quote: string; segment_idx: number }[];
  commitments: {
    text: string;
    kind: "explicit" | "conditional" | "suggestion";
    condition: string | null;
    owner_mode: OwnerMode;
    acknowledged_segment_idx: number | null;
    due_phrase: string | null;
    quote: string;
    segment_idx: number;
  }[];
  speaker_name_hints: { speaker: number; name: string; segment_idx: number }[];
};

export type VerifiedDecision = {
  text: string;
  quote: string;
  segment_idx: number;
  start_ms: number;
};

export type VerifiedCommitment = {
  text: string;
  kind: "explicit" | "conditional" | "suggestion";
  condition: string | null;
  owner_speaker: number | null;
  due_phrase: string | null;
  due_date: string | null;
  quote: string;
  segment_idx: number;
  start_ms: number;
};

export type VerifiedChapter = {
  title: string;
  segment_idx: number;
  start_ms: number;
};

export type VerifiedExtraction = {
  tldr: string[];
  chapters: VerifiedChapter[];
  decisions: VerifiedDecision[];
  commitments: VerifiedCommitment[];
  speaker_name_hints: { speaker: number; name: string; segment_idx: number }[];
  dropped_count: number;
};

export function normalizeText(value: string) {
  return value
    .normalize("NFC")
    .toLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}]+/gu, " ")
    .trim();
}

export function quoteIsSupported(quote: string, segments: EvidenceSegment[], segmentIdx: number) {
  const normalizedQuote = normalizeText(quote);
  if (!normalizedQuote) return false;
  const byIdx = new Map(segments.map((segment) => [segment.idx, segment]));
  if (!byIdx.has(segmentIdx)) return false;

  const parts: string[] = [];
  for (let idx = segmentIdx - 1; idx <= segmentIdx + 1; idx += 1) {
    const segment = byIdx.get(idx);
    if (segment) parts.push(segment.text);
  }
  const windowText = normalizeText(parts.join(" "));
  if (windowText.includes(normalizedQuote)) return true;

  const quoteTokens = normalizedQuote.split(" ");
  const windowTokens = new Set(windowText.split(" ").filter(Boolean));
  let hits = 0;
  for (const token of quoteTokens) {
    if (windowTokens.has(token)) hits += 1;
  }
  return hits / quoteTokens.length >= QUOTE_TOKEN_MATCH;
}

export function resolveOwner(input: {
  mode: OwnerMode;
  segmentIdx: number;
  acknowledgedSegmentIdx: number | null;
  segments: EvidenceSegment[];
}) {
  const quoteSegment = input.segments.find((segment) => segment.idx === input.segmentIdx);
  if (!quoteSegment) return null;
  if (input.mode === "unclear") return null;
  if (input.mode === "self") return quoteSegment.speaker;

  const acknowledged = input.acknowledgedSegmentIdx;
  if (acknowledged == null) return null;
  if (acknowledged <= input.segmentIdx || acknowledged > input.segmentIdx + 3) return null;
  const acknowledgement = input.segments.find((segment) => segment.idx === acknowledged);
  if (!acknowledgement || acknowledgement.speaker === quoteSegment.speaker) return null;
  return acknowledgement.speaker;
}

export function resolveDueDate(input: {
  duePhrase: string | null;
  quote: string;
  recordedAt: Date;
}) {
  const phrase = input.duePhrase?.trim() ?? "";
  if (!phrase) return { due_phrase: null, due_date: null };
  const normalizedPhrase = normalizeText(phrase);
  if (!normalizedPhrase || !normalizeText(input.quote).includes(normalizedPhrase)) {
    return { due_phrase: null, due_date: null };
  }

  const parsed = chrono.parseDate(phrase, input.recordedAt, { forwardDate: true });
  if (!parsed) return { due_phrase: null, due_date: null };
  const month = String(parsed.getMonth() + 1).padStart(2, "0");
  const day = String(parsed.getDate()).padStart(2, "0");
  return { due_phrase: phrase, due_date: `${parsed.getFullYear()}-${month}-${day}` };
}

export function verifyExtraction(input: {
  extraction: ExtractionDraft;
  segments: EvidenceSegment[];
  recordedAt: Date;
}): VerifiedExtraction {
  const byIdx = new Map(input.segments.map((segment) => [segment.idx, segment]));
  let dropped = 0;

  const decisions: VerifiedDecision[] = [];
  for (const item of input.extraction.decisions) {
    const text = collapseSpaces(item.text);
    const quote = item.quote.trim();
    const segment = byIdx.get(item.segment_idx);
    if (!text || !quote || !segment || !quoteIsSupported(quote, input.segments, item.segment_idx)) {
      dropped += 1;
      continue;
    }
    decisions.push({
      text,
      quote,
      segment_idx: item.segment_idx,
      start_ms: segment.start_ms,
    });
  }

  const commitments: VerifiedCommitment[] = [];
  for (const item of input.extraction.commitments) {
    const text = collapseSpaces(item.text);
    const quote = item.quote.trim();
    const segment = byIdx.get(item.segment_idx);
    if (!text || !quote || !segment || !quoteIsSupported(quote, input.segments, item.segment_idx)) {
      dropped += 1;
      continue;
    }
    const due = resolveDueDate({
      duePhrase: item.due_phrase,
      quote,
      recordedAt: input.recordedAt,
    });
    commitments.push({
      text,
      kind: item.kind,
      condition: item.kind === "conditional" ? collapseSpaces(item.condition ?? "") || null : null,
      owner_speaker: resolveOwner({
        mode: item.owner_mode,
        segmentIdx: item.segment_idx,
        acknowledgedSegmentIdx: item.acknowledged_segment_idx,
        segments: input.segments,
      }),
      due_phrase: due.due_phrase,
      due_date: due.due_date,
      quote,
      segment_idx: item.segment_idx,
      start_ms: segment.start_ms,
    });
  }

  const chapters: VerifiedChapter[] = [];
  for (const chapter of input.extraction.chapters) {
    const title = collapseSpaces(chapter.title);
    const segment = byIdx.get(chapter.segment_idx);
    if (!title || !segment) continue;
    chapters.push({ title, segment_idx: chapter.segment_idx, start_ms: segment.start_ms });
  }

  const seenSpeakers = new Set<number>();
  const speaker_name_hints: VerifiedExtraction["speaker_name_hints"] = [];
  for (const hint of input.extraction.speaker_name_hints) {
    const name = collapseSpaces(hint.name);
    const segment = byIdx.get(hint.segment_idx);
    if (!name || !segment || segment.speaker !== hint.speaker || seenSpeakers.has(hint.speaker)) continue;
    if (!normalizeText(segment.text).includes(normalizeText(name))) continue;
    seenSpeakers.add(hint.speaker);
    speaker_name_hints.push({ speaker: hint.speaker, name, segment_idx: hint.segment_idx });
  }

  return {
    tldr: clipTldr(input.extraction.tldr),
    chapters,
    decisions,
    commitments,
    speaker_name_hints,
    dropped_count: dropped,
  };
}

function collapseSpaces(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

function clipTldr(lines: string[]) {
  const kept: string[] = [];
  for (const line of lines) {
    const text = collapseSpaces(line);
    if (!text || text.split(" ").length > MAX_TLDR_WORDS) continue;
    kept.push(text);
    if (kept.length === MAX_TLDR) break;
  }
  return kept;
}
