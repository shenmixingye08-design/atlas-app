import type {
  ArtifactContext,
  NeedsInputRequest,
  NeedsInputState,
  ResolvedField,
} from "./types";

export function validateRequiredArtifactFields(
  fields: ResolvedField[],
): NeedsInputState {
  const missingRequired = fields.filter((field) => field.required && field.missing);
  return {
    status: missingRequired.length > 0 ? "needs_input" : "ready",
    missingRequired,
  };
}

export function createNeedsInputRequest(
  context: ArtifactContext,
  reason = "資料作成に必要な業務プロフィール情報が不足しています。",
): NeedsInputRequest | null {
  if (context.needsInput.status !== "needs_input") return null;

  return {
    status: "needs_input",
    reason,
    missingFields: context.missingRequired.map((field) => ({
      key: field.key,
      label: field.label,
      sourceLabel: field.sourceLabel,
    })),
    context: {
      profileId: context.profile?.id ?? null,
      contactIds: context.contacts.map((contact) => contact.id),
      caseId: context.project?.id ?? null,
    },
  };
}
