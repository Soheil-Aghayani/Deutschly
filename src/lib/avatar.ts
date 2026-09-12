import { genConfig } from "react-nice-avatar";
import type { AvatarFullConfig } from "react-nice-avatar";

export type AvatarVariant = "beam" | "sunset" | "bauhaus" | "marble" | "ring";
export type ProfileAvatarPreference = "nice" | "google";
export type NiceAvatarConfig = Required<AvatarFullConfig>;

const DAILY_VARIANTS: readonly AvatarVariant[] = ["beam", "sunset", "bauhaus", "ring"];

export const NICE_AVATAR_OPTIONS = {
  sex: ["man", "woman"],
  faceColor: ["#F9C9B6", "#AC6651"],
  earSize: ["small", "big"],
  hairColor: ["#000", "#fff", "#77311D", "#FC909F", "#D2EFF3", "#506AF4", "#F48150"],
  hairStyle: ["normal", "thick", "mohawk", "womanLong", "womanShort"],
  hatColor: ["#000", "#fff", "#77311D", "#FC909F", "#D2EFF3", "#506AF4", "#F48150"],
  hatStyle: ["beanie", "turban", "none"],
  eyeStyle: ["circle", "oval", "smile"],
  glassesStyle: ["round", "square", "none"],
  noseStyle: ["short", "long", "round"],
  mouthStyle: ["laugh", "smile", "peace"],
  shirtStyle: ["hoody", "short", "polo"],
  shirtColor: ["#9287FF", "#6BD9E9", "#FC909F", "#F4D150", "#77311D"],
  bgColor: ["#9287FF", "#6BD9E9", "#FC909F", "#F4D150", "#E0DDFF", "#D2EFF3", "#FFEDEF", "#FFEBA4", "#506AF4", "#F48150", "#74D153"],
} as const;

type NiceAvatarOptionKey = keyof typeof NICE_AVATAR_OPTIONS;

function hashValue(value: string): number {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = ((hash << 5) - hash + value.charCodeAt(index)) | 0;
  }
  return Math.abs(hash);
}

export interface DailyAvatar {
  seed: string;
  variant: AvatarVariant;
}

export function getDailyAvatar(baseSeed: string, dayKey: string): DailyAvatar {
  const dailySeed = `${baseSeed}:${dayKey}`;
  return {
    seed: dailySeed,
    variant: DAILY_VARIANTS[hashValue(dailySeed) % DAILY_VARIANTS.length],
  };
}

export function getNiceAvatarConfig(seed: string, overrides: Partial<NiceAvatarConfig> = {}): NiceAvatarConfig {
  const generated = genConfig(seed || "Deutschly learner");
  return {
    ...generated,
    hairColorRandom: false,
    isGradient: false,
    ...overrides,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function normalizeNiceAvatarConfig(value: unknown, seed: string): NiceAvatarConfig {
  const fallback = getNiceAvatarConfig(seed);
  if (!isRecord(value)) return fallback;

  const next = { ...fallback } as Record<string, unknown>;
  for (const key of Object.keys(NICE_AVATAR_OPTIONS) as NiceAvatarOptionKey[]) {
    const candidate = value[key];
    if (NICE_AVATAR_OPTIONS[key].includes(candidate as never)) next[key] = candidate;
  }
  if (typeof value.eyeBrowStyle === "string" && ["up", "upWoman"].includes(value.eyeBrowStyle)) next.eyeBrowStyle = value.eyeBrowStyle;
  next.hairColorRandom = false;
  next.isGradient = false;
  return next as NiceAvatarConfig;
}

// Compatibility export for existing deterministic-avatar tests and saved
// references from the previous generated-avatar implementation.
export type AvataaarsOptions = NiceAvatarConfig;

export function getAvataaarsOptions(baseSeed: string, dayKey: string): AvataaarsOptions {
  return getNiceAvatarConfig(`${baseSeed}:${dayKey}`);
}
