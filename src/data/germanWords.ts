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

/**
 * The curated German word database intentionally starts empty.
 * Suggestions can be added here later after they pass the card checker.
 */
export const GERMAN_WORD_DATABASE: GermanWordRecord[] = [];

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
