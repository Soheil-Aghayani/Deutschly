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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readText(value: unknown, field: string, maxLength: number): string {
  if (typeof value !== "string") throw new GeminiRequestError(`Gemini returned an invalid ${field}.`);
  return value.trim().slice(0, maxLength);
}

function readEnum<T extends string>(value: unknown, field: string, values: Set<T>): T {
  if (typeof value !== "string" || !values.has(value as T)) {
    throw new GeminiRequestError(`Gemini returned an invalid ${field}.`);
  }
  return value as T;
}

export function parseGeminiCardReview(payload: unknown): GeminiCardReview {
  const source = isRecord(payload) && isRecord(payload.review) ? payload.review : payload;
  if (!isRecord(source)) throw new GeminiRequestError("Gemini returned an invalid card review.");

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
  const normalizedEndpoint = endpoint.trim();
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
    const message = isRecord(payload) && typeof payload.error === "string"
      ? payload.error
      : response.status === 404 || response.status === 405
        ? "Gemini bridge is not available at this address. Run the private server on the PC and set its URL in Set up sync."
        : `Gemini request failed (${response.status}).`;
    throw new GeminiRequestError(message, response.status);
  }
  if (!isRecord(payload)) throw new GeminiRequestError("The Gemini bridge returned an invalid response.", response.status);
  return payload;
}

export async function reviewCardWithGemini(endpoint: string, input: GeminiCardReviewInput): Promise<GeminiCardReview> {
  const response = await fetch(geminiReviewUrl(endpoint), {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ card: input }),
  });

  return parseGeminiCardReview(await readResponse(response));
}
