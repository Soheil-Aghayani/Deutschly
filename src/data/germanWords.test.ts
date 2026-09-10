import { describe, expect, it } from "vitest";
import { GERMAN_WORD_DATABASE, findGermanWord, mergeGermanWordRecords, normalizeGermanWord, searchGermanWords } from "./germanWords";

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

  it("ranks exact and prefix word-bank matches first", () => {
    const matches = searchGermanWords("arbeit", 2).map((word) => word.german);
    expect(matches[0]).toBe("arbeiten");
    expect(matches).toContain("Arbeitsplatz");
    expect(searchGermanWords("", 5)).toEqual([]);
  });

  it("keeps Menschen lesson and page metadata on sourced records", () => {
    const sourcedWord = GERMAN_WORD_DATABASE.find((word) => word.german === "Lied");
    expect(sourcedWord?.source).toMatchObject({
      book: "Menschen A1.1 Kursbuch",
      lesson: "Lesson 1",
      page: 9,
    });
  });

  it("merges generated records without adding duplicate headwords", () => {
    const existing = GERMAN_WORD_DATABASE[0];
    if (!existing) return;
    const custom = {
      ...existing,
      id: "custom-word",
      german: "Neue Probe",
      englishMeanings: ["new test"],
      source: undefined,
    };
    const merged = mergeGermanWordRecords([existing], [existing, custom]);
    expect(merged).toHaveLength(2);
    expect(merged[0]?.id).toBe(existing.id);
    expect(searchGermanWords("neue", 5, merged).map((word) => word.german)).toEqual(["Neue Probe"]);
  });
});
