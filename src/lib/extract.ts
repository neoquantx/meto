import { ApiError, GoogleGenAI, Type, type Schema } from "@google/genai";
import { z } from "zod";
import {
  EXTRACT_UNUSABLE,
  QUOTA_MESSAGE,
  extractionFailure,
} from "@/lib/extraction-messages";
import type { EvidenceSegment, ExtractionDraft } from "@/lib/verify";

export const DEFAULT_GEMINI_MODEL = "gemini-2.5-flash";

const SUMMARY_LANGUAGE: Record<string, string> = {
  en: "English",
  hi: "Hindi",
  hinglish: "Hinglish, mixing Hindi and English the way the transcript does",
};

const RULES = `You extract decisions and commitments from a meeting transcript. Use only the transcript. An empty list is a correct answer.

Rules:
- quote is copied verbatim from the transcript, in its original language and script. Do not translate, summarize, or fix the quote.
- Write tldr, chapter titles, decision text, and commitment text in the summary language.
- tldr has at most 3 items. Each item is at most 25 words.
- A hedge such as "maybe", "we could", or "we should think about" is a suggestion, not a task.
- "If X then Y" is conditional, and condition is X. Otherwise condition is null.
- owner_mode is self when the speaker of the quote says they will do it.
- owner_mode is assigned only when a different person agrees in a later line. acknowledged_segment_idx is that later line's S number. If nobody agrees, owner_mode is unclear and acknowledged_segment_idx is null.
- owner_mode is unclear when the owner cannot be told from the transcript.
- due_phrase is the exact due-date words copied from the quote, such as "by Friday", or null when no due date was said.
- segment_idx is the S number of the line the quote comes from.
- speaker_name_hints are names a speaker says out loud, such as "Hi, I'm Rahul". Copy the name and the S number of that line. Do not guess names.
- Do not invent decisions, commitments, quotes, or names.`;

const nullableText: Schema = { type: Type.STRING, nullable: true };
const lineIndex: Schema = { type: Type.INTEGER };
const kindSchema: Schema = {
  type: Type.STRING,
  format: "enum",
  enum: ["explicit", "conditional", "suggestion"],
};
const ownerSchema: Schema = {
  type: Type.STRING,
  format: "enum",
  enum: ["self", "assigned", "unclear"],
};

const extractionResponseSchema: Schema = {
  type: Type.OBJECT,
  required: ["tldr", "chapters", "decisions", "commitments", "speaker_name_hints"],
  properties: {
    tldr: { type: Type.ARRAY, items: { type: Type.STRING }, description: "At most 3 short lines." },
    chapters: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        required: ["title", "segment_idx"],
        properties: {
          title: { type: Type.STRING },
          segment_idx: lineIndex,
        },
      },
    },
    decisions: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        required: ["text", "quote", "segment_idx"],
        properties: {
          text: { type: Type.STRING },
          quote: { type: Type.STRING, description: "Verbatim transcript words." },
          segment_idx: lineIndex,
        },
      },
    },
    commitments: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        required: [
          "text",
          "kind",
          "condition",
          "owner_mode",
          "acknowledged_segment_idx",
          "due_phrase",
          "quote",
          "segment_idx",
        ],
        properties: {
          text: { type: Type.STRING },
          kind: kindSchema,
          condition: nullableText,
          owner_mode: ownerSchema,
          acknowledged_segment_idx: { type: Type.INTEGER, nullable: true },
          due_phrase: nullableText,
          quote: { type: Type.STRING, description: "Verbatim transcript words." },
          segment_idx: lineIndex,
        },
      },
    },
    speaker_name_hints: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        required: ["speaker", "name", "segment_idx"],
        properties: {
          speaker: lineIndex,
          name: { type: Type.STRING },
          segment_idx: lineIndex,
        },
      },
    },
  },
};

const blankable = z
  .string()
  .nullable()
  .transform((value) => {
    const text = value?.trim() ?? "";
    return text ? text : null;
  });

