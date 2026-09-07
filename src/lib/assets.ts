import type { GardenDecorId } from "../data/decor";
import type { GardenSeedKind, GardenTreeVariant } from "../types/game";

interface GardenDecorAsset {
  path: string;
  previewPath?: string;
  animated?: boolean;
  frameCount?: number;
}

const GARDEN_TREE_ASSETS: Record<GardenTreeVariant, string> = {
  peach: "apricity-tree-peach.webp",
  apple: "apricity-tree-apple.webp",
  cherry: "apricity-tree-cherry.webp",
  lemon: "apricity-tree-lemon.webp",
};

const GARDEN_ASSETS: Record<Exclude<GardenSeedKind, "tree">, string> = {
  flower: "apricity-flower.webp",
  bush: "apricity-bush.webp",
};

const DECOR_ASSETS: Partial<Record<GardenDecorId, GardenDecorAsset>> = {
  flower: { path: "apricity-flower.webp" },
  butterfly: {
    path: "apricity-butterfly-sprite.webp",
    previewPath: "apricity-butterfly.webp",
    animated: true,
    frameCount: 6,
  },
  bench: { path: "apricity-bench.webp" },
  lamp: { path: "apricity-lamp.webp" },
  cat: { path: "apricity-cat.webp" },
};

export function getGardenTreeAssetPath(variant: GardenTreeVariant = "peach"): string {
  return `${import.meta.env.BASE_URL}${GARDEN_TREE_ASSETS[variant]}`;
}

export function getGardenAssetPath(kind: GardenSeedKind, treeVariant: GardenTreeVariant = "peach"): string {
  return kind === "tree"
    ? getGardenTreeAssetPath(treeVariant)
    : `${import.meta.env.BASE_URL}${GARDEN_ASSETS[kind]}`;
}

export function getGardenDecorAsset(id: GardenDecorId): GardenDecorAsset | undefined {
  const asset = DECOR_ASSETS[id];
  return asset
    ? {
        ...asset,
        path: `${import.meta.env.BASE_URL}${asset.path}`,
        previewPath: asset.previewPath ? `${import.meta.env.BASE_URL}${asset.previewPath}` : undefined,
      }
    : undefined;
}

export function getGardenDecorAssetPath(id: GardenDecorId): string | undefined {
  return getGardenDecorAsset(id)?.path;
}
