import { readFile, rename, writeFile } from "node:fs/promises";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";

const DEFAULT_SERVER = "http://127.0.0.1:8787";
const DEFAULT_OUTPUT = "src/data/germanWords.generated.json";
const BOOK = "Menschen A1.1 Kursbuch";

const LESSON_RANGES = [
  ["Lesson 1", 9, 12],
  ["Lesson 2", 13, 16],
  ["Lesson 3", 17, 24],
  ["Lesson 4", 25, 28],
  ["Lesson 5", 29, 32],
  ["Lesson 6", 33, 40],
  ["Lesson 7", 41, 44],
  ["Lesson 8", 45, 48],
  ["Lesson 9", 49, 56],
  ["Lesson 10", 57, 60],
  ["Lesson 11", 61, 64],
  ["Lesson 12", 65, 72],
];

const PDF_CANDIDATES = [
  ["Lied", "song", "Lesson 1", 9],
  ["Gespräch", "conversation", "Lesson 1", 10],
  ["Musik", "music", "Lesson 1", 10],
  ["Stunde", "hour or lesson", "Lesson 1", 12],
  ["Foto", "photo", "Lesson 3", 17],
  ["Familie", "family", "Lesson 3", 23],
  ["Vater", "father", "Lesson 3", 23],
  ["Mutter", "mother", "Lesson 3", 23],
  ["Tisch", "table", "Lesson 4", 25],
  ["Bett", "bed", "Lesson 4", 25],
  ["Lampe", "lamp", "Lesson 4", 26],
  ["Problem", "problem", "Lesson 4", 27],
  ["Brille", "glasses", "Lesson 5", 32],
  ["Arbeitsplatz", "workplace", "Lesson 6", 33],
  ["Schlüssel", "key", "Lesson 6", 34],
  ["Stuhl", "chair", "Lesson 6", 35],
  ["Schweiz", "Switzerland", "Lesson 1", 10],
  ["Türkei", "Turkey", "Lesson 1", 10],
  ["Person", "person", "Lesson 1", 11],
  ["Wendung", "expression", "Lesson 1", 12],
  ["Tag", "day", "Lesson 1", 12],
  ["Morgen", "morning", "Lesson 1", 12],
  ["Abend", "evening", "Lesson 1", 12],
  ["Land", "country", "Lesson 1", 10],
  ["Kärtchen", "small card", "Lesson 2", 14],
  ["Verb", "verb", "Lesson 2", 16],
  ["Student", "student", "Lesson 2", 14],
  ["Zahl", "number", "Lesson 2", 15],
  ["Ausbildung", "training or vocational education", "Lesson 2", 14],
  ["Herkunft", "origin", "Lesson 2", 16],
  ["Wohnort", "place of residence", "Lesson 2", 16],
  ["Familienstand", "marital status", "Lesson 2", 16],
  ["Profil", "profile", "Lesson 2", 14],
  ["Frau", "woman or Mrs.", "Lesson 3", 17],
  ["Tabelle", "table or chart", "Lesson 3", 18],
  ["Bildlexikon", "picture dictionary", "Lesson 3", 19],
  ["Familienmitglied", "family member", "Lesson 3", 19],
  ["Gebiet", "area or region", "Lesson 3", 20],
  ["Auflösung", "solution", "Lesson 3", 20],
  ["Text", "text", "Lesson 3", 21],
  ["Reportage", "report or feature", "Lesson 3", 22],
  ["Steckbrief", "profile sheet", "Lesson 3", 22],
  ["Tochter", "daughter", "Lesson 3", 23],
  ["Eltern", "parents", "Lesson 3", 23],
  ["Stadt", "city", "Lesson 3", 24],
  ["Karte", "map or card", "Lesson 3", 24],
  ["Freundin", "female friend", "Lesson 3", 19],
  ["Mann", "man or husband", "Lesson 3", 18],
  ["Oma", "grandmother", "Lesson 3", 18],
  ["Möbel", "furniture", "Lesson 4", 25],
  ["Designer", "designer", "Lesson 4", 26],
  ["Preis", "price", "Lesson 4", 27],
  ["Schrank", "cupboard or wardrobe", "Lesson 4", 27],
  ["Bild", "picture", "Lesson 4", 27],
  ["Aufgabe", "task", "Lesson 4", 27],
  ["Nominativ", "nominative case", "Lesson 4", 28],
  ["Hilfe", "help", "Lesson 4", 26],
  ["Kaffee", "coffee", "Lesson 4", 28],
  ["Produkt", "product", "Lesson 5", 32],
  ["Bestellung", "order", "Lesson 5", 32],
  ["Farbe", "color", "Lesson 6", 37],
  ["Kunststoff", "plastic", "Lesson 5", 32],
  ["Gegenstand", "object", "Lesson 6", 39],
  ["E-Mail", "email", "Lesson 6", 34],
  ["Chef", "boss", "Lesson 6", 34],
  ["SMS", "text message", "Lesson 6", 34],
  ["Stift", "pen", "Lesson 6", 36],
  ["Briefmarke", "stamp", "Lesson 6", 36],
  ["Sofa", "sofa", "Lesson 6", 36],
  ["Notizbuch", "notebook", "Lesson 6", 36],
  ["Souvenir", "souvenir", "Lesson 6", 38],
  ["Nachtflohmarkt", "night flea market", "Lesson 6", 39],
  ["Nummer", "number", "Lesson 6", 39],
  ["Aufbau", "setup or construction", "Lesson 6", 39],
  ["Ware", "item or goods", "Lesson 6", 39],
  ["Eintritt", "admission", "Lesson 6", 39],
  ["Beschreibung", "description", "Lesson 6", 39],
  ["Kugelschreiber", "ballpoint pen", "Lesson 6", 39],
  ["Zeichnung", "drawing", "Lesson 6", 40],
];

