import type { ParsedRequest, RouteDecision } from "./types";

/** Safe diagnostic payload — never includes full assignment or file bytes. */
export function buildUnderstandingLog(input: {
  userId?: string | null;
  rawInputLength: number;
  attachmentCount: number;
  decision: RouteDecision;
  durationMs: number;
  modelRequestId?: string | null;
}) {
  const { parsed } = input.decision;
  return {
    requestId: parsed.request_id,
    userId: input.userId ?? null,
    rawInputLength: input.rawInputLength,
    attachmentCount: input.attachmentCount,
    detectedIntent: parsed.intent,
    executionMode: parsed.execution_mode,
    requestedOutputs: parsed.requested_outputs.map((o) => o.format),
    confidence: parsed.confidence,
    needsClarification: parsed.needs_clarification,
    missingFields: parsed.missing_required_fields,
    selectedWorkflow: parsed.recommended_workflow.map((s) => s.stepId),
    selectedRouter: parsed.router_target,
    duration: input.durationMs,
    fallbackUsed: parsed.fallback_used,
    modelRequestId: input.modelRequestId ?? null,
    diagnosticId: parsed.diagnostic_id,
  };
}

export function buildUnderstandingPublicView(parsed: ParsedRequest) {
  return {
    requestId: parsed.request_id,
    summary: parsed.user_summary,
    intent: parsed.intent,
    executionMode: parsed.execution_mode,
    documentKind: parsed.document_kind,
    outputs: parsed.requested_outputs,
    inputs: parsed.source_inputs.map((s) => ({
      type: s.type,
      role: s.role,
      fileName: s.fileName ?? null,
      reference: s.reference,
    })),
    missingFields: parsed.missing_required_fields,
    assumptions: parsed.assumptions,
    questions: parsed.clarification_questions,
    confidence: parsed.confidence,
    needsClarification: parsed.needs_clarification,
    routerTarget: parsed.router_target,
    unsupportedReason: parsed.unsupported_reason ?? null,
    alternatives: parsed.alternatives ?? [],
    workflow: parsed.recommended_workflow.map((s) => ({
      stepId: s.stepId,
      type: s.type,
      requiresConfirmation: s.requiresConfirmation,
      status: s.status,
    })),
    legalNote:
      "外部送信・投稿・自動化は確認後に実行します。金額や契約条件は勝手に確定しません。",
  };
}
