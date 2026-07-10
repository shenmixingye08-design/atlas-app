import type { PopularityFeatureDefinition, PopularityFeatureId } from "./types";

export const POPULARITY_FEATURE_DEFINITIONS: readonly PopularityFeatureDefinition[] =
  [
    { id: "sns", label: "SNS" },
    { id: "blog", label: "ブログ" },
    { id: "sales_material", label: "営業資料" },
    { id: "email", label: "メール" },
    { id: "google", label: "Google連携" },
    { id: "dropbox", label: "Dropbox" },
    { id: "video", label: "動画" },
    { id: "image", label: "画像" },
  ] as const;

export const POPULARITY_FEATURE_IDS: readonly PopularityFeatureId[] =
  POPULARITY_FEATURE_DEFINITIONS.map((definition) => definition.id);

export function getPopularityFeatureDefinition(
  id: PopularityFeatureId,
): PopularityFeatureDefinition {
  const definition = POPULARITY_FEATURE_DEFINITIONS.find(
    (entry) => entry.id === id,
  );
  if (!definition) {
    throw new Error(`Popularity feature not found: ${id}`);
  }
  return definition;
}

export function isPopularityFeatureId(
  value: string,
): value is PopularityFeatureId {
  return POPULARITY_FEATURE_IDS.includes(value as PopularityFeatureId);
}
