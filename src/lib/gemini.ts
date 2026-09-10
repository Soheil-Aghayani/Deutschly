import type { GermanWordArticle, GermanWordRecord, GermanWordSource } from "../data/germanWords";

export type GeminiArticle = "der" | "die" | "das" | "plural" | "none";
export type GeminiConfidence = "high" | "medium" | "low";
export type GeminiReviewVerdict = "looks-good" | "needs-review";

export interface GeminiCardMatchInput {
  german: string;
  article: GeminiArticle;
  translation: string;
}

export interface GeminiCardReviewInput {
  german: string;
  translation: string;
  article: GeminiArticle;
  plural: string;
  example: string;
  note: string;
  kind: "word" | "phrase" | "grammar";
  existingMatches: GeminiCardMatchInput[];
}

export interface GeminiCardReview {
  verdict: GeminiReviewVerdict;
  article: GeminiArticle;
  articleConfidence: GeminiConfidence;
  plural: string;
  pluralConfidence: GeminiConfidence;
  translation: string;
  example: string;
  explanation: string;
  duplicateHint: string;
}

export type GermanWordBatchLevel = "A1" | "A2";

export interface GermanWordBatchRequest {
  level: GermanWordBatchLevel;
  count: number;
  existingWords: string[];
}

export interface GermanWordBatchResponse {
  level: GermanWordBatchLevel;
  words: GermanWordRecord[];
  requestedCount: number;
  returnedCount: number;
  model?: string;
}

export class GeminiRequestError extends Error {
  status: number;

  constructor(message: string, status = 0) {
    super(message);
    this.name = "GeminiRequestError";
    this.status = status;
  }
}

const ARTICLES = new Set<GeminiArticle>(["der", "die", "das", "plural", "none"]);
const CONFIDENCE = new Set<GeminiConfidence>(["high", "medium", "low"]);
const VERDICTS = new Set<GeminiReviewVerdict>(["looks-good", "needs-review"]);
const GERMAN_WORD_ARTICLES = new Set<GermanWordArticle>(["der", "die", "das", "plural", "none"]);
const GERMAN_WORD_LEVELS = new Set<GermanWordRecord["level"]>(["A1", "A2", "B1", "B2", "C1", "C2", "unknown"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function bridgeUnavailableMessage(): string {
  const hostname = typeof window !== "undefined" ? window.location.hostname : "";
  if (hostname === "localhost" || hostname === "127.0.0.1") {
    return "The local AI is ready once the bridge is running. Start npm run sync-server from the Deutschly project folder, then try again.";
  }
  return "The AI needs a reachable HTTPS bridge in the published app. Run the bridge on your PC, then add its URL in Set up sync. The checked word bank is still available here.";
}

function readText(value: unknown, field: string, maxLength: number): string {
  if (typeof value !== "string") throw new GeminiRequestError(`The AI returned an invalid ${field}.`);
  return value.trim().slice(0, maxLength);
}

function readEnum<T extends string>(value: unknown, field: string, values: Set<T>): T {
  if (typeof value !== "string" || !values.has(value as T)) {
    throw new GeminiRequestError(`The AI returned an invalid ${field}.`);
  }
  return value as T;
}

export function parseGeminiCardReview(payload: unknown): GeminiCardReview {
  const source = isRecord(payload) && isRecord(payload.review) ? payload.review : payload;
  if (!isRecord(source)) throw new GeminiRequestError("The AI returned an invalid card review.");

  return {
    verdict: readEnum(source.verdict, "review verdict", VERDICTS),
    article: readEnum(source.article, "article", ARTICLES),
    articleConfidence: readEnum(source.article_confidence ?? source.articleConfidence, "article confidence", CONFIDENCE),
    plural: readText(source.plural, "plural", 120),
    pluralConfidence: readEnum(source.plural_confidence ?? source.pluralConfidence, "plural confidence", CONFIDENCE),
    translation: readText(source.translation, "translation", 240),
    example: readText(source.example, "example", 320),
    explanation: readText(source.explanation, "explanation", 360),
    duplicateHint: readText(source.duplicate_hint ?? source.duplicateHint, "duplicate hint", 280),
  };
}

export function geminiReviewUrl(endpoint: string): string {
  const configuredBridge = String(import.meta.env.VITE_AI_BRIDGE_URL || "").trim();
  const explicitEndpoint = endpoint.trim();
  const normalizedEndpoint = explicitEndpoint === "/api/sync" && configuredBridge
    ? configuredBridge
    : explicitEndpoint || configuredBridge;
  if (!normalizedEndpoint) return "/api/gemini/check-card";
  const fallbackOrigin = typeof window !== "undefined" ? window.location.origin : "http://localhost";

  try {
    const url = new URL(normalizedEndpoint, fallbackOrigin);
    const path = url.pathname.replace(/\/$/, "");
    if (path.endsWith("/api/gemini/check-card")) {
      url.pathname = path;
    } else if (path.endsWith("/api/sync")) {
      url.pathname = `${path.slice(0, -9)}/api/gemini/check-card`;
    } else if (path === "/api" || path.endsWith("/api")) {
      url.pathname = `${path}/gemini/check-card`;
    } else {
      url.pathname = `${path}/api/gemini/check-card`;
    }
    url.search = "";
    url.hash = "";
    return normalizedEndpoint.startsWith("http://") || normalizedEndpoint.startsWith("https://")
      ? url.toString()
      : `${url.pathname}${url.search}`;
  } catch {
    return normalizedEndpoint.replace(/\/api\/sync\/?$/, "/api/gemini/check-card");
  }
}

async function readResponse(response: Response): Promise<Record<string, unknown>> {
  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    // Keep the transport error useful even when a proxy returned HTML.
  }

  if (!response.ok) {
    const message = response.status === 404 || response.status === 405
      ? bridgeUnavailableMessage()
      : isRecord(payload) && typeof payload.error === "string"
        ? payload.error
        : `AI request failed (${response.status}).`;
    throw new GeminiRequestError(message, response.status);
  }
  if (!isRecord(payload)) throw new GeminiRequestError("The AI bridge returned an invalid response.", response.status);
  return payload;
}

export async function reviewCardWithGemini(endpoint: string, input: GeminiCardReviewInput): Promise<GeminiCardReview> {
  let response: Response;
  try {
    response = await fetch(geminiReviewUrl(endpoint), {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ card: input }),
    });
  } catch {
    throw new GeminiRequestError(bridgeUnavailableMessage());
  }

  return parseGeminiCardReview(await readResponse(response));
}

