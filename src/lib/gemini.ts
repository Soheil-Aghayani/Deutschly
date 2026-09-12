import { formatGermanPartOfSpeech } from "../data/germanWords";
import type { GermanWordArticle, GermanWordPartOfSpeech, GermanWordRecord, GermanWordSource } from "../data/germanWords";
import { DEFAULT_WEBLLM_MODEL, runWebLlmJson } from "./webllm";

export type GeminiArticle = "der" | "die" | "das" | "plural" | "none";
export type GeminiConfidence = "high" | "medium" | "low";
export type GeminiReviewVerdict = "looks-good" | "needs-review";
export type AiProvider = "off" | "cloudflare" | "gemini" | "ollama" | "webllm" | "bridge";

export interface AiSettings {
  provider: AiProvider;
  endpoint: string;
  apiKey: string;
  model: string;
}

const DEFAULT_GEMINI_MODEL = "gemini-2.0-flash";
const DEFAULT_OLLAMA_MODEL = "qwen2.5:3b";
const DEFAULT_OLLAMA_ENDPOINT = "http://127.0.0.1:11434";

export function getDefaultAiSettings(): AiSettings {
  const configuredEndpoint = String(import.meta.env.VITE_AI_BRIDGE_URL || "").trim();
  return {
    provider: configuredEndpoint ? "cloudflare" : "off",
    endpoint: configuredEndpoint,
    apiKey: "",
    model: configuredEndpoint ? "" : DEFAULT_GEMINI_MODEL,
  };
}

export function normalizeAiSettings(value: unknown): AiSettings {
  const fallback = getDefaultAiSettings();
  if (!isRecord(value)) return fallback;
  const provider = ["off", "cloudflare", "gemini", "ollama", "webllm", "bridge"].includes(String(value.provider))
    ? String(value.provider) as AiProvider
    : fallback.provider;
  const endpoint = typeof value.endpoint === "string" ? value.endpoint.trim().slice(0, 500) : fallback.endpoint;
  const apiKey = typeof value.apiKey === "string" ? value.apiKey.slice(0, 500) : fallback.apiKey;
  const model = typeof value.model === "string" ? value.model.trim().slice(0, 120) : fallback.model;
  return {
    provider,
    endpoint: provider === "ollama" ? endpoint || DEFAULT_OLLAMA_ENDPOINT : provider === "webllm" ? "" : endpoint,
    apiKey,
    model: provider === "webllm" ? DEFAULT_WEBLLM_MODEL : model || (provider === "ollama" ? DEFAULT_OLLAMA_MODEL : DEFAULT_GEMINI_MODEL),
  };
}

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

export type GermanWordBatchLevel = "A1" | "A2" | "B1" | "B2" | "C1" | "C2";
export type GermanWordBatchPartOfSpeech = GermanWordPartOfSpeech | "all";

export interface GermanWordBatchRequest {
  level: GermanWordBatchLevel;
  count: number;
  existingWords: string[];
  partOfSpeech?: GermanWordBatchPartOfSpeech;
}

export interface GermanWordBatchResponse {
  level: GermanWordBatchLevel;
  words: GermanWordRecord[];
  requestedCount: number;
  returnedCount: number;
  model?: string;
}

