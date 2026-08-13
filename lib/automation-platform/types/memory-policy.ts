/**
 * Memory scopes that automations may opt into.
 * Personal data (recipients, storage) must never be guessed when absent.
 */
export type AutomationMemoryScope =
  | "writing_style"
  | "document_design"
  | "preferred_formats"
  | "preferred_templates"
  | "default_recipients"
  | "default_storage_locations"
  | "notification_preferences"
  | "approval_preferences"
  | "timezone"
  | "locale"
  | "naming_conventions"
  | "recurring_work_preferences";

export const AUTOMATION_MEMORY_SCOPES: readonly AutomationMemoryScope[] = [
  "writing_style",
  "document_design",
  "preferred_formats",
  "preferred_templates",
  "default_recipients",
  "default_storage_locations",
  "notification_preferences",
  "approval_preferences",
  "timezone",
  "locale",
  "naming_conventions",
  "recurring_work_preferences",
] as const;

/** Scopes that must not be auto-filled by inference alone. */
export const SENSITIVE_MEMORY_SCOPES: readonly AutomationMemoryScope[] = [
  "default_recipients",
  "default_storage_locations",
] as const;

export type AutomationMemoryPolicy = {
  enabled: boolean;
  /** Scopes this automation may read. */
  allowedScopes: AutomationMemoryScope[];
  /** Scopes explicitly blocked for this automation. */
  deniedScopes: AutomationMemoryScope[];
  /** Per-automation overrides that win over user memory. */
  lockedOverrides: Readonly<Record<string, unknown>>;
};

export const DEFAULT_MEMORY_POLICY: AutomationMemoryPolicy = {
  enabled: false,
  allowedScopes: [],
  deniedScopes: [],
  lockedOverrides: {},
};

/**
 * Content Preference scopes that Automation may use without opt-in,
 * unless the user explicitly denied them. Never includes recipients/storage.
 */
export const SAFE_AUTOMATION_PREFERENCE_SCOPES: readonly AutomationMemoryScope[] =
  [
    "writing_style",
    "document_design",
    "preferred_formats",
    "preferred_templates",
    "notification_preferences",
    "timezone",
    "locale",
    "naming_conventions",
    "recurring_work_preferences",
  ] as const;

/** Explainable memory reference recorded on a run. */
export type MemoryReferenceRecord = {
  scope: AutomationMemoryScope;
  key: string;
  /** Redacted / non-secret summary for user explanation */
  summary: string;
  source: "user_memory" | "locked_override" | "system_default";
};
