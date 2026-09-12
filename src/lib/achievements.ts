export type AchievementId =
  | "first-review"
  | "week-streak"
  | "daily-goal"
  | "xp-1500"
  | "ten-reviews"
  | "fifty-reviews"
  | "streak-30"
  | "xp-5000";

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
  {
    id: "ten-reviews",
    title: "First ten",
    detail: "Built your first recall rhythm",
    requirement: "Complete ten reviews",
    rewardXp: 50,
    image: "achievements/ten-reviews.webp",
  },
  {
    id: "fifty-reviews",
    title: "Recall runner",
    detail: "Kept showing up for your cards",
    requirement: "Complete fifty reviews",
    rewardXp: 100,
    image: "achievements/fifty-reviews.webp",
  },
  {
    id: "streak-30",
    title: "Month of momentum",
    detail: "Made German practice a habit",
    requirement: "Study on thirty consecutive days",
    rewardXp: 250,
    image: "achievements/month-streak.webp",
  },
  {
    id: "xp-5000",
    title: "Bright mind",
    detail: "Reached 5,000 XP",
    requirement: "Earn 5,000 XP in your learning space",
    rewardXp: 300,
    image: "achievements/bright-mind.webp",
  },
];

export function getAchievementDefinition(id: string): AchievementDefinition | undefined {
  return achievementCatalog.find((achievement) => achievement.id === id);
}
