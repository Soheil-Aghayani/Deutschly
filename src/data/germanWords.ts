import generatedWords from "./germanWords.generated.json";
import {
  isGermanWordRecord,
  normalizeGermanWord,
} from "./germanWordsCore";
import type { GermanWordRecord } from "./germanWordsCore";

export * from "./germanWordsCore";

/**
 * The synchronous data facade is kept for tests and tooling that need the
 * complete reference list immediately. App runtime code uses the lazy loader.
 */
export const GERMAN_WORD_DATABASE: GermanWordRecord[] = (generatedWords as unknown as unknown[]).filter(isGermanWordRecord);

export function findGermanWord(value: string): GermanWordRecord | undefined {
  const normalized = normalizeGermanWord(value);
  return GERMAN_WORD_DATABASE.find((word) => normalizeGermanWord(word.german) === normalized);
}

export function searchGermanWords(value: string, limit = 6, records = GERMAN_WORD_DATABASE): GermanWordRecord[] {
  const normalized = normalizeGermanWord(value);
  if (!normalized || limit < 1) return [];

  return records
    .map((word) => {
      const candidate = normalizeGermanWord(word.german);
      const score = candidate === normalized ? 0 : candidate.startsWith(normalized) ? 1 : candidate.includes(normalized) ? 2 : -1;
      return { word, score };
    })
    .filter(({ score }) => score >= 0)
    .sort((first, second) => first.score - second.score || first.word.german.localeCompare(second.word.german, "de"))
    .slice(0, limit)
    .map(({ word }) => word);
}
