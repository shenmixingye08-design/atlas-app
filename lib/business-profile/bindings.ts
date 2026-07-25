import "server-only";

import { businessProfileRepository } from "./repository";
import type { ArtifactDataBinding } from "./types";

/** Persist which field keys were bound into an artifact (values never stored). */
export async function createArtifactDataBindings(input: {
  ownerUserId: string;
  artifactId: string;
  profileId?: string | null;
  contactId?: string | null;
  caseId?: string | null;
  fieldKeys: string[];
}): Promise<ArtifactDataBinding | null> {
  if (!input.artifactId || input.fieldKeys.length === 0) return null;
  return businessProfileRepository.createArtifactDataBinding(input);
}
