import generatedWords from "./germanWords.generated.json";

export type GermanWordArticle = "der" | "die" | "das" | "plural" | "none";
export type GermanWordLevel = "A1" | "A2" | "B1" | "B2" | "C1" | "C2" | "unknown";

export interface GermanWordSource {
  book: string;
  lesson: string;
  page: number;
  context?: string;
}

export interface GermanWordRecord {
  id: string;
  german: string;
  englishMeanings: string[];
  article: GermanWordArticle;
  articleAlternatives?: Array<Extract<GermanWordArticle, "der" | "die" | "das">>;
  plural?: string;
  level: GermanWordLevel;
  partOfSpeech?: string;
  examples?: string[];
  tags: string[];
  source?: GermanWordSource;
}

const germanWordArticles = new Set<GermanWordArticle>(["der", "die", "das", "plural", "none"]);
const germanWordLevels = new Set<GermanWordLevel>(["A1", "A2", "B1", "B2", "C1", "C2", "unknown"]);

export function isGermanWordRecord(value: unknown): value is GermanWordRecord {
  if (!value || typeof value !== "object") return false;
  const word = value as Partial<GermanWordRecord>;
  const source = word.source;
  const hasValidSource = source === undefined || (
    typeof source === "object" &&
    source !== null &&
    typeof source.book === "string" &&
    source.book.length > 0 &&
    typeof source.lesson === "string" &&
    source.lesson.length > 0 &&
    typeof source.page === "number" &&
    Number.isInteger(source.page) &&
    source.page > 0 &&
    (source.context === undefined || typeof source.context === "string")
  );
  return (
    typeof word.id === "string" &&
    typeof word.german === "string" &&
    Array.isArray(word.englishMeanings) &&
    word.englishMeanings.every((meaning) => typeof meaning === "string") &&
    germanWordArticles.has(word.article as GermanWordArticle) &&
    germanWordLevels.has(word.level as GermanWordLevel) &&
    Array.isArray(word.tags) &&
    word.tags.every((tag) => typeof tag === "string") &&
    hasValidSource
  );
}

/**
 * Generated records are reviewed and deduplicated by the word agent before
 * they reach this typed data source.
 */
export const GERMAN_WORD_DATABASE: GermanWordRecord[] = (generatedWords as unknown as unknown[]).filter(isGermanWordRecord);

export function mergeGermanWordRecords(...sources: GermanWordRecord[][]): GermanWordRecord[] {
  const merged = new Map<string, GermanWordRecord>();
  sources.flat().forEach((word) => {
    const key = normalizeGermanWord(word.german);
    if (key && !merged.has(key)) merged.set(key, word);
  });
  return [...merged.values()];
}

export function normalizeGermanWord(value: string): string {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase("de-DE")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^(der|die|das)\s+/, "");
}

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