export const extractionSchema = z.object({
  tldr: z.array(z.string()),
  chapters: z.array(
    z.object({
      title: z.string(),
      segment_idx: z.number().int().nonnegative(),
    }),
  ),
  decisions: z.array(
    z.object({
      text: z.string(),
      quote: z.string(),
      segment_idx: z.number().int().nonnegative(),
    }),
  ),
  commitments: z.array(
    z.object({
      text: z.string(),
      kind: z.enum(["explicit", "conditional", "suggestion"]),
      condition: blankable,
      owner_mode: z.enum(["self", "assigned", "unclear"]),
      acknowledged_segment_idx: z.number().int().nonnegative().nullable(),
      due_phrase: blankable,
      quote: z.string(),
      segment_idx: z.number().int().nonnegative(),
    }),
  ),
  speaker_name_hints: z.array(
    z.object({
      speaker: z.number().int().nonnegative(),
      name: z.string(),
      segment_idx: z.number().int().nonnegative(),
    }),
  ),
});

export class ExtractError extends Error {
  status: number;
  code: string;

  constructor(message: string, status: number, code: string) {
    super(message);
    this.name = "ExtractError";
    this.status = status;
    this.code = code;
  }
}

export function transcriptStamp(startMs: number) {
  const total = Math.max(0, Math.floor(startMs / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export function buildTranscript(segments: EvidenceSegment[], summaryLanguage: string) {
  const language = SUMMARY_LANGUAGE[summaryLanguage] ?? SUMMARY_LANGUAGE.en;
  const lines = segments
    .slice()
    .sort((left, right) => left.idx - right.idx)
    .map(
      (segment) =>
        `[S${segment.idx}] [Speaker ${segment.speaker}] [${transcriptStamp(segment.start_ms)}] ${segment.text}`,
    )
    .join("\n");
  return `Summary language: ${language}\n\nTranscript:\n${lines}`;
}

export function parseExtraction(raw: string): ExtractionDraft {
  const trimmed = raw
    .trim()
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/, "")
    .trim();
  let value: unknown;
  try {
    value = JSON.parse(trimmed);
  } catch {
    throw new ExtractError(EXTRACT_UNUSABLE, 502, "model");
  }
  const parsed = extractionSchema.safeParse(softenNulls(value));
  if (!parsed.success) throw new ExtractError(EXTRACT_UNUSABLE, 502, "model");
  return parsed.data;
}

export async function requestExtraction(input: {
  apiKey: string;
  model: string;
  summaryLanguage: string;
  segments: EvidenceSegment[];
}) {
  const ai = new GoogleGenAI({ apiKey: input.apiKey });
  let text: string | undefined;
  try {
    const response = await ai.models.generateContent({
      model: input.model,
      contents: buildTranscript(input.segments, input.summaryLanguage),
      config: {
        systemInstruction: RULES,
        temperature: 0,
        maxOutputTokens: 8192,
        responseMimeType: "application/json",
        responseSchema: extractionResponseSchema,
        ...(input.model.toLowerCase().includes("flash") ? { thinkingConfig: { thinkingBudget: 0 } } : {}),
      },
    });
    text = response.text;
  } catch (error) {
    throw asExtractError(error);
  }
  if (!text) throw new ExtractError(EXTRACT_UNUSABLE, 502, "model");
  try {
    return parseExtraction(text);
  } catch (error) {
    if (error instanceof ExtractError) {
      console.warn("Extraction JSON failed validation.");
    }
    throw error;
  }
}

function softenNulls(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const record = value as Record<string, unknown>;
  if (!Array.isArray(record.commitments)) return value;
  return {
    ...record,
    commitments: record.commitments.map((item) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) return item;
      const row = item as Record<string, unknown>;
      return {
        ...row,
        condition: row.condition === "" || row.condition == null ? null : row.condition,
        due_phrase: row.due_phrase === "" || row.due_phrase == null ? null : row.due_phrase,
        acknowledged_segment_idx: row.acknowledged_segment_idx ?? null,
      };
    }),
  };
}

function statusCode(error: unknown) {
  if (error instanceof ApiError) return error.status;
  if (error && typeof error === "object" && "status" in error && typeof error.status === "number") {
    return error.status;
  }
  return 0;
}

function asExtractError(error: unknown) {
  if (error instanceof ExtractError) return error;
  const status = statusCode(error);
  const message = error instanceof Error ? error.message : "";
  if (status === 429 || /RESOURCE_EXHAUSTED|quota exceeded|\b429\b/i.test(message)) {
    return new ExtractError(QUOTA_MESSAGE, 429, "quota");
  }
  const clipped = message.replace(/\s+/g, " ").trim().slice(0, 240);
  return new ExtractError(
    extractionFailure(clipped || "The extraction request failed. Try again."),
    status >= 400 && status < 600 ? status : 502,
    "model",
  );
}
