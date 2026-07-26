/** Human labels for AI models / deliverable features (owner console). */

const MODEL_LABELS: Record<string, string> = {
  "gpt-5.5": "GPT-5.5",
  "gpt-5": "GPT-5",
  "gpt-4.1": "GPT-4.1",
  "gpt-4o": "GPT-4o",
  "gpt-4o-mini": "GPT-4o mini",
  "text-embedding-3-small": "Embedding",
  "text-embedding-3-large": "Embedding",
  "dall-e-3": "画像生成",
  "gpt-image-1": "画像生成",
};

const FEATURE_LABELS: Record<string, string> = {
  sns: "SNS投稿",
  blog: "ブログ",
  sales_material: "営業資料",
  email: "メール",
  google: "Google連携",
  dropbox: "Dropbox",
  video: "動画",
  image: "画像",
  contract: "契約書",
  word: "Word",
  pdf: "PDF",
  excel: "Excel",
  receipt: "レシート",
  household: "家計簿",
  responses: "Responses API",
  orchestrate: "Orchestrate",
  commander: "Commander",
  automation: "Automation",
  vision: "Vision",
  embedding: "Embedding",
};

export function labelForModel(model: string): string {
  const key = model.trim().toLowerCase();
  if (MODEL_LABELS[key]) return MODEL_LABELS[key];
  if (key.includes("embed")) return "Embedding";
  if (key.includes("dall") || key.includes("image")) return "画像生成";
  if (key.includes("vision") || key.includes("4o")) return model;
  if (key.includes("gpt-5.5") || key.includes("gpt5.5")) return "GPT-5.5";
  return model || "unknown";
}

export function labelForFeature(featureId: string): string {
  return FEATURE_LABELS[featureId] ?? featureId;
}

export function apiHintsForModel(model: string): string[] {
  const key = model.trim().toLowerCase();
  const hints: string[] = [];
  if (key.includes("embed")) hints.push("Embedding");
  if (key.includes("dall") || key.includes("image")) hints.push("画像生成");
  if (key.includes("vision")) hints.push("Vision");
  if (key.includes("gpt") || key.includes("o1") || key.includes("o3")) {
    hints.push("Responses API");
  }
  if (hints.length === 0) hints.push("OpenAI");
  return hints;
}
