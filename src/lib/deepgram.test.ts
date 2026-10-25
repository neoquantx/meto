import { describe, expect, it } from "vitest";
import {
  billedMinutes,
  buildListenUrl,
  deepgramFailureMessage,
  glossaryKeyterms,
  parseListenPayload,
  segmentsFromUtterances,
  shouldRetryWithoutKeyterms,
  speakerIds,
  transcribeAudio,
  type ListenFetcher,
} from "./deepgram";

const listenResponse = {
  metadata: { duration: 12.4 },
  results: {
    utterances: [
      { start: 1.5, end: 4.2, speaker: 1, transcript: "Pricing deck maine kal bhej diya tha." },
    ],
  },
};

describe("deepgram listen", () => {
  it("sends nova-3 multilingual diarization params and repeats keyterm", () => {
    const url = new URL(buildListenUrl(["Rahul", "pricing deck"]));
    expect(url.searchParams.get("model")).toBe("nova-3");
    expect(url.searchParams.get("language")).toBe("multi");
    expect(url.searchParams.get("diarize")).toBe("true");
    expect(url.searchParams.get("diarize_model")).toBeNull();
    expect(url.searchParams.get("utterances")).toBe("true");
    expect(url.searchParams.get("smart_format")).toBe("true");
    expect(url.searchParams.get("mip_opt_out")).toBe("true");
    expect(url.searchParams.getAll("keyterm")).toEqual(["Rahul", "pricing deck"]);
  });

  it("keeps the first 100 unique glossary terms", () => {
    const glossary = ["  Rahul ", "rahul", "", "  ", ...Array.from({ length: 120 }, (_, i) => `term ${i}`)];
    const terms = glossaryKeyterms(glossary);
    expect(terms[0]).toBe("Rahul");
    expect(terms.filter((term) => term.toLocaleLowerCase() === "rahul")).toHaveLength(1);
    expect(terms).toHaveLength(100);
    expect(glossaryKeyterms("nope")).toEqual([]);
  });

  it("turns utterances into timed speaker segments", () => {
    const parsed = parseListenPayload({
      metadata: { duration: 8 },
      results: {
        utterances: [
          { start: 3, end: 4, speaker: 0, transcript: "  later  " },
          { start: 0.2, end: 1, transcript: "no speaker" },
          { start: 5, end: 6, speaker: 2, transcript: "   " },
          { start: 1.25, end: 2, speaker: 1, transcript: "हैलो" },
        ],
      },
    });
    expect(segmentsFromUtterances(parsed.utterances)).toEqual([
      { idx: 0, speaker: 0, start_ms: 200, end_ms: 1000, text: "no speaker" },
      { idx: 1, speaker: 1, start_ms: 1250, end_ms: 2000, text: "हैलो" },
      { idx: 2, speaker: 0, start_ms: 3000, end_ms: 4000, text: "later" },
    ]);
    expect(speakerIds(segmentsFromUtterances(parsed.utterances))).toEqual([0, 1]);
  });

  it("preserves separate speaker labels from diarized utterances", () => {
    const segments = segmentsFromUtterances([
      { start: 0, end: 1, speaker: 0, transcript: "I am Himanshu." },
      { start: 1, end: 2, speaker: 1, transcript: "I am Rahul." },
    ]);

    expect(segments.map((segment) => segment.speaker)).toEqual([0, 1]);
    expect(speakerIds(segments)).toEqual([0, 1]);
  });

  it("bills the saved duration, then the heard duration", () => {
    expect(billedMinutes(90, 10)).toBe(1.5);
    expect(billedMinutes(null, 30)).toBe(0.5);
    expect(billedMinutes(0, null)).toBe(0);
  });

  it("retries once when Deepgram rejects keyterm", async () => {
    const calls: string[] = [];
    const warnings: string[] = [];
    const fetchImpl: ListenFetcher = async (url, init) => {
      calls.push(url);
      expect(init.headers.Authorization).toBe("Token secret");
      expect(JSON.parse(init.body)).toEqual({ url: "https://cdn.example/audio" });
      if (url.includes("keyterm=")) {
        return new Response(
          JSON.stringify({ err_msg: "keyterm is not supported when language is multi" }),
          { status: 400 },
        );
      }
      return new Response(JSON.stringify(listenResponse), { status: 200 });
    };

    const result = await transcribeAudio({
      apiKey: "secret",
      audioUrl: "https://cdn.example/audio",
      keyterms: ["Rahul"],
      fetchImpl,
      log: (message) => warnings.push(message),
    });

    expect(calls).toHaveLength(2);
    expect(calls[1]).not.toContain("keyterm=");
    expect(warnings[0]).toMatch(/keyterm/i);
    expect(result.utterances[0]?.transcript).toBe("Pricing deck maine kal bhej diya tha.");
    expect(result.durationSec).toBe(12.4);
  });

  it("does not retry a keyterm error when no terms were sent, or a server error", () => {
    expect(shouldRetryWithoutKeyterms(400, "bad keyterm", false)).toBe(false);
    expect(shouldRetryWithoutKeyterms(500, "keyterm exploded", true)).toBe(false);
    expect(shouldRetryWithoutKeyterms(400, "invalid audio url", true)).toBe(false);
    expect(deepgramFailureMessage(401, "{}")).toBe(
      "Transcription was rejected. Check the Deepgram key.",
    );
    expect(deepgramFailureMessage(429, "{}")).toBe(
      "The transcription quota was reached. Try again later.",
    );
  });
});
