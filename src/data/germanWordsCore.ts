export type GermanWordArticle = "der" | "die" | "das" | "plural" | "none";
export type GermanWordLevel = "A1" | "A2" | "B1" | "B2" | "C1" | "C2" | "unknown";
export type GermanWordPartOfSpeech =
  | "noun"
  | "verb"
  | "adjective"
  | "adverb"
  | "pronoun"
  | "preposition"
  | "conjunction"
  | "interjection"
  | "numeral"
  | "particle"
  | "phrase"
  | "grammar";

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
const germanWordPartOfSpeechAliases: Record<string, GermanWordPartOfSpeech> = {
  noun: "noun",
  nomen: "noun",
  substantiv: "noun",
  verb: "verb",
  verben: "verb",
  adjective: "adjective",
  adjectiv: "adjective",
  adj: "adjective",
  adjektiv: "adjective",
  adverb: "adverb",
  adv: "adverb",
  adverbial: "adverb",
  pronoun: "pronoun",
  pronomen: "pronoun",
  preposition: "preposition",
  präposition: "preposition",
  praeposition: "preposition",
  conjunction: "conjunction",
  konjunktion: "conjunction",
  interjection: "interjection",
  interjektion: "interjection",
  numeral: "numeral",
  number: "numeral",
  zahlwort: "numeral",
  particle: "particle",
  partikel: "particle",
  phrase: "phrase",
  expression: "phrase",
  grammar: "grammar",
  grammatik: "grammar",
};

export function formatGermanPartOfSpeech(value?: string): GermanWordPartOfSpeech | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value
    .trim()
    .toLocaleLowerCase("en-US")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ");
  if (!normalized) return undefined;
  return germanWordPartOfSpeechAliases[normalized];
}

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

export function mergeGermanWordRecords(...sources: GermanWordRecord[][]): GermanWordRecord[] {
  const merged = new Map<string, GermanWordRecord>();
  sources.flat().forEach((word) => {
    const key = normalizeGermanWord(word.german);
    if (key && !merged.has(key)) merged.set(key, word);
  });
  return [...merged.values()].slice(0, 2000);
}

export function normalizeGermanWord(value: string): string {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase("de-DE")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^(der|die|das)\s+/, "");
}

export function searchGermanWords(value: string, limit = 6, records: GermanWordRecord[] = []): GermanWordRecord[] {
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
