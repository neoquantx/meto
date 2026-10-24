import { del, get, keys, set } from "idb-keyval";
import type { MeetingSource, OffRecordRange, SummaryLanguage } from "@/lib/capture-limits";

const ACTIVE_KEY = "rec:active";

export type UploadDraft = {
  meetingId: string;
  path: string;
  token: string;
};

export type LocalSession = {
  sessionId: string;
  title: string;
  summaryLanguage: SummaryLanguage;
  recordedAt: string;
  consentNote: string | null;
  source: Exclude<MeetingSource, "upload">;
  mimeType: string;
  seq: number;
  offRecordRanges: OffRecordRange[];
  recordedMs: number;
  phase: "recording" | "paused" | "ready";
  draft?: UploadDraft;
};

const listeners = new Set<() => void>();
let liveSessionId: string | null = null;

function chunkKey(sessionId: string, seq: number) {
  return `rec:${sessionId}:${seq}`;
}

export function getLiveSession() {
  return liveSessionId;
}

export function setLiveSession(sessionId: string | null) {
  liveSessionId = sessionId;
  listeners.forEach((listener) => listener());
}

export function subscribeLive(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export async function loadSession() {
  const value = await get(ACTIVE_KEY);
  if (!value || typeof value !== "object") return null;
  return value as LocalSession;
}

export async function saveSession(session: LocalSession) {
  await set(ACTIVE_KEY, session);
}

export async function appendChunk(session: LocalSession, chunk: Blob) {
  await set(chunkKey(session.sessionId, session.seq), chunk);
  const next = { ...session, seq: session.seq + 1 };
  await saveSession(next);
  return next;
}

export async function buildRecordingBlob(session: LocalSession) {
  const parts: Blob[] = [];
  for (let index = 0; index < session.seq; index += 1) {
    const chunk = await get(chunkKey(session.sessionId, index));
    if (!(chunk instanceof Blob)) {
      throw new Error("A piece of this recording is missing. Try Recover again in a few seconds.");
    }
    parts.push(chunk);
  }
  if (parts.length === 0) {
    throw new Error("This recording has no audio yet.");
  }
  return new Blob(parts, { type: session.mimeType });
}

export async function deleteSession(sessionId: string) {
  const all = await keys();
  await Promise.all(
    all
      .filter((key) => String(key).startsWith(`rec:${sessionId}:`))
      .map((key) => del(key)),
  );
  const active = await get(ACTIVE_KEY);
  if (
    active &&
    typeof active === "object" &&
    "sessionId" in active &&
    active.sessionId === sessionId
  ) {
    await del(ACTIVE_KEY);
  }
}
