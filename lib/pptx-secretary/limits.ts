export const PPTX_LIMITS = {
  maxUploadBytes: 40 * 1024 * 1024,
  maxOutputBytes: 50 * 1024 * 1024,
  maxSlides: 60,
  maxBulletsPerSlide: 5,
  maxBulletChars: 80,
  maxTitleChars: 60,
  maxImages: 40,
  maxCharts: 30,
  maxTableRows: 12,
  maxGenerationMs: 120_000,
  previewSlideBatch: 12,
  backgroundSlideThreshold: 25,
  maxFileNameLength: 80,
  titleFontSize: 32,
  bodyFontSize: 16,
  noteFontSize: 12,
  safeMarginIn: 0.5,
} as const;

export type PptxScaleTier = "small" | "medium" | "large" | "xlarge";

export function classifyPptxScale(slideCount: number, byteLength?: number): PptxScaleTier {
  if (slideCount >= PPTX_LIMITS.maxSlides || (byteLength != null && byteLength >= 25 * 1024 * 1024)) {
    return "xlarge";
  }
  if (slideCount >= PPTX_LIMITS.backgroundSlideThreshold) return "large";
  if (slideCount >= 12) return "medium";
  return "small";
}

export function pptxScaleGuidance(tier: PptxScaleTier): string {
  switch (tier) {
    case "small":
      return "通常処理で生成します。";
    case "medium":
      return "中規模のためプレビューは必要スライドのみ読み込みます。";
    case "large":
      return "大規模のためバックグラウンド処理を推奨します。サムネイルは段階生成します。";
    case "xlarge":
      return `スライド数またはサイズが上限に近いです（最大${PPTX_LIMITS.maxSlides}枚）。分割をご検討ください。`;
  }
}

/** Target slide count from duration. */
export function slideCountForDuration(minutes: number): number {
  if (minutes <= 3) return 5;
  if (minutes <= 5) return 7;
  if (minutes <= 10) return 10;
  if (minutes <= 15) return 12;
  if (minutes <= 30) return 18;
  return 24;
}
