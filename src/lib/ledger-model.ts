import { ApiError, GoogleGenAI, Type, type Schema } from "@google/genai";
import { buildTranscript } from "@/lib/extract";
import { QUOTA_MESSAGE } from "@/lib/extraction-messages";
import {
  LEDGER_UNUSABLE,
  LedgerError,
  buildLedgerContents,
  parseLedger,
  type LedgerPromptItem,
} from "@/lib/ledger";
import type { EvidenceSegment } from "@/lib/verify";

const RULES = `You compare open commitments with a later meeting's transcript. Use only the transcript.

Return one result for every commitment id.
- done: the transcript says that commitment was finished. quote is verbatim proof.
- in_progress: the transcript says the work has started or is unfinished. quote is verbatim proof.
- changed: the commitment's date, scope, or owner changed. quote is verbatim proof. note says what changed, in the summary language.
- not_mentioned: this commitment is not discussed. quote, segment_idx, and note are null.

Be conservative. If you are unsure, use not_mentioned.
quote is copied verbatim, in its original language and script. Do not translate or tidy it.
segment_idx is the S number of the line the quote comes from.
Copy commitment_id exactly. Do not invent quotes or commitments.`;

const statusSchema: Schema = {
  type: Type.STRING,
  format: "enum",
  enum: ["done", "in_progress", "changed", "not_mentioned"],
};

const ledgerResponseSchema: Schema = {
  type: Type.OBJECT,
  required: ["results"],
  properties: {
    results: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        required: ["commitment_id", "status", "quote", "segment_idx", "note"],
        properties: {
          commitment_id: { type: Type.STRING },
          status: statusSchema,
          quote: { type: Type.STRING, nullable: true },
          segment_idx: { type: Type.INTEGER, nullable: true },
          note: { type: Type.STRING, nullable: true },
        },
      },
    },
  },
};

const FALLBACK_FLASH_MODELS = ["gemini-3.6-flash", "gemini-3.5-flash"];

export async function requestLedger(input: {
  apiKey: string;
  model: string;
  summaryLanguage: string;
  segments: EvidenceSegment[];
  candidates: LedgerPromptItem[];
}) {
  const ai = new GoogleGenAI({ apiKey: input.apiKey });
  const contents = buildLedgerContents(
    buildTranscript(input.segments, input.summaryLanguage),
    input.candidates,
  );
  const models = [input.model, ...FALLBACK_FLASH_MODELS.filter((m) => m !== input.model)];
  let text: string | undefined;
  let lastError: unknown;

  for (let i = 0; i < models.length; i += 1) {
    const model = models[i]!;
    const isPrimary = i === 0;
    try {
      const response = await ai.models.generateContent({
        model,
        contents,
        config: {
          systemInstruction: RULES,
          temperature: 0,
          maxOutputTokens: 8192,
          responseMimeType: "application/json",
          responseSchema: ledgerResponseSchema,
          ...(model.toLowerCase().includes("flash") ? { thinkingConfig: { thinkingBudget: 0 } } : {}),
          httpOptions: { timeout: isPrimary && models.length > 1 ? 15_000 : 45_000 },
        },
      });
      text = response.text;
      break;
    } catch (error) {
      lastError = error;
      const status = statusCode(error);
      const msg = error instanceof Error ? error.message : "";
      const retryable =
        status === 404 ||
        status === 503 ||
        status === 504 ||
        status === 0 ||
        /UNAVAILABLE|high demand|no longer available|aborted|timeout|fetch failed/i.test(msg);
      if (!retryable || i === models.length - 1) {
        throw asLedgerError(error);
      }
      console.warn(`Gemini model ${model} unavailable (${status || "timeout"}), falling back to ${models[i + 1]}.`);
    }
  }
  if (!text) throw lastError ? asLedgerError(lastError) : new LedgerError(LEDGER_UNUSABLE, 502, "model");
  try {
    return parseLedger(text);
  } catch (error) {
    if (error instanceof LedgerError) console.warn("Ledger JSON failed validation.");
    throw error;
  }
}

function statusCode(error: unknown) {
  if (error instanceof ApiError) return error.status;
  if (error && typeof error === "object" && "status" in error && typeof error.status === "number") {
    return error.status;
  }
  return 0;
}

function asLedgerError(error: unknown) {
  if (error instanceof LedgerError) return error;
  const status = statusCode(error);
  const message = error instanceof Error ? error.message : "";
  if (status === 429 || /RESOURCE_EXHAUSTED|quota exceeded|\b429\b/i.test(message)) {
    return new LedgerError(QUOTA_MESSAGE, 429, "quota");
  }
  const clipped = message.replace(/\s+/g, " ").trim().slice(0, 240);
  return new LedgerError(
    clipped ? `Ledger check failed. ${clipped}` : LEDGER_UNUSABLE,
    status >= 400 && status < 600 ? status : 502,
    "model",
  );
}
