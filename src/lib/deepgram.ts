import { z } from "zod";

const MAX_KEYTERMS = 100;
const MAX_KEYTERM_LENGTH = 100;
const LISTEN_URL = "https://api.deepgram.com/v1/listen";
const DEFAULT_TIMEOUT_MS = 240_000;

const utteranceSchema = z.object({
  start: z.number(),
  end: z.number(),
  transcript: z.string(),
  speaker: z.number().nullish(),
});

const listenSchema = z.object({
  metadata: z
    .object({
      duration: z.number().nullish(),
    })
    .nullish(),
  results: z
    .object({
      utterances: z.array(utteranceSchema).nullish(),
    })
    .nullish(),
});

export class DeepgramError extends Error {
  status: number;
  code: string;

  constructor(message: string, status: number, code: string) {
    super(message);
    this.name = "DeepgramError";
    this.status = status;
    this.code = code;
  }
}

export type ListenUtterance = z.infer<typeof utteranceSchema>;

export type ListenResult = {
  utterances: ListenUtterance[];
  durationSec: number | null;
};

export type TranscriptSegment = {
  idx: number;
  speaker: number;
  start_ms: number;
  end_ms: number;
  text: string;
};

export type ListenFetcher = (
  url: string,
  init: {
    method: "POST";
    headers: Record<string, string>;
    body: string;
    signal: AbortSignal;
  },
) => Promise<Response>;

export function glossaryKeyterms(glossary: unknown) {
  if (!Array.isArray(glossary)) return [];
  const seen = new Set<string>();
  const terms: string[] = [];
  for (const item of glossary) {
    if (typeof item !== "string") continue;
    const term = item.trim().replace(/\s+/g, " ");
    if (!term) continue;
    const clipped = term.slice(0, MAX_KEYTERM_LENGTH);
    const key = clipped.toLocaleLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    terms.push(clipped);
    if (terms.length >= MAX_KEYTERMS) break;
  }
  return terms;
}

export function buildListenUrl(keyterms: string[]) {
  const url = new URL(LISTEN_URL);
  url.searchParams.set("model", "nova-3");
  url.searchParams.set("language", "multi");
  url.searchParams.set("diarize_model", "latest");
  url.searchParams.set("utterances", "true");
  url.searchParams.set("smart_format", "true");
  url.searchParams.set("mip_opt_out", "true");
  for (const term of keyterms) url.searchParams.append("keyterm", term);
  return url.toString();
}

export function shouldRetryWithoutKeyterms(status: number, raw: string, sentKeyterms: boolean) {
  if (!sentKeyterms || status < 400 || status >= 500) return false;
  return /keyterm/i.test(raw);
}

export function deepgramFailureMessage(status: number, raw: string) {
  if (status === 401 || status === 403) {
    return "Transcription was rejected. Check the Deepgram key.";
  }
  if (status === 402 || status === 429) {
    return "The transcription quota was reached. Try again later.";
  }

  let detail = "";
  try {
    const parsed = JSON.parse(raw) as { err_msg?: unknown; error?: unknown; message?: unknown };
    const candidate = parsed.err_msg ?? parsed.error ?? parsed.message;
    if (typeof candidate === "string") detail = candidate;
  } catch {
    detail = raw;
  }
  detail = detail.replace(/\s+/g, " ").trim().slice(0, 180);
  if (!detail || detail.startsWith("<")) return "Transcription failed. Try again.";
  return `Transcription failed. ${detail}`;
}

export function parseListenPayload(payload: unknown): ListenResult {
  const parsed = listenSchema.safeParse(payload);
  if (!parsed.success) {
    throw new DeepgramError("Deepgram returned an unexpected transcript.", 502, "deepgram");
  }
  const duration = parsed.data.metadata?.duration;
  return {
    utterances: parsed.data.results?.utterances ?? [],
    durationSec: typeof duration === "number" && Number.isFinite(duration) ? duration : null,
  };
}

