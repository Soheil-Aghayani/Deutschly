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

function argumentValue(name, fallback = "") {
  const index = process.argv.indexOf(name);
  return index === -1 ? fallback : process.argv[index + 1] || fallback;
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

async function requestReview(serverUrl, candidate) {
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
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function normalizePlural(value) {
  return String(value || "").replace(/^die\s+/i, "").trim();
}

function recordFromReview(candidate, review) {
  const article = String(review.article || "none").toLowerCase();
  const german = candidate.german;
  return {
    id: idFor("A1", german),
    german,
    englishMeanings: [String(review.translation || candidate.translation).trim()],
    article,
    ...(normalizePlural(review.plural) ? { plural: normalizePlural(review.plural) } : {}),
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
  if (!pdfPath) throw new Error("Pass the Menschen PDF path with --pdf.");
  if (!Number.isInteger(limit) || limit < 1 || limit > PDF_CANDIDATES.length) throw new Error(`--limit must be between 1 and ${PDF_CANDIDATES.length}.`);

  const pages = await loadPdfPages(pdfPath);
  let database = attachExistingSources(await loadDatabase(outputFile), pages);
  const existing = new Set(database.map((word) => normalizeGermanWord(word.german)));
  const candidates = PDF_CANDIDATES.slice(0, limit).map((candidate) => verifyCandidate(candidate, pages)).filter((candidate) => !existing.has(normalizeGermanWord(candidate.german)));

  for (const candidate of candidates) {
    const review = await requestReview(serverUrl, candidate);
    const record = recordFromReview(candidate, review);
    database.push(record);
    existing.add(normalizeGermanWord(record.german));
    await saveDatabase(outputFile, database);
    console.log(`Added ${record.german}: ${record.article}${record.plural ? `, plural ${record.plural}` : ""} · ${candidate.lesson} · p. ${candidate.page}`);
  }

  await saveDatabase(outputFile, database);
  console.log(`Menschen source pass complete: ${candidates.length} new words, ${database.length} total records.`);
}

run().catch((error) => {
  console.error(error instanceof Error ? error.message : "The Menschen word agent failed.");
  process.exitCode = 1;
});
