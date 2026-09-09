export type PdfArticle = "der" | "die" | "das";
export type PdfCandidateStatus = "pending" | "accepted" | "skipped";
export type PdfCandidateConfidence = "high" | "medium" | "low";

export interface PdfCandidateAssessment {
  confidence: PdfCandidateConfidence;
  reasons: string[];
}

export interface PdfCandidate {
  id: string;
  german: string;
  article: PdfArticle;
  page: number;
  lesson?: string;
  context: string;
  confidence?: PdfCandidateConfidence;
  confidenceReasons?: string[];
}

export interface PdfImportResult {
  pageCount: number;
  textPreview: string;
  candidates: PdfCandidate[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isPdfCandidateStatus(value: unknown): value is PdfCandidateStatus {
  return value === "pending" || value === "accepted" || value === "skipped";
}

export function normalizePdfCandidateStatuses(
  candidates: PdfCandidate[],
  value: unknown,
): Record<string, PdfCandidateStatus> {
  const source = isRecord(value) ? value : {};
  const statuses: Record<string, PdfCandidateStatus> = {};
  candidates.forEach((candidate) => {
    const status = source[candidate.id];
    statuses[candidate.id] = isPdfCandidateStatus(status) ? status : "pending";
  });
  return statuses;
}

type PdfJsModule = typeof import("pdfjs-dist");
let pdfJsPromise: Promise<PdfJsModule> | undefined;

async function loadPdfJs(): Promise<PdfJsModule> {
  if (!pdfJsPromise) {
    pdfJsPromise = Promise.all([
      import("pdfjs-dist"),
      import("pdfjs-dist/build/pdf.worker.min.mjs?url"),
    ]).then(([pdfjs, worker]) => {
      pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
      return pdfjs;
    });
  }
  return pdfJsPromise;
}

export interface ExtractedPage {
  page: number;
  text: string;
}

const MENSCHEN_LESSON_RANGES: Array<{ lesson: string; start: number; end: number }> = [
  { lesson: "Lesson 1", start: 9, end: 12 },
  { lesson: "Lesson 2", start: 13, end: 16 },
  { lesson: "Lesson 3", start: 17, end: 24 },
  { lesson: "Lesson 4", start: 25, end: 28 },
  { lesson: "Lesson 5", start: 29, end: 32 },
  { lesson: "Lesson 6", start: 33, end: 40 },
  { lesson: "Lesson 7", start: 41, end: 44 },
  { lesson: "Lesson 8", start: 45, end: 48 },
  { lesson: "Lesson 9", start: 49, end: 56 },
  { lesson: "Lesson 10", start: 57, end: 60 },
  { lesson: "Lesson 11", start: 61, end: 64 },
  { lesson: "Lesson 12", start: 65, end: 72 },
];
const MAX_PDF_CANDIDATES = 240;

export function getMenschenLesson(page: number): string | undefined {
  return MENSCHEN_LESSON_RANGES.find(({ start, end }) => page >= start && page <= end)?.lesson;
}

function cleanPageText(value: string): string {
  return value
    .replace(/\u00ad/g, "")
    .replace(/-\s+/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeCandidate(value: string): string {
  return value.trim().normalize("NFKC").toLocaleLowerCase("de-DE");
}

const COMMON_FOLLOWING_WORDS = new Set([
  "aber",
  "als",
  "am",
  "an",
  "auch",
  "auf",
  "aus",
  "bei",
  "das",
  "dem",
  "den",
  "der",
  "des",
  "die",
  "du",
  "ein",
  "eine",
  "für",
  "geht",
  "gibt",
  "hat",
  "haben",
  "heißt",
  "hier",
  "ich",
  "im",
  "in",
  "ist",
  "ihr",
  "kein",
  "keine",
  "kommt",
  "lernen",
  "macht",
  "man",
  "mit",
  "nach",
  "neu",
  "nicht",
  "noch",
  "nur",
  "sehr",
  "sind",
  "sie",
  "spielen",
  "und",
  "von",
  "vor",
  "wie",
  "wir",
  "zu",
]);

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function findPossibleSplitFragment(german: string, context: string): string | undefined {
  const match = context.match(new RegExp(`\\b${escapeRegExp(german)}\\s+([a-zäöüß]{2,8})\\b`, "iu"));
  const fragment = match?.[1]?.toLocaleLowerCase("de-DE");
  if (!fragment || COMMON_FOLLOWING_WORDS.has(fragment)) return undefined;
  return fragment;
}

export function assessPdfCandidate({ german, context }: Pick<PdfCandidate, "german" | "context">): PdfCandidateAssessment {
  const normalizedGerman = normalizeCandidate(german);
  const reasons: string[] = [];
  const possibleSplitFragment = findPossibleSplitFragment(german, context);
  const looksLikeSplitWord = Boolean(possibleSplitFragment && normalizedGerman.length <= 3 && possibleSplitFragment.length <= 4);

  if (normalizedGerman.length <= 2) reasons.push("Very short token");
  if (looksLikeSplitWord && normalizedGerman.length > 2) reasons.push(`Looks split by OCR: ${german} ${possibleSplitFragment}`);

  return {
    confidence: normalizedGerman.length <= 2 || looksLikeSplitWord ? "low" : reasons.length > 0 ? "medium" : "high",
    reasons,
  };
}

export function findArticleCandidates(pages: ExtractedPage[]): PdfCandidate[] {
  const candidates = new Map<string, PdfCandidate>();
  const articlePattern = /\b((?:[dD]er|[dD]ie|[dD]as))\s+([A-ZÄÖÜẞ][\p{L}-]{1,})\b/gu;

  pages.forEach(({ page, text }) => {
    articlePattern.lastIndex = 0;
    let match = articlePattern.exec(text);
    while (match) {
      const article = match[1].toLocaleLowerCase("de-DE") as PdfArticle;
      const german = match[2].replace(/[.,;:!?]+$/, "");
      const key = `${article}:${normalizeCandidate(german)}`;
      if (!candidates.has(key)) {
        const contextStart = Math.max(0, match.index - 46);
        const contextEnd = Math.min(text.length, match.index + match[0].length + 78);
        const context = text.slice(contextStart, contextEnd).trim();
        const assessment = assessPdfCandidate({ german, context });
        candidates.set(key, {
          id: `pdf-${page}-${normalizeCandidate(german).replace(/[^a-z0-9äöüß]+/gi, "-")}`,
          german,
          article,
          page,
          lesson: getMenschenLesson(page),
          context: `${contextStart > 0 ? "…" : ""}${context}${contextEnd < text.length ? "…" : ""}`,
          confidence: assessment.confidence,
          confidenceReasons: assessment.reasons,
        });
      }
      match = articlePattern.exec(text);
    }
  });

  return [...candidates.values()].slice(0, MAX_PDF_CANDIDATES);
}

export async function extractMenschenPdf(file: File): Promise<PdfImportResult> {
  const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
  if (!isPdf) throw new Error("Please choose a PDF file.");
  if (file.size > 75 * 1024 * 1024) throw new Error("This PDF is larger than 75 MB. Please choose a smaller copy.");

  const pdfjs = await loadPdfJs();
  const loadingTask = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) });
  const pdf = await loadingTask.promise;
  const pageCount = pdf.numPages;
  const pages: ExtractedPage[] = [];

  try {
    for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const content = await page.getTextContent();
      const text = cleanPageText(content.items.map((item) => ("str" in item ? item.str : "")).join(" "));
      if (text) pages.push({ page: pageNumber, text });
      page.cleanup();
    }
  } finally {
    await pdf.destroy();
  }

  if (pages.length === 0) {
    throw new Error("This PDF has no selectable text. If it is scanned, OCR support will be needed before importing it.");
  }

  const coursePages = pages.filter(({ page }) => Boolean(getMenschenLesson(page)));
  const importPages = coursePages.length > 0 ? coursePages : pages;
  const previewPages = importPages.slice(0, 3);
  const textPreview = previewPages.map(({ page, text }) => `Page ${page}\n${text.slice(0, 520)}`).join("\n\n");
  return {
    pageCount,
    textPreview,
    candidates: findArticleCandidates(importPages),
  };
}
