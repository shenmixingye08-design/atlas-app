import { z } from "zod";

import { PPTX_LIMITS } from "./limits";
import type { PresentationModel } from "./types";

const slideSchema = z.object({
  slide_number: z.number().int().positive(),
  type: z.string(),
  title: z.string().min(1).max(PPTX_LIMITS.maxTitleChars + 20),
  subtitle: z.string().optional(),
  content: z.array(
    z.object({
      text: z.string(),
      level: z.union([z.literal(0), z.literal(1)]).optional(),
    }),
  ),
  visuals: z.array(z.any()),
  charts: z.array(z.any()),
  images: z.array(z.any()).optional(),
  table: z
    .object({
      headers: z.array(z.string()),
      rows: z.array(z.array(z.string())),
    })
    .optional(),
  speaker_notes: z.string(),
  source_references: z.array(z.string()),
  layout: z.string(),
  estimated_seconds: z.number().optional(),
});

export const presentationModelSchema = z.object({
  presentation_title: z.string().min(1),
  purpose: z.string().min(1),
  audience: z.string().min(1),
  language: z.enum(["ja-JP", "en-US"]),
  aspect_ratio: z.enum(["16:9", "4:3"]),
  kind: z.string(),
  duration_minutes: z.number().positive(),
  theme: z.object({
    style: z.string(),
    font_family: z.string(),
    tone: z.string(),
    brand: z.record(z.string(), z.any()),
    colors: z.object({
      primary: z.string(),
      accent: z.string(),
      text: z.string(),
      muted: z.string(),
      surface: z.string(),
      light: z.string(),
    }),
  }),
  slides: z.array(slideSchema).min(1).max(PPTX_LIMITS.maxSlides),
  warnings: z.array(z.string()),
  assumptions: z.array(z.string()),
});

export type PresentationValidation =
  | { ok: true; value: PresentationModel; warnings: string[] }
  | { ok: false; errors: string[] };

export function validatePresentationModel(value: unknown): PresentationValidation {
  const parsed = presentationModelSchema.safeParse(value);
  if (!parsed.success) {
    return {
      ok: false,
      errors: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`),
    };
  }

  const model = parsed.data as PresentationModel;
  const errors: string[] = [];
  const warnings: string[] = [...model.warnings];

  const titles = new Map<string, number>();
  let emptyCount = 0;

  for (const slide of model.slides) {
    if (!slide.title.trim()) errors.push(`slide ${slide.slide_number}: empty title`);
    const key = slide.title.trim();
    titles.set(key, (titles.get(key) ?? 0) + 1);

    const bulletChars = slide.content.reduce((n, b) => n + b.text.length, 0);
    if (slide.content.length === 0 && slide.type === "bullets") emptyCount += 1;
    if (slide.content.length > PPTX_LIMITS.maxBulletsPerSlide) {
      warnings.push(
        `slide ${slide.slide_number}: bullets trimmed conceptually (>${PPTX_LIMITS.maxBulletsPerSlide})`,
      );
    }
    if (bulletChars > PPTX_LIMITS.maxBulletsPerSlide * PPTX_LIMITS.maxBulletChars) {
      warnings.push(`slide ${slide.slide_number}: text density high`);
    }
    for (const chart of slide.charts) {
      const len = chart.categories.length;
      if (chart.series.some((s) => s.values.length !== len)) {
        errors.push(`slide ${slide.slide_number}: chart series length mismatch`);
      }
      if (chart.type === "pie" && len > 6) {
        warnings.push(`slide ${slide.slide_number}: pie chart has too many slices`);
      }
      // Placeholder zeros are OK but warn
      if (chart.series.every((s) => s.values.every((v) => v === 0))) {
        warnings.push(
          `slide ${slide.slide_number}: chart values are placeholders (no invented metrics)`,
        );
      }
    }
    if (slide.table) {
      const cols = slide.table.headers.length;
      if (slide.table.rows.some((r) => r.length !== cols)) {
        errors.push(`slide ${slide.slide_number}: table column mismatch`);
      }
    }
  }

  for (const [title, count] of titles) {
    if (count > 2) warnings.push(`repeated title: ${title}`);
  }
  if (emptyCount > 2) errors.push("too many empty content slides");
  if (model.slides.length > PPTX_LIMITS.maxSlides) {
    errors.push("page_limit_exceeded");
  }

  if (errors.length) return { ok: false, errors };
  return { ok: true, value: model, warnings };
}