export interface AiUsageStatus {
  scope: string;
  limit: number | null;
  remaining: number | null;
  resetAt?: string;
  dailyNeurons?: number;
  dailyResetAt?: string;
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
const GERMAN_WORD_BATCH_LEVELS = new Set<GermanWordBatchLevel>(["A1", "A2", "B1", "B2", "C1", "C2"]);
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

function providerUnavailableMessage(provider: AiProvider): string {
  if (provider === "off") return "AI is turned off. You can still study saved cards and use the local word bank.";
  if (provider === "ollama") return "Ollama is not reachable. Start Ollama on this device and confirm the local model name in Settings.";
  if (provider === "gemini") return "Gemini could not be reached. Check your API key, model name, and network connection.";
  if (provider === "webllm") return "The on-device model could not start. This device needs WebGPU and enough free memory; use the PC bridge or Ollama if it is unavailable here.";
  return bridgeUnavailableMessage();
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

function settingsForTarget(target: string | AiSettings): AiSettings {
  if (typeof target === "string") {
    const endpoint = target.trim();
    return {
      provider: "bridge",
      endpoint,
      apiKey: "",
      model: DEFAULT_GEMINI_MODEL,
    };
  }
  return normalizeAiSettings(target);
}

export function geminiReviewUrl(target: string | AiSettings): string {
  const settings = settingsForTarget(target);
  const configuredBridge = String(import.meta.env.VITE_AI_BRIDGE_URL || "").trim();
  const explicitEndpoint = settings.endpoint.trim();
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

async function readResponse(response: Response, provider: AiProvider = "bridge"): Promise<Record<string, unknown>> {
  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    // Keep the transport error useful even when a proxy returned HTML.
  }

  if (!response.ok) {
    const message = response.status === 404 || response.status === 405
      ? providerUnavailableMessage(provider)
      : isRecord(payload) && typeof payload.error === "string"
        ? payload.error
        : `AI request failed (${response.status}).`;
    throw new GeminiRequestError(message, response.status);
  }
  if (!isRecord(payload)) throw new GeminiRequestError("The AI provider returned an invalid response.", response.status);
  return payload;
}

function bridgeHeaders(settings: AiSettings): HeadersInit {
  return {
    "Content-Type": "application/json",
    Accept: "application/json",
    ...(settings.apiKey && (settings.provider === "cloudflare" || settings.provider === "bridge")
      ? { Authorization: `Bearer ${settings.apiKey}` }
      : {}),
  };
}

function parseJsonText(value: string, label: string): unknown {
  const cleaned = value.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
  try {
    return JSON.parse(cleaned) as unknown;
  } catch {
    throw new GeminiRequestError(`The AI returned invalid JSON for ${label}.`);
  }
}

function readGeminiText(payload: unknown): string {
  if (!isRecord(payload) || !Array.isArray(payload.candidates)) throw new GeminiRequestError("Gemini returned no usable answer.");
  const candidate = payload.candidates[0];
  if (!isRecord(candidate) || !isRecord(candidate.content) || !Array.isArray(candidate.content.parts)) {
    throw new GeminiRequestError("Gemini returned no usable answer.");
  }
  const text = candidate.content.parts
    .filter(isRecord)
    .map((part) => typeof part.text === "string" ? part.text : "")
    .join("\n")
    .trim();
  if (!text) throw new GeminiRequestError("Gemini returned an empty answer.");
  return text;
}

const cardReviewPrompt = (input: GeminiCardReviewInput) => `
You are a careful German teacher. Review this flashcard and return JSON only.
Required keys: verdict (looks-good or needs-review), article (der, die, das, plural, or none), article_confidence (high, medium, low), plural, plural_confidence (high, medium, low), translation, example, explanation, duplicate_hint.
Keep the learner-facing text concise. Use English explanations and a natural German example.
Card: ${JSON.stringify(input)}
Existing cards with the same headword are only duplicate clues; do not invent duplicates.
`;

const wordBatchPrompt = (input: GermanWordBatchRequest) => `
Create a checked German vocabulary batch for a learner at level ${input.level}. Return JSON only with keys level, requestedCount, returnedCount, words.
Each word must contain id, german, englishMeanings (array), article (der, die, das, plural, or none), level (${input.level}), partOfSpeech (noun, verb, adjective, adverb, pronoun, preposition, conjunction, interjection, numeral, particle, phrase, or grammar), examples (array), tags (array).
${input.partOfSpeech && input.partOfSpeech !== "all" ? `Every word must be a ${input.partOfSpeech}.` : "Use a useful mix of parts of speech when appropriate."}
Return at most ${input.count} useful words and do not use any existing word: ${JSON.stringify(input.existingWords)}
`;

async function requestDirectGemini(settings: AiSettings, prompt: string): Promise<unknown> {
  const model = encodeURIComponent(settings.model || DEFAULT_GEMINI_MODEL);
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json", "x-goog-api-key": settings.apiKey },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: "application/json", temperature: 0.2 },
    }),
  });
  const payload = await readResponse(response, settings.provider);
  return parseJsonText(readGeminiText(payload), "the response");
}

