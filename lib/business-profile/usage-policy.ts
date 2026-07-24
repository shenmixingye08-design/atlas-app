import {
  DEFAULT_ALLOWED_USAGE,
  DEFAULT_CASE_FIELD_USAGE,
  DEFAULT_CONTACT_FIELD_USAGE,
  DEFAULT_FIELD_USAGE,
  FORBIDDEN_USAGE,
} from "./constants";
import type {
  BusinessFieldSensitivity,
  BusinessFieldUsageFlags,
  TemplateVariableScope,
} from "./types";

function cloneUsage(usage: BusinessFieldUsageFlags): BusinessFieldUsageFlags {
  return { ...usage };
}

export function defaultUsageForBuiltinField(
  scope: TemplateVariableScope,
  key: string,
): BusinessFieldUsageFlags {
  if (scope === "profile" && key in DEFAULT_FIELD_USAGE) {
    return cloneUsage(DEFAULT_FIELD_USAGE[key as keyof typeof DEFAULT_FIELD_USAGE]);
  }
  if (scope === "contact" && key in DEFAULT_CONTACT_FIELD_USAGE) {
    return cloneUsage(
      DEFAULT_CONTACT_FIELD_USAGE[key as keyof typeof DEFAULT_CONTACT_FIELD_USAGE],
    );
  }
  if (scope === "project" && key in DEFAULT_CASE_FIELD_USAGE) {
    return cloneUsage(
      DEFAULT_CASE_FIELD_USAGE[key as keyof typeof DEFAULT_CASE_FIELD_USAGE],
    );
  }
  return cloneUsage(DEFAULT_ALLOWED_USAGE);
}

export function mergeUsageFlags(
  base: BusinessFieldUsageFlags,
  patch?: Partial<BusinessFieldUsageFlags> | null,
): BusinessFieldUsageFlags {
  if (!patch) return cloneUsage(base);
  return {
    aiUsageAllowed: patch.aiUsageAllowed ?? base.aiUsageAllowed,
    documentUsageAllowed:
      patch.documentUsageAllowed ?? base.documentUsageAllowed,
    usageForbidden: patch.usageForbidden ?? base.usageForbidden,
  };
}

export function usageForSensitivity(
  sensitivity: BusinessFieldSensitivity,
  usage: BusinessFieldUsageFlags,
): BusinessFieldUsageFlags {
  if (sensitivity === "secret") return cloneUsage(FORBIDDEN_USAGE);
  if (sensitivity === "restricted") {
    return {
      ...usage,
      aiUsageAllowed: false,
    };
  }
  return cloneUsage(usage);
}

export function isAiAllowed(input: {
  usage: BusinessFieldUsageFlags;
  sensitivity?: BusinessFieldSensitivity;
}): boolean {
  if (input.usage.usageForbidden) return false;
  if (input.sensitivity === "secret" || input.sensitivity === "restricted") {
    return false;
  }
  return input.usage.aiUsageAllowed;
}

export function isDocumentAllowed(input: {
  usage: BusinessFieldUsageFlags;
  sensitivity?: BusinessFieldSensitivity;
}): boolean {
  if (input.usage.usageForbidden) return false;
  if (input.sensitivity === "secret") return false;
  return input.usage.documentUsageAllowed;
}
