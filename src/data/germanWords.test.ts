import { describe, expect, it } from "vitest";
import { GERMAN_WORD_DATABASE, findGermanWord, normalizeGermanWord } from "./germanWords";

describe("German word database", () => {
  it("loads generated records with the typed shape", () => {
    expect(GERMAN_WORD_DATABASE.every((word) => word.german && word.englishMeanings.length > 0)).toBe(true);
    expect(new Set(GERMAN_WORD_DATABASE.map((word) => normalizeGermanWord(word.german))).size).toBe(
      GERMAN_WORD_DATABASE.length,
    );
  });

  it("finds a generated word even when its article is included", () => {
    const firstWord = GERMAN_WORD_DATABASE[0];
    if (!firstWord) return;
    const articlePrefix = ["der", "die", "das"].includes(firstWord.article) ? `${firstWord.article} ` : "";
    expect(findGermanWord(`${articlePrefix}${firstWord.german}`)?.id).toBe(
      firstWord.id,
    );
  });

  it("normalizes article prefixes for future lookups", () => {
    expect(normalizeGermanWord("  Die   Wohnung ")).toBe("wohnung");
  });
});