export function segmentsFromUtterances(utterances: ListenUtterance[]): TranscriptSegment[] {
  const rows: Omit<TranscriptSegment, "idx">[] = [];
  for (const utterance of utterances) {
    const text = utterance.transcript.trim();
    if (!text) continue;
    if (!Number.isFinite(utterance.start) || !Number.isFinite(utterance.end)) continue;
    const startSec = Math.min(utterance.start, utterance.end);
    const endSec = Math.max(utterance.start, utterance.end);
    const startMs = Math.max(0, Math.round(startSec * 1000));
    const endMs = Math.max(startMs, Math.round(endSec * 1000));
    const speaker =
      utterance.speaker == null || !Number.isFinite(utterance.speaker) || utterance.speaker < 0
        ? 0
        : Math.round(utterance.speaker);
    rows.push({ speaker, start_ms: startMs, end_ms: endMs, text });
  }

  rows.sort((a, b) => a.start_ms - b.start_ms || a.end_ms - b.end_ms);
  return rows.map((row, idx) => ({ idx, ...row }));
}

export function speakerIds(segments: { speaker: number }[]) {
  return [...new Set(segments.map((segment) => segment.speaker))].sort((a, b) => a - b);
}

export function billedMinutes(durationSec: number | null, heardSec: number | null) {
  const seconds =
    durationSec != null && Number.isFinite(durationSec) && durationSec > 0 ? durationSec : heardSec;
  if (seconds == null || !Number.isFinite(seconds) || seconds <= 0) return 0;
  return Math.round((seconds / 60) * 1000) / 1000;
}

export async function transcribeAudio(options: {
  apiKey: string;
  audioUrl: string;
  keyterms: string[];
  fetchImpl?: ListenFetcher;
  timeoutMs?: number;
  log?: (message: string) => void;
}) {
  const fetchImpl = options.fetchImpl ?? fetch;
  const log = options.log ?? ((message: string) => console.warn(message));
  const first = await requestListen(fetchImpl, options, options.keyterms);
  if (first.ok) return first.result;

  if (shouldRetryWithoutKeyterms(first.status, first.raw, options.keyterms.length > 0)) {
    log("Deepgram rejected keyterm with language=multi; retrying without keyterms.");
    const second = await requestListen(fetchImpl, options, []);
    if (second.ok) return second.result;
    throw new DeepgramError(deepgramFailureMessage(second.status, second.raw), 502, "deepgram");
  }

  const status = first.status === 402 || first.status === 429 ? 429 : 502;
  throw new DeepgramError(deepgramFailureMessage(first.status, first.raw), status, "deepgram");
}

async function requestListen(
  fetchImpl: ListenFetcher,
  options: { apiKey: string; audioUrl: string; timeoutMs?: number },
  keyterms: string[],
) {
  const controller = new AbortController();
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  if (typeof timer.unref === "function") timer.unref();

  try {
    let response: Response;
    try {
      response = await fetchImpl(buildListenUrl(keyterms), {
        method: "POST",
        headers: {
          Authorization: `Token ${options.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ url: options.audioUrl }),
        signal: controller.signal,
      });
    } catch (error) {
      if (controller.signal.aborted) {
        throw new DeepgramError("Transcription timed out. Try again.", 504, "timeout");
      }
      if (error instanceof DeepgramError) throw error;
      throw new DeepgramError("Could not reach Deepgram. Try again.", 502, "deepgram");
    }

    const raw = await response.text();
    if (!response.ok) return { ok: false as const, status: response.status, raw: raw.slice(0, 2000) };

    let payload: unknown;
    try {
      payload = JSON.parse(raw);
    } catch {
      throw new DeepgramError("Deepgram returned an unexpected transcript.", 502, "deepgram");
    }
    return { ok: true as const, result: parseListenPayload(payload) };
  } finally {
    clearTimeout(timer);
  }
}
