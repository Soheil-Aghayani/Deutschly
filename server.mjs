import { createServer } from "node:http";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { randomUUID } from "node:crypto";

const args = process.argv.slice(2);

function readArg(name, fallback) {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
}

const host = readArg("--host", process.env.DEUTSCHLY_SYNC_HOST || "127.0.0.1");
const port = Number(readArg("--port", process.env.DEUTSCHLY_SYNC_PORT || "8787"));
const dataFile = join(process.cwd(), ".deutschly", "sync.json");
const maxBodyBytes = 5 * 1024 * 1024;

function responseHeaders(request) {
  const origin = request.headers.origin;
  return {
    "Access-Control-Allow-Origin": origin || "*",
    "Access-Control-Allow-Headers": "Content-Type, Accept",
    "Access-Control-Allow-Methods": "GET, PUT, OPTIONS",
    "Access-Control-Max-Age": "600",
    "Content-Type": "application/json; charset=utf-8",
    Vary: "Origin",
  };
}

function sendJson(request, response, status, payload) {
  const body = JSON.stringify(payload);
  response.writeHead(status, responseHeaders(request));
  response.end(body);
}

function getRoom(requestUrl) {
  const room = requestUrl.searchParams.get("room")?.toUpperCase().replace(/[^A-Z0-9]/g, "") || "";
  return room.length >= 6 && room.length <= 32 ? room : null;
}

async function readStore() {
  try {
    const value = JSON.parse(await readFile(dataFile, "utf8"));
    if (value && typeof value === "object" && value.rooms && typeof value.rooms === "object") return value;
  } catch (error) {
    if (error?.code !== "ENOENT") console.warn("Deutschly sync store could not be read; starting empty.", error);
  }
  return { version: 1, rooms: {} };
}

async function writeStore(store) {
  await mkdir(dirname(dataFile), { recursive: true });
  const temporaryFile = `${dataFile}.${randomUUID()}.tmp`;
  await writeFile(temporaryFile, JSON.stringify(store, null, 2), "utf8");
  await rename(temporaryFile, dataFile);
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];

    request.on("data", (chunk) => {
      size += chunk.length;
      if (size > maxBodyBytes) {
        reject(new Error("Sync payload is too large."));
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });
    request.on("end", () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
      } catch {
        reject(new Error("Sync payload must be valid JSON."));
      }
    });
    request.on("error", reject);
  });
}

function valueTimestamp(value) {
  const parsed = Date.parse(value || "");
  return Number.isFinite(parsed) ? parsed : 0;
}

function cardTimestamp(card) {
  return Math.max(valueTimestamp(card.updatedAt), valueTimestamp(card.lastReviewedAt));
}

