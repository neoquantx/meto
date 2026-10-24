import { describe, expect, it } from "vitest";
import { isCronAuthorized } from "./cron-auth";

describe("isCronAuthorized", () => {
  it("accepts the matching bearer token", () => {
    expect(isCronAuthorized("Bearer secret", "secret")).toBe(true);
  });

  it("rejects a missing, empty, or wrong secret", () => {
    expect(isCronAuthorized("Bearer secret", undefined)).toBe(false);
    expect(isCronAuthorized("Bearer secret", "")).toBe(false);
    expect(isCronAuthorized("Bearer other", "secret")).toBe(false);
    expect(isCronAuthorized(null, "secret")).toBe(false);
  });
});
