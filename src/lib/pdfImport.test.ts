import { describe, expect, it } from "vitest";
import { findArticleCandidates } from "./pdfImport";

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
});
