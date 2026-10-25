export const MAX_PERSON_NAME = 80;

export type SpeakerAssignment = {
  speaker: number;
  name: string | null;
};

export function personNameKey(name: string) {
  return name.normalize("NFC").toLowerCase();
}

export function normalizePersonName(
  value: string,
): { ok: true; name: string | null } | { ok: false; error: string } {
  const collapsed = value
    .normalize("NFC")
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!collapsed) return { ok: true, name: null };
  if (collapsed.length > MAX_PERSON_NAME) {
    return { ok: false, error: "Names can be at most 80 characters." };
  }
  return { ok: true, name: collapsed };
}

export function parseSpeakerSave(
  body: unknown,
  knownSpeakers: number[],
): { ok: true; assignments: SpeakerAssignment[] } | { ok: false; error: string } {
  if (!body || typeof body !== "object" || !("speakers" in body) || !Array.isArray(body.speakers)) {
    return { ok: false, error: "Send a name for each speaker." };
  }
  if (knownSpeakers.length === 0) {
    return { ok: false, error: "This meeting has no speakers yet." };
  }

  const known = new Set(knownSpeakers);
  const seen = new Set<number>();
  const assignments: SpeakerAssignment[] = [];

  for (const item of body.speakers) {
    if (!item || typeof item !== "object" || !("speaker" in item) || !("name" in item)) {
      return { ok: false, error: "Send a name for each speaker." };
    }
    const speaker = item.speaker;
    const name = item.name;
    if (typeof speaker !== "number" || !Number.isInteger(speaker) || !known.has(speaker)) {
      return { ok: false, error: "That speaker is not in this meeting." };
    }
    if (seen.has(speaker)) {
      return { ok: false, error: "Each speaker can only be named once." };
    }
    if (typeof name !== "string") {
      return { ok: false, error: "Send a name for each speaker." };
    }
    const normalized = normalizePersonName(name);
    if (!normalized.ok) return normalized;
    seen.add(speaker);
    assignments.push({ speaker, name: normalized.name });
  }

  if (seen.size !== known.size) {
    return { ok: false, error: "Send a name for each speaker." };
  }

  assignments.sort((a, b) => a.speaker - b.speaker);
  return { ok: true, assignments };
}

export function personIdForOwner(
  ownerSpeaker: number | null,
  personBySpeaker: ReadonlyMap<number, string | null>,
) {
  if (ownerSpeaker == null) return null;
  return personBySpeaker.get(ownerSpeaker) ?? null;
}

export function commitmentOwnerUpdates(
  commitments: { id: string; owner_speaker: number | null; owner_person_id: string | null }[],
  speakers: { speaker: number; person_id: string | null }[],
) {
  const personBySpeaker = new Map(speakers.map((row) => [row.speaker, row.person_id]));
  const updates: { id: string; owner_person_id: string | null }[] = [];
  for (const commitment of commitments) {
    const next = personIdForOwner(commitment.owner_speaker, personBySpeaker);
    if (next !== commitment.owner_person_id) {
      updates.push({ id: commitment.id, owner_person_id: next });
    }
  }
  return updates;
}
