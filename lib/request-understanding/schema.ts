import { z } from "zod";

import type { ParsedRequest } from "./types";

const outputFormatSchema = z.enum([
  "docx",
  "xlsx",
  "pdf",
  "pptx",
  "csv",
  "json",
  "markdown",
  "image",
  "none",
]);

const executionModeSchema = z.enum([
  "answer",
  "artifact",
  "conversion",
  "analysis",
  "external_action",
  "automation",
  "mixed",
]);

const intentSchema = z.enum([
  "conversation",
  "create_word",
  "create_excel",
  "create_pdf",
  "create_pptx",
  "create_csv",
  "create_image",
  "edit_artifact",
  "convert_file",
  "analyze_file",
  "analyze_image",
  "analyze_data",
  "external_execute",
  "schedule_automation",
  "schedule_once",
  "notify",
  "composite",
  "needs_input",
  "unsupported",
]);

export const parsedRequestSchema = z.object({
  request_id: z.string().min(1),
  intent: intentSchema,
  task_category: z.enum([
    "document",
    "spreadsheet",
    "presentation",
    "data",
    "vision",
    "communication",
    "automation",
    "research",
    "unknown",
  ]),
  document_kind: z
    .enum([
      "minutes",
      "report",
      "estimate",
      "invoice",
      "contract",
      "proposal",
      "sales_deck",
      "household",
      "attendance",
      "resume",
      "blog",
      "email_draft",
      "sns_draft",
      "generic",
    ])
    .nullable(),
  execution_mode: executionModeSchema,
  requested_outputs: z
    .array(
      z.object({
        format: outputFormatSchema,
        purpose: z.string(),
        required: z.boolean(),
        confidence: z.number().min(0).max(1),
      }),
    )
    .min(1),
  source_inputs: z.array(
    z.object({
      type: z.enum([
        "text",
        "image",
        "pdf",
        "docx",
        "xlsx",
        "pptx",
        "csv",
        "url",
        "external_service",
      ]),
      reference: z.string(),
      role: z.string(),
      mimeType: z.string().optional(),
      fileName: z.string().optional(),
      byteLength: z.number().optional(),
      confidence: z.number().optional(),
    }),
  ),
  detected_entities: z.record(
    z.string(),
    z.union([z.string(), z.number(), z.boolean(), z.null()]),
  ),
  required_fields: z.array(
    z.object({
      key: z.string(),
      label: z.string(),
      level: z.enum([
        "hard_required",
        "editable_later",
        "safe_assume",
        "never_assume",
        "optional",
      ]),
    }),
  ),
  missing_required_fields: z.array(z.string()),
  optional_fields: z.array(z.string()),
  assumptions: z.array(z.string()),
  risks: z.array(z.string()),
  needs_clarification: z.boolean(),
  clarification_questions: z.array(z.string()).max(3),
  confidence: z.number().min(0).max(1),
  confidence_breakdown: z.object({
    intent: z.number(),
    executionMode: z.number(),
    outputFormat: z.number(),
    attachmentRole: z.number(),
    documentKind: z.number(),
    requiredFields: z.number(),
    conversionPath: z.number(),
    externalAction: z.number(),
  }),
  recommended_workflow: z.array(
    z.object({
      stepId: z.string(),
      type: z.string(),
      input: z.string(),
      output: z.string(),
      dependency: z.array(z.string()),
      status: z.enum(["pending", "blocked", "ready", "skipped"]),
      retryPolicy: z.enum(["transient_only", "none"]),
      requiresConfirmation: z.boolean(),
      failurePolicy: z.enum(["stop_pipeline", "continue_optional"]),
    }),
  ),
  user_summary: z.string().min(1),
  router_target: z.enum([
    "conversation",
    "artifact_generate",
    "artifact_convert",
    "artifact_edit",
    "file_analyze",
    "vision_analyze",
    "external_execute",
    "automation_register",
    "composite_workflow",
    "needs_input",
    "unsupported",
  ]),
  unsupported_reason: z.string().optional(),
  alternatives: z.array(z.string()).optional(),
  fallback_used: z.boolean(),
  diagnostic_id: z.string().min(1),
});

export type ParsedRequestValidation =
  | { ok: true; value: ParsedRequest }
  | { ok: false; errors: string[] };

/** Validate structured request before job creation. */
export function validateParsedRequest(value: unknown): ParsedRequestValidation {
  const result = parsedRequestSchema.safeParse(value);
  if (!result.success) {
    return {
      ok: false,
      errors: result.error.issues.map(
        (issue) => `${issue.path.join(".")}: ${issue.message}`,
      ),
    };
  }

  const parsed = result.data as ParsedRequest;
  const contradictions: string[] = [];

  if (
    parsed.execution_mode === "artifact" &&
    parsed.requested_outputs.every((o) => o.format === "none")
  ) {
    contradictions.push("artifact mode requires at least one real output format");
  }

  if (
    parsed.execution_mode === "external_action" &&
    parsed.router_target === "artifact_generate" &&
    !parsed.requested_outputs.some((o) => o.format !== "none")
  ) {
    // allowed: draft-only external prep — but flag if intent is create_*
    if (parsed.intent.startsWith("create_")) {
      contradictions.push("external_action conflicts with create_* intent without mixed mode");
    }
  }

  if (
    parsed.execution_mode === "conversion" &&
    parsed.source_inputs.every((s) => s.type === "text")
  ) {
    contradictions.push("conversion mode requires a non-text source input");
  }

  if (parsed.needs_clarification && parsed.clarification_questions.length === 0) {
    contradictions.push("needs_clarification requires clarification_questions");
  }

  if (contradictions.length > 0) {
    return { ok: false, errors: contradictions };
  }

  return { ok: true, value: parsed };
}
