export type AvatarVariant = "beam" | "sunset" | "bauhaus" | "marble" | "ring";

const DAILY_VARIANTS: readonly AvatarVariant[] = ["beam", "sunset", "bauhaus", "ring"];

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

export interface AvataaarsOptions {
  avatarStyle: "Circle" | "Transparent";
  topType: string;
  accessoriesType: string;
  hairColor: string;
  facialHairType: string;
  facialHairColor: string;
  clotheType: string;
  clotheColor: string;
  eyeType: string;
  eyebrowType: string;
  mouthType: string;
  skinColor: string;
}

export function getDailyAvatar(baseSeed: string, dayKey: string): DailyAvatar {
  const dailySeed = `${baseSeed}:${dayKey}`;
  return {
    seed: dailySeed,
    variant: DAILY_VARIANTS[hashValue(dailySeed) % DAILY_VARIANTS.length],
  };
}

const AVATAAARS_OPTIONS = {
  topType: ["ShortHairShortFlat", "ShortHairTheCaesar", "ShortHairSides", "LongHairStraight", "LongHairFro", "Hijab"] as const,
  accessoriesType: ["Blank", "Prescription01", "Round", "Sunglasses"] as const,
  hairColor: ["BrownDark", "Black", "Blonde", "PastelPink", "Red"] as const,
  facialHairType: ["Blank", "BeardMedium", "MoustacheFancy"] as const,
  facialHairColor: ["BrownDark", "Black", "Blonde", "Red"] as const,
  clotheType: ["ShirtCrewNeck", "Hoodie", "CollarSweater", "BlazerShirt", "GraphicShirt"] as const,
  clotheColor: ["PastelBlue", "PastelGreen", "PastelOrange", "Heather", "Blue01", "Gray01"] as const,
  eyeType: ["Default", "Happy", "Wink", "Surprised"] as const,
  eyebrowType: ["Default", "RaisedExcited", "UpDown", "Angry"] as const,
  mouthType: ["Default", "Smile", "Serious", "Twinkle"] as const,
  skinColor: ["Light", "Pale", "Tanned", "Brown", "DarkBrown"] as const,
};

function pickAvatarOption<T extends readonly string[]>(options: T, seed: number, offset: number): T[number] {
  return options[(seed + offset * 17) % options.length];
}

export function getAvataaarsOptions(baseSeed: string, dayKey: string): AvataaarsOptions {
  const seed = hashValue(`${baseSeed}:${dayKey}`);
  return {
    avatarStyle: "Circle",
    topType: pickAvatarOption(AVATAAARS_OPTIONS.topType, seed, 1),
    accessoriesType: pickAvatarOption(AVATAAARS_OPTIONS.accessoriesType, seed, 2),
    hairColor: pickAvatarOption(AVATAAARS_OPTIONS.hairColor, seed, 3),
    facialHairType: pickAvatarOption(AVATAAARS_OPTIONS.facialHairType, seed, 4),
    facialHairColor: pickAvatarOption(AVATAAARS_OPTIONS.facialHairColor, seed, 5),
    clotheType: pickAvatarOption(AVATAAARS_OPTIONS.clotheType, seed, 6),
    clotheColor: pickAvatarOption(AVATAAARS_OPTIONS.clotheColor, seed, 7),
    eyeType: pickAvatarOption(AVATAAARS_OPTIONS.eyeType, seed, 8),
    eyebrowType: pickAvatarOption(AVATAAARS_OPTIONS.eyebrowType, seed, 9),
    mouthType: pickAvatarOption(AVATAAARS_OPTIONS.mouthType, seed, 10),
    skinColor: pickAvatarOption(AVATAAARS_OPTIONS.skinColor, seed, 11),
  };
}
