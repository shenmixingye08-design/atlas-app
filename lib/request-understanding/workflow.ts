import type {
  ExecutionMode,
  ParsedRequest,
  RequestedOutput,
  SourceInput,
  WorkflowStep,
} from "./types";

function step(
  partial: Omit<WorkflowStep, "status" | "retryPolicy" | "failurePolicy"> &
    Partial<Pick<WorkflowStep, "status" | "retryPolicy" | "failurePolicy">>,
): WorkflowStep {
  return {
    status: "ready",
    retryPolicy: "transient_only",
    failurePolicy: "stop_pipeline",
    ...partial,
  };
}

/** Build ordered workflow; later steps depend on earlier success. */
export function buildWorkflow(input: {
  executionMode: ExecutionMode;
  outputs: RequestedOutput[];
  sources: SourceInput[];
  wantsVision: boolean;
  wantsExternal: boolean;
  wantsAutomation: boolean;
  needsClarify: boolean;
}): WorkflowStep[] {
  const steps: WorkflowStep[] = [];
  let prev: string | null = null;

  const push = (s: WorkflowStep) => {
    if (prev) s.dependency = [...new Set([...s.dependency, prev])];
    steps.push(s);
    prev = s.stepId;
  };

  push(
    step({
      stepId: "validate_input",
      type: "validating",
      input: "assignment+attachments",
      output: "validated_request",
      dependency: [],
      requiresConfirmation: false,
    }),
  );

  if (input.needsClarify) {
    push(
      step({
        stepId: "clarify",
        type: "needs_input",
        input: "missing_fields",
        output: "user_answers",
        dependency: [],
        requiresConfirmation: true,
        status: "ready",
        retryPolicy: "none",
        failurePolicy: "stop_pipeline",
      }),
    );
  }

  if (input.wantsVision) {
    push(
      step({
        stepId: "vision_analyze",
        type: "vision",
        input: "images",
        output: "structured_vision",
        dependency: [],
        requiresConfirmation: false,
      }),
    );
  }

  if (
    input.executionMode === "analysis" ||
    input.executionMode === "conversion" ||
    input.sources.some((s) => s.type === "pdf" || s.type === "xlsx" || s.type === "docx")
  ) {
    if (input.executionMode === "analysis" || input.executionMode === "conversion") {
      push(
        step({
          stepId: "parse_source",
          type: "parsing",
          input: "source_file",
          output: "extracted_content",
          dependency: [],
          requiresConfirmation: false,
        }),
      );
    }
  }

  if (
    input.executionMode === "artifact" ||
    input.executionMode === "conversion" ||
    input.executionMode === "mixed"
  ) {
    for (const [index, out] of input.outputs.filter((o) => o.format !== "none").entries()) {
      push(
        step({
          stepId: `generate_${out.format}_${index}`,
          type: input.executionMode === "conversion" ? "converting" : "generating",
          input: "structured_content",
          output: out.format,
          dependency: [],
          requiresConfirmation: false,
        }),
      );
    }
  }

  if (input.executionMode === "answer" && input.outputs.every((o) => o.format === "none" || o.format === "markdown")) {
    push(
      step({
        stepId: "compose_answer",
        type: "answer",
        input: "assignment",
        output: "response_text",
        dependency: [],
        requiresConfirmation: false,
      }),
    );
  }

  if (input.wantsExternal) {
    push(
      step({
        stepId: "prepare_external",
        type: "external_prep",
        input: "artifact_or_text",
        output: "external_payload",
        dependency: [],
        requiresConfirmation: true,
      }),
    );
    push(
      step({
        stepId: "external_execute",
        type: "external_action",
        input: "external_payload",
        output: "external_result",
        dependency: [],
        requiresConfirmation: true,
        retryPolicy: "transient_only",
        failurePolicy: "stop_pipeline",
      }),
    );
  }

  if (input.wantsAutomation) {
    push(
      step({
        stepId: "register_automation",
        type: "automation",
        input: "schedule_spec",
        output: "automation_id",
        dependency: [],
        requiresConfirmation: true,
        retryPolicy: "none",
      }),
    );
  }

  push(
    step({
      stepId: "notify_user",
      type: "notify",
      input: "result",
      output: "user_notification",
      dependency: [],
      requiresConfirmation: false,
      failurePolicy: "continue_optional",
    }),
  );

  // Mark steps after a stop_pipeline failure point as blocked if clarify present
  if (input.needsClarify) {
    return steps.map((s) =>
      s.stepId === "clarify" || s.stepId === "validate_input"
        ? s
        : { ...s, status: "blocked" as const, dependency: [...s.dependency, "clarify"] },
    );
  }

  return steps;
}

/** If any dependency failed, later steps must not run. */
export function canRunStep(
  step: WorkflowStep,
  completed: ReadonlySet<string>,
  failed: ReadonlySet<string>,
): boolean {
  if (step.status === "blocked" || step.status === "skipped") return false;
  if (step.dependency.some((d) => failed.has(d))) return false;
  return step.dependency.every((d) => completed.has(d) || d === step.stepId);
}

export function summarizeForUser(parsed: Pick<
  ParsedRequest,
  | "user_summary"
  | "requested_outputs"
  | "source_inputs"
  | "missing_required_fields"
  | "assumptions"
  | "needs_clarification"
>): string {
  const outputs = parsed.requested_outputs
    .filter((o) => o.format !== "none")
    .map((o) => `${o.format}（${o.purpose}）`)
    .join("、");
  const files = parsed.source_inputs.filter((s) => s.type !== "text");
  const lines = [
    `依頼内容：${parsed.user_summary}`,
    `使用する入力：${files.length ? files.map((f) => f.fileName || f.reference).join("、") : "テキストのみ"}`,
    `作成予定：${outputs || "回答のみ"}`,
    `不足情報：${parsed.missing_required_fields.length ? parsed.missing_required_fields.join("、") : "なし"}`,
  ];
  if (parsed.assumptions.length) {
    lines.push(`仮定：${parsed.assumptions.slice(0, 4).join(" / ")}`);
  }
  if (parsed.needs_clarification) {
    lines.push("確認後に開始します。");
  }
  return lines.join("\n");
}
