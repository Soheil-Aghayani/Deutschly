import { describe, expect, it } from "vitest";
import {
  answerMatches,
  getPracticeSessionLength,
  getPracticeXp,
  getLevelProgress,
  makeClozeSentence,
  scheduleAdaptiveReview,
} from "./learning";

describe("adaptive learning helpers", () => {
  it("gives a new card a shorter interval when it is hard", () => {
    const hard = scheduleAdaptiveReview({ interval: 0, status: "new" }, "hard", "2026-09-09");
    const easy = scheduleAdaptiveReview({ interval: 0, status: "new" }, "easy", "2026-09-09");

    expect(hard.interval).toBe(1);
    expect(easy.interval).toBeGreaterThan(hard.interval);
    expect(easy.difficulty).toBeLessThan(hard.difficulty);
  });

  it("reduces stability after a lapse without losing the card", () => {
    const result = scheduleAdaptiveReview({ interval: 12, stability: 12, difficulty: 4, status: "review" }, "again", "2026-09-09");

    expect(result.interval).toBe(1);
    expect(result.lapses).toBe(1);
    expect(result.status).toBe("learning");
    expect(result.stability).toBeLessThan(12);
  });

  it("matches normalized answer variants and creates cloze prompts", () => {
    expect(answerMatches("  BÜCHER! ", ["Bücher", "Buecher"])).toBe(true);
    expect(answerMatches("Buecher", "Bücher")).toBe(true);
    expect(answerMatches("die", "der|die|das")).toBe(true);
    expect(answerMatches("kid", "child")).toBe(true);
    expect(answerMatches("flat", "apartment / flat")).toBe(true);
    expect(answerMatches("goat", "kid")).toBe(false);
    expect(makeClozeSentence("Das Buch liegt auf dem Tisch.", "Buch")).toBe("Das ____ liegt auf dem Tisch.");
    expect(makeClozeSentence(undefined, "Bahnhof", 0, "der")).toBe("Hier ist der ____.");
  });

  it("makes practice progress visible and expands sessions by level", () => {
    expect(getPracticeXp(true)).toBe(10);
    expect(getPracticeXp(false)).toBe(2);
    expect(getPracticeXp(true, true)).toBe(15);
    expect(getPracticeSessionLength(1, 13)).toBe(5);
    expect(getPracticeSessionLength(2, 13)).toBe(10);
    expect(getPracticeSessionLength(5, 13)).toBe(13);
    expect(new Set(Array.from({ length: 8 }, (_, index) => makeClozeSentence(undefined, "Bahnhof", index, "der"))).size).toBe(8);
  });

  it("calculates a stable level progress bar", () => {
    expect(getLevelProgress(500)).toEqual({ level: 3, current: 0, needed: 250, percent: 0 });
  });
});
