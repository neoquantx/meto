import { describe, expect, it } from "vitest";
import { audioPathsToRemove, parseDeleteAll, parseSettingsSave, readSettings } from "./settings-form";

describe("settings", () => {
  it("keeps the summary language and the first unique glossary terms", () => {
    expect(readSettings(null)).toEqual({ glossary: [], summaryLanguage: "en" });
    expect(readSettings({ glossary: [" Rahul ", "rahul"], summary_language: "hinglish" })).toEqual({
      glossary: ["Rahul"],
      summaryLanguage: "hinglish",
    });
    const saved = parseSettingsSave({
      glossary: "Rahul\n\npricing deck",
      summary_language: "hi",
    });
    expect(saved).toEqual({ ok: true, glossary: ["Rahul", "pricing deck"], summaryLanguage: "hi" });
    expect(parseSettingsSave({ glossary: "", summary_language: "fr" }).ok).toBe(false);
  });

  it("asks for the delete phrase and only removes this owner's audio", () => {
    expect(parseDeleteAll({ confirm: "delete all" })).toEqual({ ok: true });
    expect(parseDeleteAll({ confirm: "delete" }).ok).toBe(false);
    expect(
      audioPathsToRemove(
        "owner-1",
        ["meeting.webm", "../secret.webm", "nested/file.webm"],
        ["owner-1/meeting.webm", "owner-2/other.webm", "owner-1/../owner-2/other.webm", null],
      ),
    ).toEqual(["owner-1/meeting.webm"]);
  });
});
