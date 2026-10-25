import { jsonError, requireApiUser } from "@/lib/http";
import { LedgerError, runLedgerCheck } from "@/lib/ledger-check";
import {
  commitmentOwnerUpdates,
  parseSpeakerSave,
  personNameKey,
} from "@/lib/speakers";
import { createAdminClient } from "@/lib/supabase/admin";

export const maxDuration = 300;

const NAMABLE = new Set(["transcribed", "extracting", "ready", "failed"]);

type Admin = ReturnType<typeof createAdminClient>;

type StoredPerson = { id: string; name: string };

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireApiUser();
  if (!auth.user) return auth.response;

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return jsonError("The request body must be JSON.", 400, "bad_request");
  }

  const { id } = await params;
  const admin = createAdminClient();
  const { data: meeting, error: loadError } = await admin
    .from("meetings")
    .select("id, status")
    .eq("id", id)
    .eq("owner_id", auth.user.id)
    .maybeSingle();
  if (loadError) return jsonError(loadError.message, 500, "database");
  if (!meeting) return jsonError("Meeting not found.", 404, "not_found");
  if (!NAMABLE.has(meeting.status)) {
    return jsonError("Transcribe the meeting before naming speakers.", 409, "bad_status");
  }

  const { data: speakerRows, error: speakerError } = await admin
    .from("meeting_speakers")
    .select("speaker, person_id")
    .eq("meeting_id", id);
  if (speakerError) return jsonError(speakerError.message, 500, "database");

  const record = json && typeof json === "object" && !Array.isArray(json) ? (json as Record<string, unknown>) : null;
  if (!record) return jsonError("The request body must be JSON.", 400, "bad_request");
  const recheck = record.recheck === true;
  const saving = "speakers" in record;
  if (!saving && !recheck) return jsonError("Send a name for each speaker.", 400, "bad_request");

  let names: { speaker: number; name: string | null }[] | null = null;
  if (saving) {
    const known = (speakerRows ?? []).map((row) => row.speaker);
    const parsed = parseSpeakerSave(json, known);
    if (!parsed.ok) return jsonError(parsed.error, 400, "bad_request");
    try {
      names = await saveNames(admin, auth.user.id, id, parsed.assignments);
      await applyOwners(admin, auth.user.id, id);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not save speaker names.";
      return jsonError(message, 500, "database");
    }
  }

  try {
    const ledger = await runLedgerCheck(admin, { ownerId: auth.user.id, meetingId: id, force: recheck });
    if (!names && !ledger.checked && ledger.reason === "unnamed") {
      return jsonError("Name at least one speaker before checking the ledger.", 409, "unnamed");
    }
    if (!names && !ledger.checked && ledger.reason === "no_transcript") {
      return jsonError("Transcribe the meeting before checking the ledger.", 409, "no_transcript");
    }
    return Response.json({ ok: true, speakers: names ?? undefined, ledger });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not check the ledger.";
    if (!names) {
      const status = error instanceof LedgerError ? error.status : 500;
      const code = error instanceof LedgerError ? error.code : "database";
      return jsonError(message, status, code);
    }
    return Response.json({ ok: true, speakers: names, ledger: { checked: false, error: message } });
  }
}

async function saveNames(
  admin: Admin,
  ownerId: string,
  meetingId: string,
  assignments: { speaker: number; name: string | null }[],
) {
  const people = await loadPeople(admin, ownerId);
  const saved: { speaker: number; name: string | null }[] = [];
  const speakersByPerson = new Map<string, number[]>();

  for (const assignment of assignments) {
    const person = assignment.name ? await ensurePerson(admin, ownerId, assignment.name, people) : null;
    const key = person?.id ?? "";
    const speakers = speakersByPerson.get(key) ?? [];
    speakers.push(assignment.speaker);
    speakersByPerson.set(key, speakers);
    saved.push({ speaker: assignment.speaker, name: person?.name ?? null });
  }

  for (const [key, speakers] of speakersByPerson) {
    const { error } = await admin
      .from("meeting_speakers")
      .update({ person_id: key || null })
      .eq("meeting_id", meetingId)
      .in("speaker", speakers);
    if (error) throw new Error(error.message);
  }

  saved.sort((a, b) => a.speaker - b.speaker);
  return saved;
}

async function applyOwners(admin: Admin, ownerId: string, meetingId: string) {
  const [{ data: speakers, error: speakerError }, { data: commitments, error: commitmentError }] =
    await Promise.all([
      admin.from("meeting_speakers").select("speaker, person_id").eq("meeting_id", meetingId),
      admin
        .from("commitments")
        .select("id, owner_speaker, owner_person_id")
        .eq("meeting_id", meetingId)
        .eq("owner_id", ownerId),
    ]);
  if (speakerError) throw new Error(speakerError.message);
  if (commitmentError) throw new Error(commitmentError.message);

  const updates = commitmentOwnerUpdates(commitments ?? [], speakers ?? []);
  const idsByPerson = new Map<string, string[]>();
  for (const update of updates) {
    const key = update.owner_person_id ?? "";
    const ids = idsByPerson.get(key) ?? [];
    ids.push(update.id);
    idsByPerson.set(key, ids);
  }

  const updatedAt = new Date().toISOString();
  for (const [key, ids] of idsByPerson) {
    const { error } = await admin
      .from("commitments")
      .update({ owner_person_id: key || null, updated_at: updatedAt })
      .in("id", ids)
      .eq("meeting_id", meetingId)
      .eq("owner_id", ownerId);
    if (error) throw new Error(error.message);
  }
}

async function loadPeople(admin: Admin, ownerId: string) {
  const { data, error } = await admin.from("people").select("id, name").eq("owner_id", ownerId);
  if (error) throw new Error(error.message);
  const people = new Map<string, StoredPerson>();
  for (const row of data ?? []) {
    if (typeof row.id !== "string" || typeof row.name !== "string") continue;
    people.set(personNameKey(row.name), { id: row.id, name: row.name });
  }
  return people;
}

async function ensurePerson(admin: Admin, ownerId: string, name: string, people: Map<string, StoredPerson>) {
  const key = personNameKey(name);
  const existing = people.get(key);
  if (existing) return existing;

  const { data, error } = await admin
    .from("people")
    .insert({ owner_id: ownerId, name })
    .select("id, name")
    .single();
  if (!error && data) {
    const person = { id: data.id, name: data.name };
    people.set(key, person);
    return person;
  }
  if (error?.code !== "23505") throw new Error(error?.message ?? "Could not save that name.");

  const fresh = await loadPeople(admin, ownerId);
  for (const [freshKey, person] of fresh) people.set(freshKey, person);
  const created = people.get(key);
  if (!created) throw new Error("Could not save that name.");
  return created;
}