const EXISTING_SOURCES = {
  arbeiten: ["Lesson 2", 14],
  lernen: ["Lesson 6", 40],
  wohnen: ["Lesson 2", 15],
  kommen: ["Lesson 1", 10],
  sprechen: ["Lesson 1", 9],
  besuchen: ["Lesson 9", 54],
  brauchen: ["Lesson 4", 26],
  erzählen: ["Lesson 6", 36],
  name: ["Lesson 1", 12],
};

const REVIEW_OVERRIDES = {
  schweiz: { article: "die" },
  möbel: { article: "plural", plural: "Möbel" },
  nominativ: { article: "der", plural: "Nominative" },
};

function argumentValue(name, fallback = "") {
  const index = process.argv.indexOf(name);
  return index === -1 ? fallback : process.argv[index + 1] || fallback;
}

function sleep(milliseconds) {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds));
}

function normalizeGermanWord(value) {
  return String(value || "")
    .normalize("NFKC")
    .toLocaleLowerCase("de-DE")
    .replace(/^(der|die|das)\s+/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanPageText(value) {
  return value
    .replace(/\u00ad/g, "")
    .replace(/-\s+/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function idFor(level, german) {
  return `gemini-${level.toLowerCase()}-${Buffer.from(normalizeGermanWord(german), "utf8").toString("base64url").slice(0, 64)}`;
}

function sourceFor(lesson, page, context = "") {
  return {
    book: BOOK,
    lesson,
    page,
    ...(context ? { context: context.slice(0, 240) } : {}),
  };
}

function sourceText(text, german) {
  const index = text.toLocaleLowerCase("de-DE").indexOf(german.toLocaleLowerCase("de-DE"));
  if (index < 0) return "";
  return text.slice(Math.max(0, index - 70), Math.min(text.length, index + german.length + 130)).trim();
}

async function loadPdfPages(pdfPath) {
  const data = new Uint8Array(await readFile(pdfPath));
  const pdf = await pdfjs.getDocument({ data, disableWorker: true, verbosity: 0 }).promise;
  const pages = new Map();
  try {
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const content = await page.getTextContent();
      const text = cleanPageText(content.items.map((item) => ("str" in item ? item.str : "")).join(" "));
      if (text) pages.set(pageNumber, text);
      page.cleanup();
    }
  } finally {
    await pdf.destroy();
  }
  return pages;
}

function verifyCandidate(candidate, pages) {
  const [german, translation, lesson, page] = candidate;
  const pageText = pages.get(page) || "";
  if (!pageText.toLocaleLowerCase("de-DE").includes(german.toLocaleLowerCase("de-DE"))) {
    throw new Error(`Could not verify ${german} on PDF page ${page}.`);
  }
  const range = LESSON_RANGES.find((item) => item[0] === lesson);
  if (!range || page < range[1] || page > range[2]) {
    throw new Error(`${german} is outside its declared ${lesson} range.`);
  }
  return { german, translation, lesson, page, context: sourceText(pageText, german) };
}

async function requestReview(serverUrl, candidate, { retryDelayMs = 15_000, maxRetries = 3 } = {}) {
  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 45_000);
    try {
      const response = await fetch(`${serverUrl.replace(/\/$/, "")}/api/gemini/check-card`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          card: {
            german: candidate.german,
            translation: candidate.translation,
            article: "none",
            plural: "",
            example: "",
            note: `${BOOK}, ${candidate.lesson}, page ${candidate.page}`,
            kind: "word",
            existingMatches: [],
          },
        }),
        signal: controller.signal,
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload?.review) {
        throw new Error(payload?.error || `Gemini review failed (${response.status}).`);
      }
      return payload.review;
    } catch (error) {
      if (error?.name === "AbortError") throw new Error(`Gemini timed out while checking ${candidate.german}.`);
      const message = String(error?.message || "");
      const isRateLimited = message.toLocaleLowerCase().includes("rate-limit");
      if (!isRateLimited || attempt >= maxRetries) throw error;
      const waitMs = retryDelayMs * (2 ** attempt);
      console.log(`Gemini rate limit reached on ${candidate.german}; retrying in ${Math.ceil(waitMs / 1000)} seconds.`);
      await sleep(waitMs);
    } finally {
      clearTimeout(timeout);
    }
  }

  throw new Error(`Gemini could not review ${candidate.german}.`);
}

