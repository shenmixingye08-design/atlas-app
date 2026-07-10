import type { DeliverableType } from "@/lib/orchestration/deliverable-types";

/** Max output tokens by deliverable type (enforced via model policy). */
export const DELIVERABLE_OUTPUT_TOKEN_LIMITS: Record<DeliverableType, number> = {
  email: 1_024,
  social_post: 2_048,
  short_document: 1_024,
  document: 3_072,
  presentation: 4_096,
  proposal: 6_144,
  research: 6_144,
  report: 8_192,
  blog: 8_192,
};

/** Max assignment input characters before workflow rejects gracefully. */
export const MAX_ASSIGNMENT_CHARS = 8_000;

export function getOutputTokenLimitForType(type: DeliverableType | string): number {
  if (type in DELIVERABLE_OUTPUT_TOKEN_LIMITS) {
    return DELIVERABLE_OUTPUT_TOKEN_LIMITS[type as DeliverableType];
  }
  return DELIVERABLE_OUTPUT_TOKEN_LIMITS.document;
}

export function assignmentWithinLimit(assignment: string): boolean {
  return assignment.trim().length <= MAX_ASSIGNMENT_CHARS;
}
