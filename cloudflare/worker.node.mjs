import assert from "node:assert/strict";
import test from "node:test";
import worker from "./worker.js";

const env = {
  AI_MODEL: "@cf/meta/llama-3.1-8b-instruct-fast",
  ALLOWED_ORIGINS: "https://soheil-aghayani.github.io,http://tauri.localhost,https://tauri.localhost",
  AI: {
    async run(model, request) {
      assert.equal(model, env.AI_MODEL);
      assert.equal(request.response_format.type, "json_schema");
      if (request.response_format.json_schema.properties?.words) {
        return {
          response: JSON.stringify({
            words: [{
              german: "Bahnhof",
              english_meanings: ["railway station"],
              article: "der",
              article_variants: [],
              plural: "Bahnhöfe",
              part_of_speech: "noun",
              examples: ["Der Bahnhof ist in der Nähe."],
              tags: ["travel"],
            }],
          }),
        };
      }
      return {
        response: JSON.stringify({
          verdict: "looks-good",
          article: "der",
          article_confidence: "high",
          plural: "Bahnhöfe",
          plural_confidence: "high",
          translation: "railway station",
          example: "Der Bahnhof ist in der Nähe.",
          explanation: "The article and plural are standard.",
          duplicate_hint: "No duplicate was supplied.",
        }),
      };
    },
  },
};

function request(path, body, ip, origin = "https://soheil-aghayani.github.io") {
  return new Request(`https://deutschly-ai.example${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      Origin: origin,
      "CF-Connecting-IP": ip,
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

test("returns a health response", async () => {
  const response = await worker.fetch(request("/api/health"), env);
  assert.equal(response.status, 200);
  assert.equal((await response.json()).status, "ok");
});

test("reports the protective request window without consuming it", async () => {
  const response = await worker.fetch(request("/api/usage", undefined, "10.0.0.1"), env);
  const payload = await response.json();
  assert.equal(response.status, 200);
  assert.equal(payload.usage.limit, 12);
  assert.equal(payload.usage.remaining, 12);
  assert.equal(response.headers.get("X-AI-RateLimit-Remaining"), "12");
  assert.equal(payload.usage.dailyNeurons, 10_000);
});

test("reviews a card and generates a normalized word", async () => {
  const reviewResponse = await worker.fetch(request("/api/gemini/check-card", {
    card: {
      german: "Bahnhof",
      translation: "railway station",
      article: "der",
      plural: "Bahnhöfe",
      example: "Der Bahnhof ist in der Nähe.",
      note: "",
      kind: "word",
      existingMatches: [],
    },
  }, "10.0.0.2"), env);
  assert.equal(reviewResponse.status, 200);
  assert.equal((await reviewResponse.json()).review.verdict, "looks-good");

  const wordResponse = await worker.fetch(request("/api/gemini/word-batch", {
    level: "A1",
    count: 1,
    existingWords: [],
  }, "10.0.0.3"), env);
  const payload = await wordResponse.json();
  assert.equal(wordResponse.status, 200);
  assert.equal(payload.words[0].id, "ai-a1-bahnhof");
  assert.equal(payload.words[0].article, "der");
});

test("rejects an origin outside the allowlist", async () => {
  const response = await worker.fetch(request("/api/gemini/word-batch", {
    level: "A1",
    count: 1,
    existingWords: [],
  }, "10.0.0.4", "https://not-allowed.example"), env);
  assert.equal(response.status, 403);
});

test("accepts the Android Tauri origin", async () => {
  const response = await worker.fetch(request("/api/gemini/word-batch", {
    level: "A1",
    count: 1,
    existingWords: [],
  }, "10.0.0.5", "http://tauri.localhost"), env);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("Access-Control-Allow-Origin"), "http://tauri.localhost");
});
