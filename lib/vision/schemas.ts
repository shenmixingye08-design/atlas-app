import { z } from "zod";
import type { VisionDetectedType } from "@/lib/vision/types";

export const visionDetectedTypeSchema = z.enum([
  "receipt",
  "invoice",
  "estimate",
  "contract",
  "business_document",
  "sales_material",
  "table",
  "spreadsheet_source",
  "chart",
  "handwritten_note",
  "business_card",
  "whiteboard",
  "screenshot",
  "property_photo",
  "equipment_photo",
  "social_media_reference",
  "design_reference",
  "general_photo",
  "unknown",
]);

const lineItemSchema = z.object({
  name: z.string().optional().nullable(),
  quantity: z.union([z.number(), z.string()]).optional().nullable(),
  unitPrice: z.union([z.number(), z.string()]).optional().nullable(),
  amount: z.union([z.number(), z.string()]).optional().nullable(),
  category: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});

export const visionAnalysisResultSchema = z.object({
  id: z.string().min(1),
  attachmentId: z.string().min(1),
  detectedType: visionDetectedTypeSchema,
  confidence: z.number().min(0).max(1),
  summary: z.string(),
  extractedText: z.string().optional().nullable(),
  language: z.string().optional().nullable(),
  fields: z.record(z.string(), z.unknown()).default({}),
  tables: z
    .array(
      z.object({
        headers: z.array(z.string()).default([]),
        rows: z.array(z.array(z.union([z.string(), z.number(), z.null()]))).default([]),
        notes: z.string().optional().nullable(),
      })
    )
    .default([]),
  visualElements: z.array(z.string()).default([]),
  layout: z
    .object({
      hierarchy: z.string().optional().nullable(),
      sections: z.array(z.string()).optional().nullable(),
      readability: z.string().optional().nullable(),
      colorTendency: z.string().optional().nullable(),
      logoPosition: z.string().optional().nullable(),
      ctaPlacement: z.string().optional().nullable(),
    })
    .optional()
    .nullable(),
  styleSignals: z
    .object({
      tone: z.string().optional().nullable(),
      politeness: z.string().optional().nullable(),
      sentenceLength: z.string().optional().nullable(),
      headingStyle: z.string().optional().nullable(),
      frequentPhrases: z.array(z.string()).optional().nullable(),
      ctaStyle: z.string().optional().nullable(),
      structure: z.string().optional().nullable(),
      designTendency: z.string().optional().nullable(),
      forbiddenCandidates: z.array(z.string()).optional().nullable(),
    })
    .optional()
    .nullable(),
  warnings: z.array(z.string()).default([]),
  missingFields: z.array(z.string()).default([]),
  recommendedActions: z.array(z.string()).default([]),
  artifactSuggestions: z.array(z.string()).default([]),
  model: z.string(),
  detailLevel: z.enum(["low", "auto", "high"]),
  createdAt: z.string(),
});

export type VisionAnalysisParsed = z.infer<typeof visionAnalysisResultSchema>;

/** Model JSON payload (without id/attachment/model timestamps). */
export const visionModelPayloadSchema = z.object({
  detectedType: visionDetectedTypeSchema.catch("unknown"),
  confidence: z.number().min(0).max(1).catch(0.4),
  summary: z.string().catch(""),
  extractedText: z.string().optional().nullable().catch(null),
  language: z.string().optional().nullable().catch(null),
  fields: z.record(z.string(), z.unknown()).catch({}),
  tables: z
    .array(
      z.object({
        headers: z.array(z.string()).default([]),
        rows: z.array(z.array(z.union([z.string(), z.number(), z.null()]))).default([]),
        notes: z.string().optional().nullable(),
      })
    )
    .catch([]),
  visualElements: z.array(z.string()).catch([]),
  layout: z
    .object({
      hierarchy: z.string().optional().nullable(),
      sections: z.array(z.string()).optional().nullable(),
      readability: z.string().optional().nullable(),
      colorTendency: z.string().optional().nullable(),
      logoPosition: z.string().optional().nullable(),
      ctaPlacement: z.string().optional().nullable(),
    })
    .optional()
    .nullable()
    .catch(null),
  styleSignals: z
    .object({
      tone: z.string().optional().nullable(),
      politeness: z.string().optional().nullable(),
      sentenceLength: z.string().optional().nullable(),
      headingStyle: z.string().optional().nullable(),
      frequentPhrases: z.array(z.string()).optional().nullable(),
      ctaStyle: z.string().optional().nullable(),
      structure: z.string().optional().nullable(),
      designTendency: z.string().optional().nullable(),
      forbiddenCandidates: z.array(z.string()).optional().nullable(),
    })
    .optional()
    .nullable()
    .catch(null),
  warnings: z.array(z.string()).catch([]),
  missingFields: z.array(z.string()).catch([]),
  recommendedActions: z.array(z.string()).catch([]),
  artifactSuggestions: z.array(z.string()).catch([]),
});

export function isVisionDetectedType(value: string): value is VisionDetectedType {
  return visionDetectedTypeSchema.safeParse(value).success;
}

export { lineItemSchema };
