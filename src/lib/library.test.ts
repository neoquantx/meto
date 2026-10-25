import { describe, expect, it } from "vitest";
import {
  formatMeetingWhen,
  hasSearchWords,
  libraryGroups,
  simpleTokens,
  snippetForQuery,
  type LibraryMeeting,
} from "./library";

const older: LibraryMeeting = {
  id: "m-old",
  title: "Launch planning",
  recordedAt: "2026-10-20T15:00:00.000Z",
  status: "ready",
  durationSec: 300,
  source: "mic",
};

const newer: LibraryMeeting = {
  id: "m-new",
  title: "Weekly sync",
  recordedAt: "2026-10-22T15:00:00.000Z",
  status: "ready",
  durationSec: 120,
  source: "upload",
};

describe("library search", () => {
  it("splits words like a simple text search and keeps Devanagari", () => {
    expect(simpleTokens("Pricing, deck!")).toEqual(["pricing", "deck"]);
    expect(simpleTokens("decks")).toEqual(["decks"]);
    expect(simpleTokens("राहुल प्राइसिंग")).toEqual(["राहुल", "प्राइसिंग"]);
    expect(hasSearchWords("...")).toBe(false);
    expect(formatMeetingWhen("2026-10-20T15:00:00.000Z")).toBe("Oct 20, 2026");
  });

  it("cuts a snippet around the matching word", () => {
    const text = `${"alpha ".repeat(40)}send the pricing deck tomorrow ${"omega ".repeat(40)}`;
    const snippet = snippetForQuery(text, "pricing");
    expect(snippet.startsWith("…")).toBe(true);
    expect(snippet.endsWith("…")).toBe(true);
    expect(snippet).toContain("pricing");
    expect(snippet.length).toBeLessThan(text.length);
  });

  it("groups title matches and transcript hits with timestamp links", () => {
    const filler = Array.from({ length: 6 }, (_, index) => ({
      meetingId: "m-new",
      idx: index,
      startMs: index * 1000,
      text: `sync note ${index}`,
    }));
    const groups = libraryGroups({
      meetings: [older, newer],
      hits: [
        ...filler,
        {
          meetingId: "m-old",
          idx: 4,
          startMs: 12500,
          text: "I'll send the pricing deck by Friday.",
        },
      ],
      titleMatchIds: new Set(["m-old"]),
      query: "pricing",
    });
    expect(groups.map((group) => group.meeting.id)).toEqual(["m-new", "m-old"]);
    expect(groups[0]?.titleMatch).toBe(false);
    expect(groups[0]?.snippets).toHaveLength(5);
    expect(groups[0]?.extra).toBe(1);
    expect(groups[1]?.titleMatch).toBe(true);
    expect(groups[1]?.snippets[0]?.href).toBe("/meetings/m-old?t=12500&line=4");
    expect(groups[1]?.snippets[0]?.text).toContain("pricing deck");
  });
});
