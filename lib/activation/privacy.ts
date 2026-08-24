import type {
  ActivationEventName,
  ActivationEventPayload,
  ActivationGoalId,
  DeviceCategory,
} from "./types";
import { ACTIVATION_EVENT_NAMES, ACTIVATION_GOAL_IDS } from "./types";

const FORBIDDEN_KEYS = [
  "prompt",
  "assignment",
  "text",
  "body",
  "content",
  "token",
  "accessToken",
  "refreshToken",
  "apiKey",
  "secret",
  "password",
  "email",
  "card",
  "payment",
  "attachment",
  "file",
] as const;

export function isActivationEventName(value: unknown): value is ActivationEventName {
  return (
    typeof value === "string" &&
    (ACTIVATION_EVENT_NAMES as readonly string[]).includes(value)
  );
}

export function isActivationGoalId(value: unknown): value is ActivationGoalId {
  return (
    typeof value === "string" &&
    (ACTIVATION_GOAL_IDS as readonly string[]).includes(value)
  );
}

export function sanitizeDeviceCategory(value: unknown): DeviceCategory {
  if (value === "mobile" || value === "tablet" || value === "desktop") {
    return value;
  }
  return "unknown";
}

export function looksLikeSecret(value: string): boolean {
  if (value.length > 180) return true;
  return /(sk-|pk_live|Bearer |-----BEGIN|api[_-]?key)/i.test(value);
}

export function sanitizeEventField(
  value: unknown,
  max = 80,
): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (looksLikeSecret(trimmed)) return null;
  return trimmed.slice(0, max);
}

export function stripForbiddenFields(
  input: Record<string, unknown>,
): Record<string, unknown> {
  const next: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    if (
      FORBIDDEN_KEYS.some((forbidden) =>
        key.toLowerCase().includes(forbidden.toLowerCase()),
      )
    ) {
      continue;
    }
    if (typeof value === "string" && looksLikeSecret(value)) continue;
    next[key] = value;
  }
  return next;
}

export function toSafeEventPayload(
  input: Partial<ActivationEventPayload> & {
    event: ActivationEventName;
    userId: string;
    idempotencyKey: string;
  },
): ActivationEventPayload {
  return {
    event: input.event,
    userId: input.userId.trim(),
    occurredAt: input.occurredAt ?? new Date().toISOString(),
    sourcePage: sanitizeEventField(input.sourcePage, 120),
    selectedGoal: isActivationGoalId(input.selectedGoal)
      ? input.selectedGoal
      : null,
    jobType: sanitizeEventField(input.jobType, 40),
    success: typeof input.success === "boolean" ? input.success : null,
    diagnosticId: sanitizeEventField(input.diagnosticId, 80),
    plan: sanitizeEventField(input.plan, 24),
    deviceCategory: sanitizeDeviceCategory(input.deviceCategory),
    appVersion: sanitizeEventField(input.appVersion, 32),
    idempotencyKey: input.idempotencyKey.slice(0, 120),
  };
}
