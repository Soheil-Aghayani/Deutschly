import { afterEach, describe, expect, it, vi } from "vitest";
import { aiUsageUrl, generateGermanWordBatch, geminiReviewUrl, geminiWordBatchUrl, getAiUsageStatus, getDefaultAiSettings, normalizeAiSettings, parseAiUsageStatus, parseGeminiCardReview, parseGermanWordBatch, reviewCardWithGemini } from "./gemini";

afterEach(() => {
  vi.restoreAllMocks();
});

const review = {
  verdict: "needs-review",
  article: "das",
  article_confidence: "high",
  plural: "Eissorten",
  plural_confidence: "medium",
  translation: "ice cream",
  example: "Ich esse gern Eis.",
  explanation: "The everyday meaning is usually uncountable; a plural is only needed for types or servings.",
  duplicate_hint: "No exact local match was supplied.",
};

describe("Gemini card review bridge", () => {
  it("normalizes user-owned AI provider settings", () => {
    expect(normalizeAiSettings({ provider: "ollama", endpoint: "", model: "" })).toEqual({
      provider: "ollama",
      endpoint: "http://127.0.0.1:11434",
      apiKey: "",
      model: "qwen2.5:3b",
    });
    expect(normalizeAiSettings({ provider: "webllm", endpoint: "https://should-not-be-used", model: "gemini-2.0-flash" })).toMatchObject({
      provider: "webllm",
      endpoint: "",
      model: "Llama-3.2-1B-Instruct-q4f16_1-MLC",
    });
    expect(getDefaultAiSettings().provider).toBe("off");
  });

  it("maps the sync server URL to the review route", () => {
    expect(geminiReviewUrl("")).toBe("/api/gemini/check-card");
    expect(geminiReviewUrl("/api/sync")).toBe("/api/gemini/check-card");
    expect(geminiReviewUrl("http://192.168.1.20:8787/api/sync")).toBe("http://192.168.1.20:8787/api/gemini/check-card");
  });

  it("normalizes the validated review shape for the UI", () => {
    expect(parseGeminiCardReview({ review })).toEqual({
      verdict: "needs-review",
      article: "das",
      articleConfidence: "high",
      plural: "Eissorten",
      pluralConfidence: "medium",
      translation: "ice cream",
      example: "Ich esse gern Eis.",
      explanation: review.explanation,
      duplicateHint: review.duplicate_hint,
    });
  });

  it("posts only card data to the local bridge and parses its response", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ review }), { status: 200 }));
    const result = await reviewCardWithGemini("/api/sync", {
      german: "Eis",
      translation: "ice cream",
      article: "das",
      plural: "",
      example: "Ich esse gern Eis.",
      note: "",
      kind: "word",
      existingMatches: [],
    });

    expect(result.article).toBe("das");
    expect(fetchMock).toHaveBeenCalledWith("/api/gemini/check-card", expect.objectContaining({ method: "POST" }));
    expect(fetchMock.mock.calls[0]?.[1]).not.toHaveProperty("headers.x-goog-api-key");
  });

  it("explains when a static host cannot serve the Gemini bridge", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("Method Not Allowed", { status: 405 }));

    await expect(reviewCardWithGemini("https://soheil-aghayani.github.io/Deutschly/", {
      german: "Eis",
      translation: "ice cream",
      article: "das",
      plural: "",
      example: "Das Eis schmeckt gut.",
      note: "",
      kind: "word",
      existingMatches: [],
    })).rejects.toThrow("reachable HTTPS bridge in the published app");
  });

  it("rejects a response with an unsupported article", () => {
    expect(() => parseGeminiCardReview({ review: { ...review, article: "ein" } })).toThrow("invalid article");
  });

  it("uses a user Gemini key without sending it to the bridge route", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({
      candidates: [{ content: { parts: [{ text: JSON.stringify(review) }] } }],
    }), { status: 200 }));
    await reviewCardWithGemini({ provider: "gemini", endpoint: "", apiKey: "user-key", model: "gemini-2.0-flash" }, {
      german: "Eis",
      translation: "ice cream",
      article: "das",
      plural: "",
      example: "Ich esse gern Eis.",
      note: "",
      kind: "word",
      existingMatches: [],
    });
    expect(fetchMock.mock.calls[0]?.[0]).toContain("generativelanguage.googleapis.com");
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ headers: expect.objectContaining({ "x-goog-api-key": "user-key" }) });
  });
});

