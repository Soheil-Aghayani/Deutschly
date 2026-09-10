import { shiftDayKey } from "./date";

export type LearningRating = "again" | "hard" | "good" | "easy";
export type LearningCardStatus = "new" | "learning" | "review";

export interface AdaptiveCardInput {
  interval: number;
  ease?: number;
  repetitions?: number;
  lapses?: number;
  stability?: number;
  difficulty?: number;
  status: LearningCardStatus;
}

export interface AdaptiveSchedule {
  due: string;
  interval: number;
  ease: number;
  repetitions: number;
  lapses: number;
  stability: number;
  difficulty: number;
  status: LearningCardStatus;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

/**
 * A compact FSRS-inspired scheduler. Stability is the expected number of days
 * before recall becomes difficult; difficulty changes more slowly than the
 * user's immediate rating, so one bad session does not destroy a card's plan.
 */
export function scheduleAdaptiveReview(
  card: AdaptiveCardInput,
  rating: LearningRating,
  todayKey: string,
): AdaptiveSchedule {
  const previousInterval = Math.max(0, card.interval);
  const previousStability = clamp(card.stability ?? Math.max(previousInterval, 0.7), 0.4, 3650);
  const previousDifficulty = clamp(card.difficulty ?? 5, 1, 10);
  const previousEase = clamp(card.ease ?? 2.5, 1.3, 3.3);
  const previousRepetitions = Math.max(0, card.repetitions ?? (previousInterval > 0 ? 1 : 0));
  const previousLapses = Math.max(0, card.lapses ?? 0);

  let stability = previousStability;
  let difficulty = previousDifficulty;
  let interval = 1;
  let repetitions = previousRepetitions;
  let lapses = previousLapses;
  let ease = previousEase;
  let status: LearningCardStatus = "learning";

  if (rating === "again") {
    stability = Math.max(0.5, previousStability * 0.35);
    difficulty = clamp(previousDifficulty + 0.8, 1, 10);
    ease = Math.max(1.3, previousEase - 0.2);
    interval = 1;
    repetitions = 0;
    lapses += 1;
  } else if (rating === "hard") {
    difficulty = clamp(previousDifficulty + 0.2, 1, 10);
    stability = Math.max(1.5, previousStability * (1.05 + (10 - previousDifficulty) * 0.015));
    ease = Math.max(1.3, previousEase - 0.1);
    interval = previousInterval === 0 ? 1 : Math.max(2, Math.round(stability));
    repetitions += 1;
    status = "review";
  } else if (rating === "good") {
    difficulty = clamp(previousDifficulty - 0.1, 1, 10);
    stability = previousInterval === 0
      ? 3
      : previousStability * (1.18 + (10 - previousDifficulty) * 0.015);
    interval = Math.max(3, Math.round(stability));
    repetitions += 1;
    status = "review";
  } else {
    difficulty = clamp(previousDifficulty - 0.35, 1, 10);
    stability = previousInterval === 0
      ? 6
      : previousStability * (1.4 + (10 - previousDifficulty) * 0.03);
    ease = Math.min(3.3, previousEase + 0.15);
    interval = Math.max(5, Math.round(stability));
    repetitions += 1;
    status = "review";
  }

  stability = clamp(stability, 0.5, 3650);

  return {
    due: shiftDayKey(todayKey, interval),
    interval,
    ease: Number(ease.toFixed(2)),
    repetitions,
    lapses,
    stability: Number(stability.toFixed(2)),
    difficulty: Number(difficulty.toFixed(2)),
    status,
  };
}

export function getCardMastery(card: AdaptiveCardInput): number {
  if (card.status === "new") return 0;
  const stability = card.stability ?? card.interval;
  return Math.round(clamp((stability / 30) * 100, card.status === "review" ? 45 : 12, 100));
}

export function normalizeLearningAnswer(value: string): string {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase("de-DE")
    .replace(/[.,!?;:()[\]{}"']/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function germanSpellingVariant(value: string): string {
  return value.replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss");
}

const commonAnswerAliases: Record<string, string[]> = {
  child: ["kid"],
  kid: ["child"],
};

function splitExpectedAnswers(value: string): string[] {
  return value.split(/\s*[|;]\s*|\s+\/\s+/);
}

export function answerMatches(input: string, expected: string | string[]): boolean {
  const normalizedInput = normalizeLearningAnswer(input);
  const inputVariant = germanSpellingVariant(normalizedInput);
  if (!normalizedInput) return false;
  const expectedValues = (Array.isArray(expected) ? expected.flatMap(splitExpectedAnswers) : splitExpectedAnswers(expected))
    .flatMap((value) => {
      const normalizedValue = normalizeLearningAnswer(value);
      return [normalizedValue, ...(commonAnswerAliases[normalizedValue] ?? [])];
    });
  return expectedValues.some((value) => {
    const normalizedValue = normalizeLearningAnswer(value);
    return normalizedValue === normalizedInput || germanSpellingVariant(normalizedValue) === inputVariant;
  });
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function makeClozeSentence(example: string | undefined, german: string): string {
  const fallback = `Ich lerne das Wort „${german}“.`;
  const source = example?.trim() || fallback;
  const pattern = new RegExp(escapeRegExp(german), "i");
  return pattern.test(source) ? source.replace(pattern, "____") : `${source} (____)`;
}

export function getXpForRating(rating: LearningRating): number {
  return { again: 4, hard: 8, good: 12, easy: 16 }[rating];
}

export function getLevelForXp(xp: number): number {
  return Math.max(1, Math.floor(Math.max(0, xp) / 250) + 1);
}

export function getLevelProgress(xp: number): { level: number; current: number; needed: number; percent: number } {
  const safeXp = Math.max(0, Math.floor(xp));
  const level = getLevelForXp(safeXp);
  const current = safeXp % 250;
  const needed = 250;
  return { level, current, needed, percent: Math.round((current / needed) * 100) };
}
