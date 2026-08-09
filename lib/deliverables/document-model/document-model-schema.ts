import { z } from "zod";

import {
  WORD_TEMPLATE_IDS,
  type WordTemplateId,
} from "@/lib/deliverables/word-templates";

export const wordTemplateIdSchema = z.enum(WORD_TEMPLATE_IDS);

export const documentModelBlockSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("paragraph"),
    text: z.string(),
  }),
  z.object({
    type: z.literal("bulletList"),
    items: z.array(z.string()),
  }),
  z.object({
    type: z.literal("numberedList"),
    items: z.array(z.string()),
  }),
  z.object({
    type: z.literal("table"),
    headers: z.array(z.string()),
    rows: z.array(z.array(z.string())),
  }),
  z.object({
    type: z.literal("notice"),
    variant: z.enum(["note", "important", "warning"]).default("note"),
    text: z.string(),
  }),
  z.object({
    type: z.literal("quote"),
    text: z.string(),
  }),
  z.object({
    type: z.literal("keyValue"),
    pairs: z.array(
      z.object({
        label: z.string(),
        value: z.string(),
      }),
    ),
  }),
  z.object({
    type: z.literal("signature"),
    lines: z.array(z.string()),
  }),
  z.object({
    type: z.literal("imagePlaceholder"),
    caption: z.string(),
    dataUrl: z.string().optional(),
  }),
  z.object({
    type: z.literal("pageBreak"),
  }),
]);

export const documentModelSectionSchema = z.object({
  id: z.string().min(1),
  level: z.union([z.literal(1), z.literal(2), z.literal(3)]).default(2),
  title: z.string(),
  blocks: z.array(documentModelBlockSchema).default([]),
  pageBreakBefore: z.boolean().optional(),
  keepWithNext: z.boolean().optional(),
});

export const documentModelSchema = z.object({
  title: z.string().min(1),
  subtitle: z.string().optional(),
  documentType: z.string().optional(),
  templateId: wordTemplateIdSchema.default("standard-document"),
  language: z.string().default("ja"),
  author: z.string().optional(),
  companyName: z.string().optional(),
  recipient: z.string().optional(),
  createdAt: z.string().optional(),
  sections: z.array(documentModelSectionSchema).default([]),
  tables: z
    .array(
      z.object({
        headers: z.array(z.string()),
        rows: z.array(z.array(z.string())),
        caption: z.string().optional(),
      }),
    )
    .optional(),
  summary: z.string().optional(),
  footerNote: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export type DocumentModelBlock = z.infer<typeof documentModelBlockSchema>;
export type DocumentModelSection = z.infer<typeof documentModelSectionSchema>;
export type DocumentModel = z.infer<typeof documentModelSchema>;

export type DocumentModelParseResult =
  | { ok: true; model: DocumentModel; source: "structured" | "normalized" }
  | { ok: false; reason: string };

/**
 * Strictly validate AI structured output. Never throws.
 */
export function parseDocumentModel(
  input: unknown,
): DocumentModelParseResult {
  const parsed = documentModelSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      reason: parsed.error.issues
        .slice(0, 5)
        .map((issue) => `${issue.path.join(".")}:${issue.message}`)
        .join("; "),
    };
  }
  return { ok: true, model: parsed.data, source: "structured" };
}

export function isWordTemplateIdValue(value: unknown): value is WordTemplateId {
  return (
    typeof value === "string" &&
    (WORD_TEMPLATE_IDS as readonly string[]).includes(value)
  );
}
