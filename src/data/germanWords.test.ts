import { describe, expect, it } from "vitest";
import { GERMAN_WORD_DATABASE, findGermanWord, normalizeGermanWord } from "./germanWords";

describe("German word database", () => {
  it("starts as an empty curated database", () => {
    expect(GERMAN_WORD_DATABASE).toEqual([]);
    expect(findGermanWord("Das Eis")).toBeUndefined();
  });

  it("normalizes article prefixes for future lookups", () => {
    expect(normalizeGermanWord("  Die   Wohnung ")).toBe("wohnung");
  });
});