async function requestOllama(settings: AiSettings, prompt: string): Promise<unknown> {
  const endpoint = (settings.endpoint || DEFAULT_OLLAMA_ENDPOINT).replace(/\/$/, "");
  const response = await fetch(`${endpoint}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      model: settings.model || DEFAULT_OLLAMA_MODEL,
      messages: [{ role: "user", content: prompt }],
      stream: false,
      format: "json",
      options: { temperature: 0.2 },
    }),
  });
  const payload = await readResponse(response, settings.provider);
  if (!isRecord(payload) || !isRecord(payload.message) || typeof payload.message.content !== "string") {
    throw new GeminiRequestError("Ollama returned no usable answer.");
  }
  return parseJsonText(payload.message.content, "the response");
}

async function requestWebLlm(settings: AiSettings, prompt: string): Promise<unknown> {
  try {
    return parseJsonText(await runWebLlmJson(prompt, { model: settings.model || DEFAULT_WEBLLM_MODEL }), "the response");
  } catch (error) {
    if (error instanceof GeminiRequestError) throw error;
    throw new GeminiRequestError(error instanceof Error ? error.message : providerUnavailableMessage("webllm"));
  }
}

async function requestStructuredAi(target: string | AiSettings, prompt: string): Promise<unknown> {
  const settings = settingsForTarget(target);
  if (settings.provider === "off") throw new GeminiRequestError(providerUnavailableMessage(settings.provider));
  try {
    if (settings.provider === "gemini") {
      if (!settings.apiKey.trim()) throw new GeminiRequestError("Add your Gemini API key in Settings before using Gemini.");
      return await requestDirectGemini(settings, prompt);
    }
    if (settings.provider === "ollama") return await requestOllama(settings, prompt);
    if (settings.provider === "webllm") return await requestWebLlm(settings, prompt);
    if (!settings.endpoint.trim()) throw new GeminiRequestError("Add an AI endpoint in Settings before using this provider.");
    const response = await fetch(geminiReviewUrl(settings), {
      method: "POST",
      headers: bridgeHeaders(settings),
      body: JSON.stringify({ card: prompt }),
    });
    return await readResponse(response, settings.provider);
  } catch (error) {
    if (error instanceof GeminiRequestError) throw error;
    throw new GeminiRequestError(providerUnavailableMessage(settings.provider));
  }
}

export async function reviewCardWithGemini(target: string | AiSettings, input: GeminiCardReviewInput): Promise<GeminiCardReview> {
  const settings = settingsForTarget(target);
  if (settings.provider === "gemini" || settings.provider === "ollama" || settings.provider === "webllm") {
    return parseGeminiCardReview(await requestStructuredAi(settings, cardReviewPrompt(input)));
  }
  let response: Response;
  try {
    response = await fetch(geminiReviewUrl(settings), {
      method: "POST",
      headers: bridgeHeaders(settings),
      body: JSON.stringify({ card: input }),
    });
  } catch {
    throw new GeminiRequestError(providerUnavailableMessage(settings.provider));
  }

  return parseGeminiCardReview(await readResponse(response, settings.provider));
}

export function geminiWordBatchUrl(target: string | AiSettings): string {
  return geminiReviewUrl(target).replace(/\/check-card$/, "/word-batch");
}

export function aiUsageUrl(target: string | AiSettings): string {
  return geminiReviewUrl(target).replace(/\/api\/gemini\/check-card$/, "/api/usage");
}

function readOptionalNumber(value: unknown, field: string): number | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "number" || !Number.isFinite(value)) throw new GeminiRequestError(`The AI returned an invalid ${field}.`);
  return value;
}

function readOptionalIsoDate(value: unknown, field: string): string | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) throw new GeminiRequestError(`The AI returned an invalid ${field}.`);
  return value;
}

export function parseAiUsageStatus(payload: unknown): AiUsageStatus {
  const source = isRecord(payload) && isRecord(payload.usage) ? payload.usage : payload;
  if (!isRecord(source)) throw new GeminiRequestError("The AI returned an invalid usage status.");
  const dailyNeurons = readOptionalNumber(source.dailyNeurons, "daily neuron allocation");
  const resetAt = readOptionalIsoDate(source.resetAt, "usage reset time");
  const dailyResetAt = readOptionalIsoDate(source.dailyResetAt, "daily reset time");
  return {
    scope: readText(source.scope ?? "unknown", "usage scope", 64),
    limit: readOptionalNumber(source.limit, "usage limit"),
    remaining: readOptionalNumber(source.remaining, "remaining usage"),
    ...(resetAt ? { resetAt } : {}),
    ...(dailyNeurons === null ? {} : { dailyNeurons }),
    ...(dailyResetAt ? { dailyResetAt } : {}),
  };
}

export async function getAiUsageStatus(target: string | AiSettings): Promise<AiUsageStatus> {
  const settings = settingsForTarget(target);
  if (settings.provider !== "cloudflare" && settings.provider !== "bridge") {
    return { scope: settings.provider, limit: null, remaining: null };
  }
  let response: Response;
  try {
    response = await fetch(aiUsageUrl(settings), {
      method: "GET",
      headers: { Accept: "application/json", ...(settings.apiKey ? { Authorization: `Bearer ${settings.apiKey}` } : {}) },
      cache: "no-store",
    });
  } catch {
    throw new GeminiRequestError(providerUnavailableMessage(settings.provider));
  }

  return parseAiUsageStatus(await readResponse(response, settings.provider));
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
  const rawPartOfSpeech = readOptionalText(value.partOfSpeech, "part of speech", 40);
  const partOfSpeech = formatGermanPartOfSpeech(rawPartOfSpeech);
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
  const level = readEnum(payload.level, "word level", GERMAN_WORD_BATCH_LEVELS);
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

export async function generateGermanWordBatch(target: string | AiSettings, input: GermanWordBatchRequest): Promise<GermanWordBatchResponse> {
  const settings = settingsForTarget(target);
  if (settings.provider === "gemini" || settings.provider === "ollama" || settings.provider === "webllm") {
    return parseGermanWordBatch(await requestStructuredAi(settings, wordBatchPrompt(input)));
  }
  let response: Response;
  try {
    response = await fetch(geminiWordBatchUrl(settings), {
      method: "POST",
      headers: bridgeHeaders(settings),
      body: JSON.stringify(input),
    });
  } catch {
    throw new GeminiRequestError(providerUnavailableMessage(settings.provider));
  }

  return parseGermanWordBatch(await readResponse(response, settings.provider));
}
