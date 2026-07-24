import { BANK_FIELD_KEYS } from "./constants";
import { isAiAllowed } from "./usage-policy";
import type {
  ArtifactContext,
  SanitizedArtifactContextForAI,
  SanitizedAIField,
} from "./types";

function isBankField(key: string): boolean {
  if (BANK_FIELD_KEYS.has(key)) return true;
  return /(?:bank|Bank|accountNumber|AccountNumber)/.test(key);
}

export function sanitizeContextForAI(
  context: ArtifactContext,
): SanitizedArtifactContextForAI {
  const fields: SanitizedAIField[] = [];

  for (const field of context.fields) {
    if (!field.value) continue;
    if (isBankField(field.key)) continue;
    if (
      !isAiAllowed({
        usage: field.usage,
        sensitivity: field.sensitivity,
      })
    ) {
      continue;
    }

    fields.push({
      key: field.key,
      label: field.label,
      value: field.value,
      valueType: field.valueType,
      sourceKind: field.sourceKind,
      sourceLabel: field.sourceLabel,
    });
  }

  return {
    profileId: context.profile?.id ?? null,
    contactIds: context.contacts.map((contact) => contact.id),
    caseId: context.project?.id ?? null,
    fields,
  };
}
