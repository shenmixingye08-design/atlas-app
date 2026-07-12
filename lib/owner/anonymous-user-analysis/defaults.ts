import type { PopularityFeatureId } from "@/lib/owner/popularity-ranking/types";

export const HIGH_COST_API_USD_THRESHOLD = 0.25;
export const HIGH_COST_MARGIN_THRESHOLD = 20;

/** Feature display labels for anonymous analysis (not monetary demo data). */
export const FEATURE_LABELS: Record<PopularityFeatureId, string> = {
  sns: "SNS",
  blog: "ブログ",
  sales_material: "営業資料",
  email: "メール",
  google: "Google連携",
  dropbox: "Dropbox",
  video: "動画",
  image: "画像",
};
