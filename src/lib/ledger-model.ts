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

export async function requestLedger(input: {
  apiKey: string;
  model: string;
  summaryLanguage: string;
  segments: EvidenceSegment[];
  candidates: LedgerPromptItem[];
}) {
  const ai = new GoogleGenAI({ apiKey: input.apiKey });
  let text: string | undefined;
  try {
    const response = await ai.models.generateContent({
      model: input.model,
      contents: buildLedgerContents(
        buildTranscript(input.segments, input.summaryLanguage),
        input.candidates,
      ),
      config: {
        systemInstruction: RULES,
        temperature: 0,
        maxOutputTokens: 8192,
        responseMimeType: "application/json",
        responseSchema: ledgerResponseSchema,
        ...(input.model.toLowerCase().includes("flash") ? { thinkingConfig: { thinkingBudget: 0 } } : {}),
      },
    });
    text = response.text;
  } catch (error) {
    throw asLedgerError(error);
  }
  if (!text) throw new LedgerError(LEDGER_UNUSABLE, 502, "model");
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
