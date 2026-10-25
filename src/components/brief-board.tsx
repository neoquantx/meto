"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  buildBrief,
  evidenceHref,
  formatLedgerDate,
  ledgerStatusLabel,
  type BriefCommitment,
  type BriefDecision,
} from "@/lib/ledger-view";
import { kindLabel } from "@/lib/meeting-view";
import { formatTimestamp } from "@/lib/playback";

export function BriefBoard({
  people,
  commitments,
  decisions,
}: {
  people: { id: string; name: string }[];
  commitments: BriefCommitment[];
  decisions: BriefDecision[];
}) {
  const [selected, setSelected] = useState<string[]>([]);
  const brief = useMemo(
    () => buildBrief({ personIds: selected, people, commitments, decisions }),
    [selected, people, commitments, decisions],
  );

  function toggle(id: string) {
    setSelected((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
  }

  return (
    <div>
      <ul className="mt-6 flex flex-wrap gap-3">
        {people.map((person) => (
          <li key={person.id}>
            <label className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm">
              <input
                type="checkbox"
                checked={selected.includes(person.id)}
                onChange={() => toggle(person.id)}
              />
              {person.name}
            </label>
          </li>
        ))}
      </ul>
      {selected.length === 0 ? (
        <p className="mt-6 text-sm text-muted-foreground">Select who will be there.</p>
      ) : (
        <div className="mt-8 space-y-8">
          <section>
            <h2 className="text-lg font-medium">Commitments</h2>
            <ul className="mt-3 space-y-6">
              {brief.groups.map((group) => (
                <li key={group.id}>
                  <h3 className="text-sm font-medium">{group.label}</h3>
                  {group.items.length === 0 ? (
                    <p className="mt-1 text-sm text-muted-foreground">
                      Nothing open, in progress, changed, or dropped.
                    </p>
                  ) : (
                    <ul className="mt-2 space-y-3">
                      {group.items.map((item) => (
                        <li key={item.id} className="rounded-lg border p-3">
                          <p className="text-xs text-muted-foreground">
                            {ledgerStatusLabel(item.status)} · {kindLabel(item.kind)}
                          </p>
                          <p className="mt-1 text-sm">{item.text}</p>
                          {item.changeNote ? (
                            <p className="mt-1 text-sm text-muted-foreground">{item.changeNote}</p>
                          ) : null}
                          <Link
                            className="mt-2 block text-xs text-muted-foreground underline-offset-4 hover:underline"
                            href={evidenceHref(item.meetingId, item.startMs, item.segmentIdx)}
                          >
                            {item.meetingTitle}, {formatLedgerDate(item.recordedAt)} · {formatTimestamp(item.startMs)} · “
                            {item.quote}”
                          </Link>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              ))}
            </ul>
          </section>
          <section>
            <h2 className="text-lg font-medium">Recent decisions</h2>
            {brief.decisions.length === 0 ? (
              <p className="mt-2 text-sm text-muted-foreground">No decisions from meetings with them.</p>
            ) : (
              <ul className="mt-3 space-y-3">
                {brief.decisions.map((item) => (
                  <li key={item.id} className="rounded-lg border p-3">
                    <p className="text-sm">{item.text}</p>
                    <Link
                      className="mt-2 block text-xs text-muted-foreground underline-offset-4 hover:underline"
                      href={evidenceHref(item.meetingId, item.startMs, item.segmentIdx)}
                    >
                      {item.meetingTitle}, {formatLedgerDate(item.recordedAt)} · {formatTimestamp(item.startMs)} · “
                      {item.quote}”
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
