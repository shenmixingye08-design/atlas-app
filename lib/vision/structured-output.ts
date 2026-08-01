import "server-only";

import { z } from "zod";

import {
  isVisionDetectedType,
  visionDetectedTypeSchema,
} from "@/lib/vision/schemas";
import type { VisionDetectedType } from "@/lib/vision/types";

/**
 * Gate-facing Structured Outputs payload required by ATLAS vision stability.
 * Free-text success/failure inference is forbidden — use these booleans.
 */
export const visionStructuredGateSchema = z.object({
  image_readable: z.boolean(),
  document_type: z.string(),
  detected_fields: z.record(z.string(), z.unknown()).default({}),
  missing_required_fields: z.array(z.string()).default([]),
  confidence: z.number().min(0).max(1),
  needs_user_input: z.boolean(),
  user_message: z.string().default(""),
});

export type VisionStructuredGate = z.infer<typeof visionStructuredGateSchema>;

/** Field entries for OpenAI strict JSON schema (no free-form object keys). */
const fieldEntrySchema = {
  type: "object",
  additionalProperties: false,
  required: ["key", "value"],
  properties: {
    key: { type: "string" },
    value: { type: "string" },
  },
} as const;

const tableSchema = {
  type: "object",
  additionalProperties: false,
  required: ["headers", "rows", "notes"],
  properties: {
    headers: { type: "array", items: { type: "string" } },
    rows: {
      type: "array",
      items: { type: "array", items: { type: "string" } },
    },
    notes: { type: ["string", "null"] },
  },
} as const;

/**
 * Strict JSON Schema for Responses API `text.format`.
 * Keep additionalProperties:false and required lists complete for strict mode.
 */
export const VISION_STRUCTURED_OUTPUT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "image_readable",
    "document_type",
    "detected_fields",
    "missing_required_fields",
    "confidence",
    "needs_user_input",
    "user_message",
    "summary",
    "extracted_text",
    "language",
    "tables",
    "visual_elements",
    "warnings",
    "recommended_actions",
    "artifact_suggestions",
    "layout_hierarchy",
    "layout_sections",
    "structure_notes",
    "recommended_formats",
  ],
  properties: {
    image_readable: { type: "boolean" },
    document_type: {
      type: "string",
      enum: [
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
      ],
    },
    detected_fields: {
      type: "array",
      items: fieldEntrySchema,
    },
    missing_required_fields: { type: "array", items: { type: "string" } },
    confidence: { type: "number", minimum: 0, maximum: 1 },
    needs_user_input: { type: "boolean" },
    user_message: { type: "string" },
    summary: { type: "string" },
    extracted_text: { type: ["string", "null"] },
    language: { type: ["string", "null"] },
    tables: { type: "array", items: tableSchema },
    visual_elements: { type: "array", items: { type: "string" } },
    warnings: { type: "array", items: { type: "string" } },
    recommended_actions: { type: "array", items: { type: "string" } },
    artifact_suggestions: { type: "array", items: { type: "string" } },
    layout_hierarchy: { type: ["string", "null"] },
    layout_sections: { type: "array", items: { type: "string" } },
    structure_notes: { type: ["string", "null"] },
    recommended_formats: {
      type: "array",
      items: {
        type: "string",
        enum: ["docx", "xlsx", "pdf", "pptx", "md", "csv", "json"],
      },
    },
  },
} as const;

export const VISION_TEXT_FORMAT = {
  type: "json_schema" as const,
  name: "atlas_vision_analysis",
  strict: true,
  schema: VISION_STRUCTURED_OUTPUT_SCHEMA,
};

export type VisionStructuredModelPayload = {
  image_readable: boolean;
  document_type: VisionDetectedType;
  detected_fields: Record<string, unknown>;
  missing_required_fields: string[];
  confidence: number;
  needs_user_input: boolean;
  user_message: string;
  summary: string;
  extractedText: string | null;
  language: string | null;
  tables: Array<{
    headers: string[];
    rows: Array<Array<string | null>>;
    notes: string | null;
  }>;
  visualElements: string[];
  warnings: string[];
  missingFields: string[];
  recommendedActions: string[];
  artifactSuggestions: string[];
  /** Alias used by existing adapters. */
  detectedType: VisionDetectedType;
  fields: Record<string, unknown>;
};

function fieldsFromEntries(entries: unknown): Record<string, unknown> {
  if (!Array.isArray(entries)) {
    if (entries && typeof entries === "object") {
      return entries as Record<string, unknown>;
    }
    return {};
  }
  const out: Record<string, unknown> = {};
  for (const entry of entries) {
    if (!entry || typeof entry !== "object") continue;
    const row = entry as { key?: unknown; value?: unknown };
    if (typeof row.key !== "string" || !row.key.trim()) continue;
    out[row.key] = row.value ?? null;
  }
  return out;
}

