import { describe, expect, it } from "vitest";
import { achievementCatalog, getAchievementDefinition } from "./achievements";

describe("achievement catalog", () => {
  it("contains unique image-backed definitions with one-time rewards", () => {
    const ids = achievementCatalog.map((achievement) => achievement.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(achievementCatalog).toHaveLength(8);
    expect(achievementCatalog.every((achievement) => achievement.image.endsWith(".webp"))).toBe(true);
    expect(achievementCatalog.every((achievement) => achievement.rewardXp > 0)).toBe(true);
  });

  it("looks up achievement details by id", () => {
    expect(getAchievementDefinition("first-review")?.title).toBe("First recall");
    expect(getAchievementDefinition("ten-reviews")?.requirement).toBe("Complete ten reviews");
    expect(getAchievementDefinition("xp-5000")?.rewardXp).toBe(300);
    expect(getAchievementDefinition("unknown")).toBeUndefined();
  });
});
