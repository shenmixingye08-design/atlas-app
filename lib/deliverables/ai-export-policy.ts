/**
 * Export-path AI policy: quality improvements must not add AI calls.
 *
 * Allowed AI retries on the deliverable export path ONLY when:
 * - caller explicitly opts in AND
 * - content failed hard validation (empty / api-error-like / truncated JSON)
 *
 * Success path: never re-call AI.
 */

export type AiExportRetryMode = "never" | "hard_failures_only";

export function resolveAiExportRetryMode(input?: {
  allowAiContentRetry?: boolean;
  regenerateProvided?: boolean;
}): AiExportRetryMode {
  if (!input?.allowAiContentRetry) return "never";
  if (!input.regenerateProvided) return "never";
  return "hard_failures_only";
}

/** Issues that may justify a single AI retry when explicitly opted in. */
export const HARD_CONTENT_FAILURE_ISSUES = new Set([
  "empty",
  "html_error",
  "json_only",
  "system_message",
  "truncated",
]);

export function shouldAllowAiContentRetry(input: {
  mode: AiExportRetryMode;
  issues: string[];
}): boolean {
  if (input.mode === "never") return false;
  return input.issues.some((issue) => HARD_CONTENT_FAILURE_ISSUES.has(issue));
}

/**
 * Guard used by generate routes — documents and enforces zero-AI export default.
 */
export function assertExportPathHasNoAiRegenerate(
  regenerateContent: unknown,
): void {
  if (typeof regenerateContent === "function") {
    throw new Error(
      "export_path_ai_regenerate_forbidden: deliverable export must not re-call AI; regenerate Word from sourceContent instead",
    );
  }
}
