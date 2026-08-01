import { understandRequest, formatsFromParsedRequest } from "./understand";
import type {
  OutputFormat,
  RouteDecision,
  UnderstandInput,
} from "./types";
import { userMessageForRequestCode } from "./errors";

/**
 * Common router — all entry points should prefer this over local keyword checks.
 */
export function routeRequest(input: UnderstandInput): RouteDecision {
  const parsed = understandRequest(input);
  const formats = formatsFromParsedRequest(parsed).filter(
    (f): f is OutputFormat | "md" | "txt" => true,
  ) as unknown as OutputFormat[];

  if (parsed.router_target === "unsupported") {
    return {
      target: "unsupported",
      parsed,
      shouldStartJob: false,
      shouldConfirm: false,
      formats: [],
      userMessage:
        [
          parsed.unsupported_reason,
          parsed.alternatives?.length
            ? `いまできること: ${parsed.alternatives.join(" / ")}`
            : null,
        ]
          .filter(Boolean)
          .join("\n") || userMessageForRequestCode("unsupported_intent"),
      developerCode: "unsupported_intent",
    };
  }

  if (parsed.router_target === "needs_input" || parsed.needs_clarification) {
    return {
      target: "needs_input",
      parsed,
      shouldStartJob: false,
      shouldConfirm: true,
      formats: formatsFromParsedRequest(parsed) as unknown as OutputFormat[],
      userMessage:
        parsed.clarification_questions.join("\n") ||
        userMessageForRequestCode("required_information_missing"),
      developerCode: parsed.missing_required_fields.includes("attachment")
        ? "attachment_missing"
        : "required_information_missing",
    };
  }

  const highRisk =
    parsed.execution_mode === "external_action" ||
    parsed.execution_mode === "automation" ||
    parsed.risks.includes("external_action_requires_confirmation") ||
    parsed.risks.includes("automation_requires_confirmation");

  const shouldConfirm =
    highRisk ||
    (parsed.confidence >= 0.4 &&
      parsed.confidence < 0.7 &&
      parsed.assumptions.length > 3);

  // Mid confidence with safe assumptions: start job but surface assumptions
  const shouldStartJob = parsed.confidence >= 0.4;

  return {
    target: parsed.router_target,
    parsed,
    shouldStartJob,
    shouldConfirm,
    formats: formatsFromParsedRequest(parsed) as unknown as OutputFormat[],
    userMessage: shouldConfirm
      ? `${parsed.user_summary}\n\nこの内容で進めてよろしいですか？`
      : parsed.user_summary,
    developerCode:
      parsed.router_target === "external_execute"
        ? "confirmation_required"
        : "ok",
  };
}

/** Apply safe UI corrections without full re-classification from scratch. */
export function applyRequestOverrides(
  base: UnderstandInput,
  overrides: NonNullable<UnderstandInput["overrides"]>,
): RouteDecision {
  return routeRequest({ ...base, overrides });
}
