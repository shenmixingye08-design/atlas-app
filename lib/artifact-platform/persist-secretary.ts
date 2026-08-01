import "server-only";

import { registerArtifact } from "./register";
import type { ArtifactFormat, UnifiedArtifact } from "./types";

/** Persist secretary binary into the unified artifact store (non-throwing). */
export async function persistSecretaryArtifact(input: {
  userId: string;
  buffer: Buffer;
  format: ArtifactFormat;
  fileName: string;
  title?: string;
  sourceContent?: string;
  createdFrom: string;
}): Promise<UnifiedArtifact | null> {
  try {
    return await registerArtifact({
      userId: input.userId,
      buffer: input.buffer,
      format: input.format,
      fileName: input.fileName,
      title: input.title ?? input.fileName.replace(/\.[^.]+$/, ""),
      sourceContent: input.sourceContent,
      createdFrom: input.createdFrom,
      conversionType: null,
    });
  } catch (error) {
    console.error("[artifact-platform] persistSecretaryArtifact failed", error);
    return null;
  }
}
