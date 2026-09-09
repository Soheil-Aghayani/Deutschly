import generatedWords from "./germanWords.generated.json";

export type GermanWordArticle = "der" | "die" | "das" | "plural" | "none";
export type GermanWordLevel = "A1" | "A2" | "B1" | "B2" | "C1" | "C2" | "unknown";

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
}

const germanWordArticles = new Set<GermanWordArticle>(["der", "die", "das", "plural", "none"]);
const germanWordLevels = new Set<GermanWordLevel>(["A1", "A2", "B1", "B2", "C1", "C2", "unknown"]);

function isGermanWordRecord(value: unknown): value is GermanWordRecord {
  if (!value || typeof value !== "object") return false;
  const word = value as Partial<GermanWordRecord>;
  return (
    typeof word.id === "string" &&
    typeof word.german === "string" &&
    Array.isArray(word.englishMeanings) &&
    word.englishMeanings.every((meaning) => typeof meaning === "string") &&
    germanWordArticles.has(word.article as GermanWordArticle) &&
    germanWordLevels.has(word.level as GermanWordLevel) &&
    Array.isArray(word.tags) &&
    word.tags.every((tag) => typeof tag === "string")
  );
}

/**
 * Generated records are reviewed and deduplicated by the word agent before
 * they reach this typed data source.
 */
export const GERMAN_WORD_DATABASE: GermanWordRecord[] = (generatedWords as unknown as unknown[]).filter(isGermanWordRecord);

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
