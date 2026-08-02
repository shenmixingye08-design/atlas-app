import "server-only";

import { resolvePersonalization } from "@/lib/personalization/service";
import type { ArtifactGeneratorOptions } from "@/lib/personalization/types";

export async function resolvePersonalizationForDeliverables(input: {
  userId: string;
  explicitOverrides?: Record<string, unknown> | null;
  automationId?: string | null;
  templateId?: string | null;
  companyId?: string | null;
  category?: string | null;
  artifactType?: string | null;
  skipMemoryIds?: readonly string[] | null;
  memoryEnabled?: boolean;
}): Promise<ArtifactGeneratorOptions | null> {
  try {
    const resolved = await resolvePersonalization({
      ownerId: input.userId,
      explicitOverrides: input.explicitOverrides,
      automationId: input.automationId,
      templateId: input.templateId,
      companyId: input.companyId,
      category: input.category,
      artifactType: input.artifactType,
      skipMemoryIds: input.skipMemoryIds,
      memoryEnabled: input.memoryEnabled,
    });
    return resolved.generatorOptions;
  } catch {
    return null;
  }
}