function normalizeLookup(value) {
  return String(value || "")
    .trim()
    .normalize("NFKC")
    .toLocaleLowerCase("de-DE")
    .replace(/[.,!?;:()[\]{}"']/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeGermanTerm(value) {
  return normalizeLookup(value).replace(/^(der|die|das)\s+/, "").trim();
}

function cardMergeKey(card) {
  return `${normalizeGermanTerm(card.german)}|${card.article}|${normalizeLookup(card.translation)}`;
}

function mergeCardVersions(first, second) {
  const newer = cardTimestamp(first) >= cardTimestamp(second) ? first : second;
  const older = newer === first ? second : first;
  return {
    ...older,
    ...newer,
    tags: [...new Set([...(older.tags || []), ...(newer.tags || [])])].slice(0, 12),
  };
}

function mergeCards(existingCards, incomingCards) {
  const byId = new Map();
  [...existingCards, ...incomingCards].forEach((card) => {
    if (!card || typeof card !== "object" || typeof card.id !== "string") return;
    const current = byId.get(card.id);
    byId.set(card.id, current ? mergeCardVersions(card, current) : card);
  });

  const byMeaning = new Map();
  [...byId.values()].forEach((card) => {
    const key = cardMergeKey(card);
    const current = byMeaning.get(key);
    byMeaning.set(key, current ? mergeCardVersions(card, current) : card);
  });
  return [...byMeaning.values()];
}

function mergeStates(existing, incoming) {
  if (!existing) return incoming;
  const existingCards = Array.isArray(existing.cards) ? existing.cards : [];
  const incomingCards = Array.isArray(incoming.cards) ? incoming.cards : [];
  const existingReviews = Array.isArray(existing.weeklyReviews) ? existing.weeklyReviews : [];
  const incomingReviews = Array.isArray(incoming.weeklyReviews) ? incoming.weeklyReviews : [];
  const weeklyReviews = Array.from({ length: Math.max(7, existingReviews.length, incomingReviews.length) }, (_, index) => Math.max(existingReviews[index] || 0, incomingReviews[index] || 0));
  const latestReviewState = (existing.lastReviewDay || "") >= (incoming.lastReviewDay || "") ? existing : incoming;
  const existingPdf = existing.pdfImport;
  const incomingPdf = incoming.pdfImport;
  const pdfImport = existingPdf && incomingPdf
    ? valueTimestamp(existingPdf.extractedAt) >= valueTimestamp(incomingPdf.extractedAt) ? existingPdf : incomingPdf
    : existingPdf || incomingPdf;

  return {
    ...existing,
    ...incoming,
    cards: mergeCards(existingCards, incomingCards),
    reviewsToday: existing.lastReviewDay === incoming.lastReviewDay ? Math.max(existing.reviewsToday || 0, incoming.reviewsToday || 0) : latestReviewState.reviewsToday || 0,
    streak: Math.max(existing.streak || 0, incoming.streak || 0),
    mastered: Math.max(existing.mastered || 0, incoming.mastered || 0),
    studyMinutes: Math.max(existing.studyMinutes || 0, incoming.studyMinutes || 0),
    xp: Math.max(existing.xp || 0, incoming.xp || 0),
    totalReviews: Math.max(existing.totalReviews || 0, incoming.totalReviews || 0),
    correctReviews: Math.max(existing.correctReviews || 0, incoming.correctReviews || 0),
    bestStreak: Math.max(existing.bestStreak || 0, incoming.bestStreak || 0),
    achievements: [...new Set([...(existing.achievements || []), ...(incoming.achievements || [])])].slice(0, 24),
    weeklyReviews,
    sourceFileName: pdfImport?.fileName || incoming.sourceFileName || existing.sourceFileName || "",
    pdfImport,
    lastReviewDay: latestReviewState.lastReviewDay,
    lastStudyDay: (existing.lastStudyDay || "") >= (incoming.lastStudyDay || "") ? existing.lastStudyDay : incoming.lastStudyDay,
  };
}

async function handleRequest(request, response) {
  const requestUrl = new URL(request.url || "/", `http://${request.headers.host || "localhost"}`);

  if (request.method === "OPTIONS") {
    response.writeHead(204, responseHeaders(request));
    response.end();
    return;
  }

  if (request.method === "GET" && requestUrl.pathname === "/api/health") {
    sendJson(request, response, 200, { app: "deutschly-sync", version: 1, status: "ok" });
    return;
  }

  if (requestUrl.pathname !== "/api/sync" || !["GET", "PUT"].includes(request.method)) {
    sendJson(request, response, 404, { error: "Not found" });
    return;
  }

  const room = getRoom(requestUrl);
  if (!room) {
    sendJson(request, response, 400, { error: "A room code with 6–32 characters is required." });
    return;
  }

  const store = await readStore();

  if (request.method === "GET") {
    const document = store.rooms[room];
    if (!document) {
      sendJson(request, response, 404, { error: "This sync room has no saved data yet." });
      return;
    }
    sendJson(request, response, 200, { room, ...document });
    return;
  }

  const payload = await readBody(request);
  if (!payload || typeof payload !== "object" || !payload.state || typeof payload.state !== "object" || !Array.isArray(payload.state.cards)) {
    sendJson(request, response, 400, { error: "The sync document must include a cards array." });
    return;
  }
  if (payload.state.cards.length > 5000) {
    sendJson(request, response, 400, { error: "A sync room can contain at most 5,000 cards." });
    return;
  }

  const document = { updatedAt: new Date().toISOString(), state: mergeStates(store.rooms[room]?.state, payload.state) };
  store.rooms[room] = document;
  await writeStore(store);
  sendJson(request, response, 200, { room, ...document });
}

const server = createServer((request, response) => {
  handleRequest(request, response).catch((error) => {
    console.error("Deutschly sync request failed", error);
    if (!response.headersSent) sendJson(request, response, 500, { error: "The sync server could not complete the request." });
    else response.destroy();
  });
});

server.listen(port, host, () => {
  const displayHost = host === "0.0.0.0" ? "localhost" : host;
  console.log(`Deutschly sync server listening on http://${displayHost}:${port}`);
  console.log("Use the same room code on the PC and phone. Keep this server on a private network.");
});
