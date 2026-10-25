"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, Check, ClipboardList, Gavel, UsersRound } from "lucide-react";
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
  readOnly = false,
}: {
  people: { id: string; name: string }[];
  commitments: BriefCommitment[];
  decisions: BriefDecision[];
  readOnly?: boolean;
}) {
  const [selected, setSelected] = useState<string[]>(() =>
    readOnly ? people.map((person) => person.id) : [],
  );
  const brief = useMemo(
    () => buildBrief({ personIds: selected, people, commitments, decisions }),
    [selected, people, commitments, decisions],
  );

  function toggle(id: string) {
    setSelected((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
  }

  return (
    <div>
      <div className="surface mt-7 p-4 sm:p-5">
        <div className="flex items-center gap-2">
          <UsersRound className="size-4 text-primary" aria-hidden="true" />
          <p className="text-sm font-semibold">Who will be there?</p>
        </div>
      <ul className="mt-4 flex flex-wrap gap-2">
        {people.map((person) => (
          <li key={person.id}>
            <label className={`flex min-h-10 cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 text-sm font-medium transition-colors ${selected.includes(person.id) ? "border-primary/30 bg-primary/8 text-primary" : "bg-card hover:bg-muted"}`}>
              <input
                type="checkbox"
                className="sr-only"
                checked={selected.includes(person.id)}
                onChange={() => toggle(person.id)}
              />
              {selected.includes(person.id) ? <Check className="size-3.5" aria-hidden="true" /> : null}
              {person.name}
            </label>
          </li>
        ))}
      </ul>
      </div>
      {selected.length === 0 ? (
        <div className="surface-muted mt-5 p-6 text-center text-sm text-muted-foreground">
          Select one or more people to build the brief.
        </div>
      ) : (
        <div className="mt-8 space-y-8">
          <section className="surface p-4 sm:p-6">
            <div className="flex items-center gap-2">
              <ClipboardList className="size-4 text-primary" aria-hidden="true" />
              <h2 className="font-semibold">Commitments</h2>
            </div>
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
                        <li key={item.id} className="rounded-xl border border-border/80 bg-card p-4 shadow-xs">
                          <p className="text-xs text-muted-foreground">
                            {ledgerStatusLabel(item.status)} · {kindLabel(item.kind)}
                          </p>
                          <p className="mt-1 text-sm break-words">{item.text}</p>
                          {item.changeNote ? (
                            <p className="mt-1 text-sm text-muted-foreground break-words">{item.changeNote}</p>
                          ) : null}
                          <Link
                            className="surface-muted mt-3 flex items-start gap-2 p-3 text-xs leading-5 text-muted-foreground hover:text-foreground break-words"
                            href={evidenceHref(item.meetingId, item.startMs, item.segmentIdx, { readOnly })}
                          >
                            <ArrowUpRight className="mt-0.5 size-3.5 shrink-0 text-primary" aria-hidden="true" />
                            <span>{item.meetingTitle}, {formatLedgerDate(item.recordedAt)} · {formatTimestamp(item.startMs)} · “{item.quote}”</span>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              ))}
            </ul>
          </section>
          <section className="surface p-4 sm:p-6">
            <div className="flex items-center gap-2">
              <Gavel className="size-4 text-primary" aria-hidden="true" />
              <h2 className="font-semibold">Recent decisions</h2>
            </div>
            {brief.decisions.length === 0 ? (
              <p className="mt-2 text-sm text-muted-foreground">No decisions from meetings with them.</p>
            ) : (
              <ul className="mt-3 space-y-3">
                {brief.decisions.map((item) => (
                  <li key={item.id} className="rounded-xl border border-border/80 bg-card p-4 shadow-xs">
                    <p className="text-sm break-words">{item.text}</p>
                    <Link
                      className="surface-muted mt-3 flex items-start gap-2 p-3 text-xs leading-5 text-muted-foreground hover:text-foreground break-words"
                      href={evidenceHref(item.meetingId, item.startMs, item.segmentIdx, { readOnly })}
                    >
                      <ArrowUpRight className="mt-0.5 size-3.5 shrink-0 text-primary" aria-hidden="true" />
                      <span>{item.meetingTitle}, {formatLedgerDate(item.recordedAt)} · {formatTimestamp(item.startMs)} · “{item.quote}”</span>
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
