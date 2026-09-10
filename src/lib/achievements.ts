export type AchievementId = "first-review" | "week-streak" | "daily-goal" | "xp-1500";

export interface AchievementDefinition {
  id: AchievementId;
  title: string;
  detail: string;
  requirement: string;
  rewardXp: number;
  image: string;
}

export const achievementCatalog: readonly AchievementDefinition[] = [
  {
    id: "first-review",
    title: "First recall",
    detail: "Started your memory loop",
    requirement: "Complete your first review",
    rewardXp: 25,
    image: "achievements/first-recall.webp",
  },
  {
    id: "week-streak",
    title: "One gentle week",
    detail: "Kept a 7-day study streak",
    requirement: "Study on seven consecutive days",
    rewardXp: 100,
    image: "achievements/week-streak.webp",
  },
  {
    id: "daily-goal",
    title: "Daily goal",
    detail: "Completed a full review goal",
    requirement: "Finish your daily review goal",
    rewardXp: 50,
    image: "achievements/daily-goal.webp",
  },
  {
    id: "xp-1500",
    title: "Momentum maker",
    detail: "Reached 1,500 XP",
    requirement: "Earn 1,500 XP in your learning space",
    rewardXp: 150,
    image: "achievements/momentum-maker.webp",
  },
];

export function getAchievementDefinition(id: string): AchievementDefinition | undefined {
  return achievementCatalog.find((achievement) => achievement.id === id);
}