/**
 * Parse Structured Outputs / JSON text into the ATLAS vision model payload.
 * Never infers success from prose — uses image_readable / needs_user_input.
 */
export function parseVisionStructuredPayload(rawText: string): VisionStructuredModelPayload {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawText.trim());
  } catch {
    const start = rawText.indexOf("{");
    const end = rawText.lastIndexOf("}");
    if (start >= 0 && end > start) {
      parsed = JSON.parse(rawText.slice(start, end + 1));
    } else {
      throw new Error("vision_structured_json_parse_failed");
    }
  }

  if (!parsed || typeof parsed !== "object") {
    throw new Error("vision_structured_json_invalid");
  }

  const row = parsed as Record<string, unknown>;
  const documentTypeRaw =
    typeof row.document_type === "string"
      ? row.document_type
      : typeof row.detectedType === "string"
        ? row.detectedType
        : "unknown";
  const documentType = isVisionDetectedType(documentTypeRaw)
    ? documentTypeRaw
    : visionDetectedTypeSchema.catch("unknown").parse(documentTypeRaw);

  const detectedFields = fieldsFromEntries(
    row.detected_fields ?? row.fields ?? [],
  );
  const missing =
    Array.isArray(row.missing_required_fields)
      ? row.missing_required_fields.filter((v): v is string => typeof v === "string")
      : Array.isArray(row.missingFields)
        ? row.missingFields.filter((v): v is string => typeof v === "string")
        : [];

  const confidenceRaw = row.confidence;
  const confidence =
    typeof confidenceRaw === "number" && Number.isFinite(confidenceRaw)
      ? Math.min(1, Math.max(0, confidenceRaw))
      : 0.4;

  const imageReadable =
    typeof row.image_readable === "boolean"
      ? row.image_readable
      : Boolean(
          (typeof row.summary === "string" && row.summary.trim()) ||
            (typeof row.extracted_text === "string" && row.extracted_text.trim()) ||
            Object.keys(detectedFields).length > 0,
        );

  // Only trust explicit Structured Outputs flag. Do not infer from missingFields —
  // that would collapse soft OCR gaps into hard needs_input and block deliverables.
  const needsUserInput =
    typeof row.needs_user_input === "boolean" ? row.needs_user_input : false;

  const tablesRaw = Array.isArray(row.tables) ? row.tables : [];
  const tables = tablesRaw.map((table) => {
    const t = table && typeof table === "object" ? (table as Record<string, unknown>) : {};
    return {
      headers: Array.isArray(t.headers)
        ? t.headers.map((h) => String(h ?? ""))
        : [],
      rows: Array.isArray(t.rows)
        ? t.rows.map((r) =>
            Array.isArray(r) ? r.map((c) => (c == null ? null : String(c))) : [],
          )
        : [],
      notes: typeof t.notes === "string" ? t.notes : null,
    };
  });

  return {
    image_readable: imageReadable,
    document_type: documentType,
    detected_fields: detectedFields,
    missing_required_fields: missing,
    confidence,
    needs_user_input: needsUserInput,
    user_message: typeof row.user_message === "string" ? row.user_message : "",
    summary: typeof row.summary === "string" ? row.summary : "",
    extractedText:
      typeof row.extracted_text === "string"
        ? row.extracted_text
        : typeof row.extractedText === "string"
          ? row.extractedText
          : null,
    language:
      typeof row.language === "string"
        ? row.language
        : row.language === null
          ? null
          : null,
    tables,
    visualElements: Array.isArray(row.visual_elements)
      ? row.visual_elements.map(String)
      : Array.isArray(row.visualElements)
        ? row.visualElements.map(String)
        : [],
    warnings: Array.isArray(row.warnings) ? row.warnings.map(String) : [],
    missingFields: missing,
    recommendedActions: Array.isArray(row.recommended_actions)
      ? row.recommended_actions.map(String)
      : Array.isArray(row.recommendedActions)
        ? row.recommendedActions.map(String)
        : [],
    artifactSuggestions: [
      ...(Array.isArray(row.artifact_suggestions)
        ? row.artifact_suggestions.map(String)
        : Array.isArray(row.artifactSuggestions)
          ? row.artifactSuggestions.map(String)
          : []),
      ...(Array.isArray(row.recommended_formats)
        ? row.recommended_formats.map((f) => String(f))
        : []),
    ],
    detectedType: documentType,
    fields: {
      ...detectedFields,
      ...(typeof row.layout_hierarchy === "string" || row.layout_hierarchy === null
        ? { layoutHierarchy: row.layout_hierarchy }
        : {}),
      ...(Array.isArray(row.layout_sections)
        ? { layoutSections: row.layout_sections.map(String) }
        : {}),
      ...(typeof row.structure_notes === "string" || row.structure_notes === null
        ? { structureNotes: row.structure_notes }
        : {}),
    },
  };
}