export function geminiWordBatchUrl(endpoint: string): string {
  return geminiReviewUrl(endpoint).replace(/\/check-card$/, "/word-batch");
}

function readStringArray(value: unknown, field: string, maxItems: number, maxLength: number): string[] {
  if (!Array.isArray(value) || value.length > maxItems) throw new GeminiRequestError(`The AI returned an invalid ${field}.`);
  return value.map((item) => readText(item, field, maxLength)).filter(Boolean);
}

function readOptionalText(value: unknown, field: string, maxLength: number): string {
  return value === undefined || value === null ? "" : readText(value, field, maxLength);
}

function readWordSource(value: unknown): GermanWordSource | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value)) throw new GeminiRequestError("The AI returned an invalid word source.");

  const page = value.page;
  if (typeof page !== "number" || !Number.isInteger(page) || page < 1) {
    throw new GeminiRequestError("The AI returned an invalid source page.");
  }

  const context = readOptionalText(value.context, "source context", 240);
  return {
    book: readText(value.book, "source book", 120),
    lesson: readText(value.lesson, "source lesson", 80),
    page,
    ...(context ? { context } : {}),
  };
}

function parseGermanWordRecord(value: unknown): GermanWordRecord {
  if (!isRecord(value)) throw new GeminiRequestError("The AI returned an invalid German word.");
  const article = readEnum(value.article, "article", GERMAN_WORD_ARTICLES);
  const level = readEnum(value.level, "word level", GERMAN_WORD_LEVELS);
  const articleAlternatives = value.articleAlternatives === undefined
    ? []
    : readStringArray(value.articleAlternatives, "article variants", 3, 8)
      .filter((item): item is Extract<GermanWordArticle, "der" | "die" | "das"> => ["der", "die", "das"].includes(item) && item !== article);
  const plural = readOptionalText(value.plural, "plural", 120);
  const partOfSpeech = readOptionalText(value.partOfSpeech, "part of speech", 40);
  const source = readWordSource(value.source);
  return {
    id: readText(value.id, "word id", 120),
    german: readText(value.german, "German word", 120),
    englishMeanings: readStringArray(value.englishMeanings, "English meanings", 4, 120),
    article,
    ...(articleAlternatives.length > 0 ? { articleAlternatives } : {}),
    ...(plural ? { plural } : {}),
    level,
    ...(partOfSpeech ? { partOfSpeech } : {}),
    ...(value.examples === undefined ? {} : { examples: readStringArray(value.examples, "examples", 2, 220) }),
    tags: readStringArray(value.tags, "tags", 8, 32),
    ...(source ? { source } : {}),
  };
}

export function parseGermanWordBatch(payload: unknown): GermanWordBatchResponse {
  if (!isRecord(payload)) throw new GeminiRequestError("The AI returned an invalid word batch.");
  const level = readEnum(payload.level, "word level", new Set<GermanWordBatchLevel>(["A1", "A2"]));
  if (!Array.isArray(payload.words)) throw new GeminiRequestError("The AI returned an invalid word list.");
  const words = payload.words.map(parseGermanWordRecord);
  return {
    level,
    words,
    requestedCount: typeof payload.requestedCount === "number" ? payload.requestedCount : words.length,
    returnedCount: typeof payload.returnedCount === "number" ? payload.returnedCount : words.length,
    ...(typeof payload.model === "string" ? { model: payload.model } : {}),
  };
}

export async function generateGermanWordBatch(endpoint: string, input: GermanWordBatchRequest): Promise<GermanWordBatchResponse> {
  let response: Response;
  try {
    response = await fetch(geminiWordBatchUrl(endpoint), {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(input),
    });
  } catch {
    throw new GeminiRequestError(bridgeUnavailableMessage());
  }

  return parseGermanWordBatch(await readResponse(response));
}