function normalizePlural(value) {
  return String(value || "").replace(/^die\s+/i, "").trim();
}

function recordFromReview(candidate, review) {
  const article = String(review.article || "none").toLowerCase();
  const german = candidate.german;
  const override = REVIEW_OVERRIDES[normalizeGermanWord(german)];
  const resolvedArticle = override?.article || article;
  const resolvedPlural = override?.plural || normalizePlural(review.plural);
  return {
    id: idFor("A1", german),
    german,
    englishMeanings: [String(review.translation || candidate.translation).trim()],
    article: resolvedArticle,
    ...(resolvedPlural ? { plural: resolvedPlural } : {}),
    level: "A1",
    partOfSpeech: "noun",
    ...(review.example ? { examples: [String(review.example).trim()] } : {}),
    tags: ["a1", "menschen", "gemini-verified", "source-pdf"],
    source: sourceFor(candidate.lesson, candidate.page, candidate.context),
  };
}

function attachExistingSources(database, pages) {
  return database.map((word) => {
    const sourceEntry = EXISTING_SOURCES[normalizeGermanWord(word.german)];
    if (!sourceEntry || word.source) return word;
    const [lesson, page] = sourceEntry;
    const context = sourceText(pages.get(page) || "", word.german);
    if (!context) return word;
    return {
      ...word,
      tags: [...new Set([...(word.tags || []), "menschen"])],
      source: sourceFor(lesson, page, context),
    };
  });
}

async function loadDatabase(outputFile) {
  const parsed = JSON.parse(await readFile(outputFile, "utf8"));
  if (!Array.isArray(parsed)) throw new Error("The word database must be an array.");
  return parsed;
}

async function saveDatabase(outputFile, records) {
  const temporaryFile = `${outputFile}.tmp`;
  await writeFile(temporaryFile, `${JSON.stringify(records, null, 2)}\n`, "utf8");
  await rename(temporaryFile, outputFile);
}

async function run() {
  const pdfPath = argumentValue("--pdf");
  const serverUrl = argumentValue("--server-url", DEFAULT_SERVER);
  const outputFile = argumentValue("--output", DEFAULT_OUTPUT);
  const limit = Number(argumentValue("--limit", String(PDF_CANDIDATES.length)));
  const delayMs = Number(argumentValue("--delay-ms", "1500"));
  const retryDelayMs = Number(argumentValue("--retry-delay-ms", "15000"));
  const maxRetries = Number(argumentValue("--max-retries", "3"));
  const dryRun = process.argv.includes("--dry-run");
  if (!pdfPath) throw new Error("Pass the Menschen PDF path with --pdf.");
  if (!Number.isInteger(limit) || limit < 1 || limit > PDF_CANDIDATES.length) throw new Error(`--limit must be between 1 and ${PDF_CANDIDATES.length}.`);
  if (!Number.isInteger(delayMs) || delayMs < 0 || !Number.isInteger(retryDelayMs) || retryDelayMs < 1 || !Number.isInteger(maxRetries) || maxRetries < 0 || maxRetries > 6) {
    throw new Error("delay and retry options are invalid.");
  }

  const pages = await loadPdfPages(pdfPath);
  let database = attachExistingSources(await loadDatabase(outputFile), pages);
  const existing = new Set(database.map((word) => normalizeGermanWord(word.german)));
  const candidates = PDF_CANDIDATES.slice(0, limit).map((candidate) => verifyCandidate(candidate, pages)).filter((candidate) => !existing.has(normalizeGermanWord(candidate.german)));

  if (dryRun) {
    console.log(`Verified ${candidates.length} new PDF candidates:`);
    candidates.forEach((candidate) => console.log(`${candidate.german} · ${candidate.lesson} · p. ${candidate.page}`));
    return;
  }

  for (const candidate of candidates) {
    const review = await requestReview(serverUrl, candidate, { retryDelayMs, maxRetries });
    const record = recordFromReview(candidate, review);
    database.push(record);
    existing.add(normalizeGermanWord(record.german));
    await saveDatabase(outputFile, database);
    console.log(`Added ${record.german}: ${record.article}${record.plural ? `, plural ${record.plural}` : ""} · ${candidate.lesson} · p. ${candidate.page}`);
    if (delayMs > 0) await sleep(delayMs);
  }

  await saveDatabase(outputFile, database);
  console.log(`Menschen source pass complete: ${candidates.length} new words, ${database.length} total records.`);
}

run().catch((error) => {
  console.error(error instanceof Error ? error.message : "The Menschen word agent failed.");
  process.exitCode = 1;
});
