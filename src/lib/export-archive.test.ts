import { strFromU8, unzipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { assembleExportMeetings, exportBaseName, meetingsZip } from "./export-archive";

describe("export archive", () => {
  it("redacts contact details in the file name and in both files", () => {
    expect(exportBaseName("rahul@example.com", "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee")).toBe(
      "redacted-aaaaaaaabbbbccccddddeeeeeeeeeeee".slice(0, "redacted-".length + 8),
    );
    expect(exportBaseName("Call 9876543210", "12345678-aaaa-bbbb-cccc-ddddeeee1234")).not.toContain("9876543210");

    const packed = assembleExportMeetings({
      heads: [
        {
          id: "12345678-aaaa-bbbb-cccc-ddddeeee1234",
          title: "Launch planning",
          recordedAt: "2026-10-20T15:00:00.000Z",
          summaryLanguage: "en",
          tldr: ["Email rahul@example.com"],
          chapters: [],
        },
      ],
      segments: [
        {
          meetingId: "12345678-aaaa-bbbb-cccc-ddddeeee1234",
          idx: 0,
          speaker: 1,
          startMs: 1000,
          text: "I'll send it to rahul@example.com",
        },
      ],
      decisions: [
        {
          meetingId: "12345678-aaaa-bbbb-cccc-ddddeeee1234",
          text: "Call the venue",
          quote: "Call 9876543210 tonight",
          startMs: 2000,
          review: "pending",
        },
      ],
      commitments: [],
      speakers: [{ meetingId: "12345678-aaaa-bbbb-cccc-ddddeeee1234", speaker: 1, name: "Rahul" }],
    });
    const zip = meetingsZip(packed);
    const files = unzipSync(zip);
    const names = Object.keys(files);
    expect(names.some((name) => name.endsWith(".md"))).toBe(true);
    expect(names.some((name) => name.endsWith(".json"))).toBe(true);
    const combined = names.map((name) => `${name}\n${strFromU8(files[name]!)}`).join("\n");
    expect(combined).not.toContain("rahul@example.com");
    expect(combined).not.toContain("9876543210");
    expect(combined).toContain("[redacted]");
    expect(combined).toContain("Rahul");
    expect(combined).toContain("Launch planning");
  });

  it("opens an empty export", () => {
    const files = unzipSync(meetingsZip([]));
    expect(strFromU8(files["README.md"]!)).toContain("No meetings");
  });
});
