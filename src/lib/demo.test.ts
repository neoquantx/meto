import { describe, expect, it } from "vitest";
import {
  DEMO_MEETING_IDS,
  fallbackBriefData,
  fallbackDecisionList,
  fallbackLedgerList,
  fallbackLibraryData,
  fallbackMeetingDetail,
  isUuid,
  readDemoOwnerId,
} from "./demo";
import { evidenceHref, groupLedger } from "./ledger-view";
import { libraryGroups } from "./library";

describe("demo mode and read-only links", () => {
  it("validates DEMO_OWNER_ID as a UUID", () => {
    const valid = "123e4567-e89b-12d3-a456-426614174000";
    expect(isUuid(valid)).toBe(true);
    expect(readDemoOwnerId(`  ${valid} `)).toBe(valid);
    expect(readDemoOwnerId("")).toBeNull();
    expect(readDemoOwnerId("not-a-uuid")).toBeNull();
  });

  it("builds read-only evidence and search links under /demo/meetings", () => {
    expect(evidenceHref("m1", 14000, 1, { readOnly: true })).toBe(
      "/demo/meetings/m1?t=14000&line=1",
    );

    const { meetings, hits, titleMatchIds } = fallbackLibraryData("bhej");
    const groups = libraryGroups({
      meetings,
      hits,
      titleMatchIds,
      query: "bhej",
      readOnly: true,
    });
    expect(groups).toHaveLength(1);
    expect(groups[0]?.meeting.title).toBe("Weekly sync");
    expect(groups[0]?.snippets[0]?.href).toBe(
      `/demo/meetings/${DEMO_MEETING_IDS.m2}?t=6000&line=0`,
    );
  });

  it("provides the three-meeting commitment ledger story when DEMO_OWNER_ID is unset", () => {
    const m1 = fallbackMeetingDetail(DEMO_MEETING_IDS.m1);
    expect(m1?.title).toBe("Launch planning");
    expect(m1?.droppedCount).toBe(1);
    expect(m1?.pauses).toEqual([{ at_ms: 42000, paused_ms: 60000 }]);

    const ledger = fallbackLedgerList();
    const done = groupLedger(ledger, "done").flatMap((group) => group.items);
    const dropped = groupLedger(ledger, "dropped").flatMap((group) => group.items);
    const open = groupLedger(ledger, "open").flatMap((group) => group.items);

    expect(done.map((item) => item.text)).toEqual([
      "Fix the login bug",
      "Send the pricing deck",
    ]);
    expect(dropped.map((item) => item.text)).toEqual(["Book the demo room"]);
    expect(dropped[0]?.misses).toBe(2);
    expect(open.map((item) => item.text)).toEqual(["Email the investors"]);
    expect(open[0]?.kind).toBe("conditional");

    const decisions = fallbackDecisionList();
    expect(decisions.map((item) => item.text)).toEqual([
      "Launch November 10 ko shift karte hain.",
      "Launch on November 3rd.",
    ]);

    const brief = fallbackBriefData();
    expect(brief.people.map((person) => person.name)).toEqual(["Himanshu", "Rahul"]);
  });
});