describe("Gemini German word agent bridge", () => {
  const word = {
    id: "gemini-a1-eis",
    german: "Eis",
    englishMeanings: ["ice cream", "ice"],
    article: "das",
    level: "A1",
    partOfSpeech: "noun",
    examples: ["Ich esse gern Eis."],
    tags: ["food", "everyday"],
  };

  it("maps the sync server URL to the word batch route", () => {
    expect(geminiWordBatchUrl("")).toBe("/api/gemini/word-batch");
    expect(geminiWordBatchUrl("/api/sync")).toBe("/api/gemini/word-batch");
    expect(geminiWordBatchUrl("http://192.168.1.20:8787/api/sync")).toBe("http://192.168.1.20:8787/api/gemini/word-batch");
  });

  it("maps the sync server URL to the AI usage route", () => {
    expect(aiUsageUrl("/api/sync")).toBe("/api/usage");
  });

  it("parses the AI usage window and daily allocation", () => {
    expect(parseAiUsageStatus({
      usage: {
        scope: "cloudflare-worker-ip-minute",
        limit: 12,
        remaining: 9,
        resetAt: "2026-09-10T20:00:00.000Z",
        dailyNeurons: 10_000,
        dailyResetAt: "2026-09-11T00:00:00.000Z",
      },
    })).toEqual({
      scope: "cloudflare-worker-ip-minute",
      limit: 12,
      remaining: 9,
      resetAt: "2026-09-10T20:00:00.000Z",
      dailyNeurons: 10_000,
      dailyResetAt: "2026-09-11T00:00:00.000Z",
    });
  });

  it("loads AI usage without sending a body", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({
      usage: { scope: "cloudflare-worker-ip-minute", limit: 12, remaining: 12 },
    }), { status: 200 }));
    const result = await getAiUsageStatus("/api/sync");

    expect(result.remaining).toBe(12);
    expect(fetchMock).toHaveBeenCalledWith("/api/usage", expect.objectContaining({ method: "GET", cache: "no-store" }));
  });

  it("parses a structured batch without requiring source fields", () => {
    expect(parseGermanWordBatch({ level: "A1", words: [word], requestedCount: 1, returnedCount: 1 })).toEqual({
      level: "A1",
      words: [word],
      requestedCount: 1,
      returnedCount: 1,
    });
  });

  it("accepts every supported CEFR level", () => {
    expect(parseGermanWordBatch({ level: "C1", words: [{ ...word, id: "gemini-c1-zuverlaessig", level: "C1", german: "zuverlässig", article: "none", partOfSpeech: "adjective" }] }).level).toBe("C1");
  });

  it("normalizes a German part-of-speech label from the bridge", () => {
    const result = parseGermanWordBatch({ level: "A1", words: [{ ...word, article: "none", german: "schnell", partOfSpeech: "Adjektiv" }] });
    expect(result.words[0]?.partOfSpeech).toBe("adjective");
  });

  it("preserves an optional course source on a generated word", () => {
    const result = parseGermanWordBatch({
      level: "A1",
      words: [{
        ...word,
        source: { book: "Menschen A1.1 Kursbuch", lesson: "Lesson 1", page: 9 },
      }],
    });

    expect(result.words[0]?.source).toEqual({
      book: "Menschen A1.1 Kursbuch",
      lesson: "Lesson 1",
      page: 9,
    });
  });

  it("posts the word batch request without exposing a Gemini key", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ level: "B2", words: [{ ...word, id: "gemini-b2-sorgfaeltig", level: "B2", german: "sorgfältig", article: "none", partOfSpeech: "adjective" }], requestedCount: 1, returnedCount: 1 }), { status: 200 }));
    const result = await generateGermanWordBatch("/api/sync", { level: "B2", count: 1, partOfSpeech: "adjective", existingWords: ["Eis"] });

    expect(result.level).toBe("B2");
    expect(fetchMock).toHaveBeenCalledWith("/api/gemini/word-batch", expect.objectContaining({ method: "POST" }));
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toMatchObject({ level: "B2", partOfSpeech: "adjective" });
    expect(fetchMock.mock.calls[0]?.[1]).not.toHaveProperty("headers.x-goog-api-key");
  });
});
