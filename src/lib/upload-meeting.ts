import {
  checkFileLimits,
  extensionForMime,
  type MeetingSource,
  type OffRecordRange,
  type SummaryLanguage,
} from "@/lib/capture-limits";
import { createClient } from "@/lib/supabase/browser";
import type { UploadDraft } from "@/lib/recording-store";

export class UploadError extends Error {
  code?: string;

  constructor(message: string, code?: string) {
    super(message);
    this.code = code;
  }
}

export type UploadMeetingInput = {
  blob: Blob;
  mimeType: string;
  title: string;
  source: MeetingSource;
  summaryLanguage: SummaryLanguage;
  recordedAt: string;
  consentNote: string | null;
  offRecordRanges: OffRecordRange[];
  durationSec: number;
  draft?: UploadDraft;
  onDraft?: (draft: UploadDraft) => Promise<void> | void;
};

async function errorFromResponse(response: Response) {
  try {
    const body = (await response.json()) as { error?: string; code?: string };
    return new UploadError(body.error || "The upload failed.", body.code);
  } catch {
    return new UploadError("The upload failed.");
  }
}

export async function uploadMeetingBlob(input: UploadMeetingInput) {
  const issue = checkFileLimits(input.blob.size, input.durationSec);
  if (issue) throw new UploadError(issue.error, issue.code);

  let draft = input.draft;
  if (!draft) {
    const created = await fetch("/api/meetings", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: input.title,
        source: input.source,
        summary_language: input.summaryLanguage,
        recorded_at: input.recordedAt,
        consent: true,
        consent_note: input.consentNote,
        off_record_ranges: input.offRecordRanges,
        mime_type: input.mimeType,
      }),
    });
    if (!created.ok) throw await errorFromResponse(created);
    const body = (await created.json()) as UploadDraft;
    draft = body;
    await input.onDraft?.(draft);
  }

  const supabase = createClient();
  const file = new File([input.blob], `meeting.${extensionForMime(input.mimeType)}`, {
    type: input.mimeType,
  });
  const { error } = await supabase.storage.from("audio").uploadToSignedUrl(draft.path, draft.token, file, {
    contentType: input.mimeType.split(";")[0],
  });
  if (error) throw new UploadError(error.message);

  const uploaded = await fetch(`/api/meetings/${draft.meetingId}/uploaded`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ duration_sec: input.durationSec }),
  });
  if (!uploaded.ok) throw await errorFromResponse(uploaded);
  return draft.meetingId;
}
