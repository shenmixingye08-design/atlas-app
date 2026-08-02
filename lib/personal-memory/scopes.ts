import type {
  PersonalMemoryKind,
  PersonalMemoryScope,
} from "@/lib/personal-memory/types";
import { SENSITIVE_SCOPES } from "@/lib/personal-memory/types";

const KIND_TO_SCOPES: Record<PersonalMemoryKind, readonly PersonalMemoryScope[]> = {
  user_preference: [
    "writing_style",
    "document_design",
    "color_palette",
    "preferred_formats",
    "file_naming",
    "notification_preferences",
    "approval_preferences",
    "bullet_style",
    "image_output",
    "ai_model_preference",
    "preferred_work_hours",
  ],
  work_preference: [
    "work_content_style",
    "recurring_work_preferences",
    "client_style",
    "ocr_postprocess",
  ],
  default_destination: [
    "default_storage_locations",
    "default_recipients",
    "calendar_defaults",
    "wordpress_defaults",
  ],
  automation_preference: [
    "automation_execution",
    "approval_preferences",
    "notification_preferences",
    "ai_model_preference",
  ],
  naming_convention: [
    "file_naming",
    "date_format",
    "title_format",
    "sheet_naming",
    "artifact_naming",
  ],
  template_preference: [
    "word_template",
    "excel_template",
    "powerpoint_theme",
    "pdf_layout",
    "company_template",
  ],
  locale: ["language", "timezone", "currency", "date_format"],
  sensitive: [
    "default_recipients",
    "default_storage_locations",
    "contact_info",
    "customer_info",
    "client_style",
  ],
};

export function scopesForKind(kind: PersonalMemoryKind): readonly PersonalMemoryScope[] {
  return KIND_TO_SCOPES[kind];
}

export function kindForScope(scope: PersonalMemoryScope): PersonalMemoryKind {
  if (SENSITIVE_SCOPES.includes(scope)) return "sensitive";
  for (const [kind, scopes] of Object.entries(KIND_TO_SCOPES) as Array<
    [PersonalMemoryKind, readonly PersonalMemoryScope[]]
  >) {
    if (kind === "sensitive") continue;
    if (scopes.includes(scope)) return kind;
  }
  return "user_preference";
}

export function isPersonalMemoryScope(value: string): value is PersonalMemoryScope {
  return (Object.values(KIND_TO_SCOPES).flat() as string[]).includes(value);
}

/** Map legacy automation-platform scopes onto personal memory scopes */
export function mapAutomationScopeToPersonal(
  scope: string,
): PersonalMemoryScope | null {
  const map: Record<string, PersonalMemoryScope> = {
    writing_style: "writing_style",
    document_design: "document_design",
    preferred_formats: "preferred_formats",
    preferred_templates: "word_template",
    default_recipients: "default_recipients",
    default_storage_locations: "default_storage_locations",
    notification_preferences: "notification_preferences",
    approval_preferences: "approval_preferences",
    timezone: "timezone",
    locale: "language",
    naming_conventions: "file_naming",
    recurring_work_preferences: "recurring_work_preferences",
  };
  return map[scope] ?? null;
}
