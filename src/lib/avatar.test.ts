import { describe, expect, it } from "vitest";
import { getAvataaarsOptions } from "./avatar";

describe("Avataaars options", () => {
  it("are deterministic for the same learner and day", () => {
    expect(getAvataaarsOptions("Soheil", "2026-09-11")).toEqual(getAvataaarsOptions("Soheil", "2026-09-11"));
  });

  it("changes predictably when the seed changes", () => {
    expect(getAvataaarsOptions("Soheil", "2026-09-11")).not.toEqual(getAvataaarsOptions("Deutschly", "2026-09-11"));
  });
});
