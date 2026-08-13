import {
  AUTOMATION_MEMORY_SCOPES,
  SAFE_AUTOMATION_PREFERENCE_SCOPES,
  SENSITIVE_MEMORY_SCOPES,
  type AutomationMemoryPolicy,
  type AutomationMemoryScope,
  type MemoryReferenceRecord,
} from "@/lib/automation-platform/types";
import { AutomationPlatformError } from "@/lib/automation-platform/errors/messages";

export function isAutomationMemoryScope(
  value: string,
): value is AutomationMemoryScope {
  return (AUTOMATION_MEMORY_SCOPES as readonly string[]).includes(value);
}

export function validateMemoryPolicy(policy: AutomationMemoryPolicy): void {
  for (const scope of policy.allowedScopes) {
    if (!isAutomationMemoryScope(scope)) {
      throw new AutomationPlatformError("automation_memory_scope_invalid", {
        scope,
        side: "allowed",
      });
    }
  }
  for (const scope of policy.deniedScopes) {
    if (!isAutomationMemoryScope(scope)) {
      throw new AutomationPlatformError("automation_memory_scope_invalid", {
        scope,
        side: "denied",
      });
    }
  }

  const overlap = policy.allowedScopes.filter((scope) =>
    policy.deniedScopes.includes(scope),
  );
  if (overlap.length > 0) {
    throw new AutomationPlatformError("automation_memory_scope_invalid", {
      reason: "allowed_denied_overlap",
      overlap,
    });
  }
}

/**
 * Resolve which scopes may be read for a run.
 * Denied wins over allowed. Disabled policy yields nothing.
 */
export function resolveReadableMemoryScopes(
  policy: AutomationMemoryPolicy,
): AutomationMemoryScope[] {
  if (!policy.enabled) return [];
  return policy.allowedScopes.filter(
    (scope) => !policy.deniedScopes.includes(scope),
  );
}

/**
 * Safe writing/format prefs for Automation body apply.
 * Default-off policy with empty deny still receives these (legacy automations).
 * Explicit deniedScopes remain blocked. Sensitive scopes never auto-fill.
 */
export function effectiveAutomationPreferenceScopes(
  policy: AutomationMemoryPolicy,
): AutomationMemoryScope[] {
  const denied = new Set(policy.deniedScopes);
  const base =
    policy.enabled && policy.allowedScopes.length > 0
      ? policy.allowedScopes
      : [...SAFE_AUTOMATION_PREFERENCE_SCOPES];
  return base.filter(
    (scope) => !denied.has(scope) && !SENSITIVE_MEMORY_SCOPES.includes(scope),
  );
}

/**
 * Sensitive scopes (recipients, storage) require an explicit locked override
 * or an explicit structured option — never vague inference.
 */
export function assertSensitiveMemoryNotInferred(input: {
  scope: AutomationMemoryScope;
  value: unknown;
  source: MemoryReferenceRecord["source"];
}): void {
  if (!SENSITIVE_MEMORY_SCOPES.includes(input.scope)) return;
  if (input.source === "user_memory" || input.source === "system_default") {
    // user_memory is allowed only when explicitly in allowedScopes (caller checks).
    // system_default must never invent recipients/storage.
    if (input.source === "system_default") {
      throw new AutomationPlatformError("automation_memory_scope_invalid", {
        reason: "sensitive_scope_must_not_use_system_default",
        scope: input.scope,
      });
    }
  }
  if (input.value === undefined || input.value === null || input.value === "") {
    throw new AutomationPlatformError("automation_memory_scope_invalid", {
      reason: "sensitive_scope_empty",
      scope: input.scope,
    });
  }
}

/**
 * Apply lockedOverrides over memory values.
 * Automation-specific overrides always win within the automation.
 */
export function applyMemoryWithOverrides(input: {
  policy: AutomationMemoryPolicy;
  memoryValues: Readonly<Record<string, unknown>>;
}): {
  values: Record<string, unknown>;
  references: MemoryReferenceRecord[];
} {
  const readable = new Set(resolveReadableMemoryScopes(input.policy));
  const values: Record<string, unknown> = {};
  const references: MemoryReferenceRecord[] = [];

  for (const [key, value] of Object.entries(input.memoryValues)) {
    const scope = key as AutomationMemoryScope;
    if (!readable.has(scope)) continue;
    assertSensitiveMemoryNotInferred({
      scope,
      value,
      source: "user_memory",
    });
    values[key] = value;
    references.push({
      scope,
      key,
      summary: summarizeMemoryValue(value),
      source: "user_memory",
    });
  }

  for (const [key, value] of Object.entries(input.policy.lockedOverrides)) {
    values[key] = value;
    const scope = isAutomationMemoryScope(key)
      ? key
      : "recurring_work_preferences";
    references.push({
      scope,
      key,
      summary: summarizeMemoryValue(value),
      source: "locked_override",
    });
  }

  return { values, references };
}

function summarizeMemoryValue(value: unknown): string {
  if (typeof value === "string") {
    return value.length > 80 ? `${value.slice(0, 77)}...` : value;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return "[structured]";
}
