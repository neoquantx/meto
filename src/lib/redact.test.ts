import { describe, expect, it } from "vitest";
import { redactText } from "./redact";

describe("redaction", () => {
  it("hides email addresses and phone numbers", () => {
    expect(redactText("Email rahul@example.com or write to a.b@company.co.in")).toBe(
      "Email [redacted] or write to [redacted]",
    );
    expect(redactText("Call +91 98765 43210 or (415) 555-2671 today.")).toBe(
      "Call [redacted] or [redacted] today.",
    );
    expect(redactText("My number is 9876543210.")).toBe("My number is [redacted].");
  });

  it("hides card numbers and leaves ordinary dates and words", () => {
    expect(redactText("Card 4111 1111 1111 1111 and 4111-1111-1111-1111.")).toBe(
      "Card [redacted] and [redacted].",
    );
    expect(redactText("Launch on November 3rd, meeting 4.")).toBe("Launch on November 3rd, meeting 4.");
    expect(redactText("ईमेल rahul@example.com पर भेजो")).toBe("ईमेल [redacted] पर भेजो");
  });
});
