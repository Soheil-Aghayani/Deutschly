import { describe, expect, it } from "vitest";
import { getAvatarColorName, getAvataaarsOptions } from "./avatar";

describe("Avataaars options", () => {
  it("are deterministic for the same learner and day", () => {
    expect(getAvataaarsOptions("Soheil", "2026-09-11")).toEqual(getAvataaarsOptions("Soheil", "2026-09-11"));
  });

  it("changes predictably when the seed changes", () => {
    expect(getAvataaarsOptions("Soheil", "2026-09-11")).not.toEqual(getAvataaarsOptions("Deutschly", "2026-09-11"));
  });

  it("gives saved avatar colors human-readable names", () => {
    expect(getAvatarColorName("#FC909F")).toBe("Coral pink");
    expect(getAvatarColorName("#unknown")).toBe("Custom color");
  });
});
