/**
 * Safe X-post instruction trace. Presence flags only — never logs
 * post body, natural-language request text, tokens, or emails.
 */

export type XPostInstructionTraceStage =
  | "create"
  | "v2_persist"
  | "v1_bridge"
  | "scheduler"
  | "execution"
  | "classify"
  | "generate"
  | "needs_input";

export type XPostInstructionTrace = {
  stage: XPostInstructionTraceStage;
  automationId?: string | null;
  runId?: string | null;
  executionId?: string | null;
  contentSource?: string | null;
  originalUserRequestPresent?: boolean;
  generateInstructionPresent?: boolean;
  resolvedGenerateInstructionPresent?: boolean;
  configurationTextEmpty?: boolean;
  memoryUsed?: boolean;
  classifyMode?: string | null;
  classifyReason?: string | null;
  needsInputReason?: string | null;
  generatedXPostTextPresent?: boolean;
  v1AssignmentPresent?: boolean;
};

function hasText(value: unknown): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

export function logXPostInstructionTrace(input: XPostInstructionTrace): void {
  console.info("[x-post-instruction-trace]", {
    stage: input.stage,
    automationId: input.automationId ?? null,
    runId: input.runId ?? null,
    executionId: input.executionId ?? input.runId ?? null,
    contentSource: input.contentSource ?? null,
    originalUserRequestPresent: Boolean(input.originalUserRequestPresent),
    generateInstructionPresent: Boolean(input.generateInstructionPresent),
    resolvedGenerateInstructionPresent: Boolean(
      input.resolvedGenerateInstructionPresent,
    ),
    configurationTextEmpty:
      input.configurationTextEmpty === undefined
        ? null
        : Boolean(input.configurationTextEmpty),
    memoryUsed: Boolean(input.memoryUsed),
    classifyMode: input.classifyMode ?? null,
    classifyReason: input.classifyReason ?? null,
    needsInputReason: input.needsInputReason ?? null,
    generatedXPostTextPresent: Boolean(input.generatedXPostTextPresent),
    ...(input.v1AssignmentPresent === undefined
      ? {}
      : { v1AssignmentPresent: Boolean(input.v1AssignmentPresent) }),
  });
}

export function findEnabledXPostStep(input: {
  workflow?: {
    steps?: ReadonlyArray<{
      type: string;
      enabled?: boolean;
      configuration?: Readonly<Record<string, unknown>>;
    }>;
  };
} | null | undefined): {
  type: string;
  enabled?: boolean;
  configuration?: Readonly<Record<string, unknown>>;
} | null {
  const steps = input?.workflow?.steps ?? [];
  return (
    steps.find((step) => step.type === "x_post" && step.enabled !== false) ??
    steps.find((step) => step.type === "x_post") ??
    null
  );
}

export function xPostInstructionPresence(input: {
  configuration?: Readonly<Record<string, unknown>> | null;
  structuredOptions?: Readonly<Record<string, unknown>> | null;
}): {
  contentSource: string | null;
  originalUserRequestPresent: boolean;
  generateInstructionPresent: boolean;
  configurationTextEmpty: boolean;
} {
  const configuration = input.configuration ?? {};
  const structured = input.structuredOptions ?? {};
  const contentSource =
    typeof configuration.contentSource === "string"
      ? configuration.contentSource
      : null;
  return {
    contentSource,
    originalUserRequestPresent:
      hasText(structured.originalUserRequest) ||
      hasText(structured.originalInstruction) ||
      hasText(structured.naturalLanguageSeed) ||
      hasText(configuration.originalUserRequest),
    generateInstructionPresent: hasText(configuration.generateInstruction),
    configurationTextEmpty: !hasText(configuration.text),
  };
}
