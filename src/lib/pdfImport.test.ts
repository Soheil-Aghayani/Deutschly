import { describe, expect, it } from "vitest";
import { assessPdfCandidate, findArticleCandidates, getMenschenLesson, normalizePdfCandidateStatuses } from "./pdfImport";

describe("findArticleCandidates", () => {
  it("finds unique article+noun suggestions and keeps their source page", () => {
    const candidates = findArticleCandidates([
      { page: 2, text: "Der Bahnhof ist nah. Die Wohnung ist hell. Der Bahnhof kommt noch einmal." },
      { page: 4, text: "Das Kind spielt im Garten." },
    ]);

    expect(candidates.map(({ german, article, page }) => ({ german, article, page }))).toEqual([
      { german: "Bahnhof", article: "der", page: 2 },
      { german: "Wohnung", article: "die", page: 2 },
      { german: "Kind", article: "das", page: 4 },
    ]);
  });

  it("adds the Menschen lesson when the page is in the course section", () => {
    const candidates = findArticleCandidates([{ page: 25, text: "Der Tisch ist schön." }]);

    expect(candidates[0]?.lesson).toBe("Lesson 4");
    expect(getMenschenLesson(8)).toBeUndefined();
    expect(getMenschenLesson(72)).toBe("Lesson 12");
  });

  it("keeps only valid candidate statuses and defaults new suggestions to pending", () => {
    const candidates = findArticleCandidates([{ page: 25, text: "Der Tisch ist schön. Die Lampe ist neu." }]);

    expect(normalizePdfCandidateStatuses(candidates, {
      [candidates[0]?.id ?? ""]: "skipped",
      "unknown-id": "accepted",
    })).toEqual({
      [candidates[0]?.id ?? ""]: "skipped",
      [candidates[1]?.id ?? ""]: "pending",
    });
  });

  it("flags short OCR fragments without rejecting valid short nouns", () => {
    expect(assessPdfCandidate({ german: "Na", context: "die Na men" })).toEqual({
      confidence: "low",
      reasons: ["Very short token"],
    });
    expect(assessPdfCandidate({ german: "Vis", context: "die Vis ite n ka rte n" })).toEqual({
      confidence: "low",
      reasons: ["Looks split by OCR: Vis ite"],
    });
    expect(assessPdfCandidate({ german: "Uhr", context: "die Uhr ist richtig" }).confidence).toBe("high");
    expect(assessPdfCandidate({ german: "Tag", context: "der Tag kommt" }).confidence).toBe("high");
  });
});
