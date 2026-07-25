import "server-only";

import { businessProfileRepository } from "./repository";
import type { ProfileUsageLog, ResolvedField } from "./types";

export async function recordProfileUsage(input: {
  ownerUserId: string;
  profileId?: string | null;
  contactId?: string | null;
  caseId?: string | null;
  artifactId?: string | null;
  purpose: string;
  fields?: ResolvedField[];
  fieldKeys?: string[];
}): Promise<ProfileUsageLog> {
  const fieldKeys = input.fieldKeys ?? input.fields?.map((field) => field.key) ?? [];
  return businessProfileRepository.recordUsageLog({
    ownerUserId: input.ownerUserId,
    profileId: input.profileId,
    contactId: input.contactId,
    caseId: input.caseId,
    artifactId: input.artifactId,
    purpose: input.purpose,
    fieldKeys,
  });
}
