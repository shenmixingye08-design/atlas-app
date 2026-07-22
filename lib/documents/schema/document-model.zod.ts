import { z } from "zod";

import {
  DOCUMENT_MODEL_SCHEMA_VERSION,
  DOCUMENT_TYPES,
  OUTPUT_FORMATS,
  TEMPLATE_IDS,
} from "./enums";

export const sectionBlockSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("paragraph"), text: z.string() }),
  z.object({ type: z.literal("bullets"), items: z.array(z.string()) }),
  z.object({
    type: z.literal("table"),
    headers: z.array(z.string()),
    rows: z.array(z.array(z.string())),
  }),
  z.object({
    type: z.literal("callout"),
    variant: z.enum(["info", "warning", "note"]),
    text: z.string(),
  }),
]);

export const documentSectionSchema = z.object({
  heading: z.string(),
  level: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  blocks: z.array(sectionBlockSchema),
});

export const actionItemSchema = z.object({
  text: z.string(),
  assignee: z.string().optional(),
  dueDate: z.string().optional(),
  done: z.boolean().optional(),
});

export const sourceReferenceSchema = z.object({
  label: z.string(),
  url: z.string().optional(),
  note: z.string().optional(),
});

export const documentModelSchema = z.object({
  schemaVersion: z.literal(DOCUMENT_MODEL_SCHEMA_VERSION),
  documentType: z.enum(DOCUMENT_TYPES),
  templateId: z.enum(TEMPLATE_IDS),
  outputPreference: z.enum(OUTPUT_FORMATS).optional(),
  title: z.string().min(1),
  subtitle: z.string().optional(),
  language: z.string().default("ja"),
  metadata: z.record(z.string(), z.string()).optional(),
  summary: z.string().optional(),
  sections: z.array(documentSectionSchema),
  actionItems: z.array(actionItemSchema).optional(),
  appendices: z.array(documentSectionSchema).optional(),
  sourceReferences: z.array(sourceReferenceSchema).optional(),
});

export type SectionBlock = z.infer<typeof sectionBlockSchema>;
export type DocumentSection = z.infer<typeof documentSectionSchema>;
export type ActionItem = z.infer<typeof actionItemSchema>;
export type SourceReference = z.infer<typeof sourceReferenceSchema>;
export type DocumentModel = z.infer<typeof documentModelSchema>;

export function parseDocumentModel(input: unknown): DocumentModel | null {
  const result = documentModelSchema.safeParse(input);
  return result.success ? result.data : null;
}

export function assertDocumentModel(input: unknown): DocumentModel {
  return documentModelSchema.parse(input);
}
