import "server-only";

import type { VisionStyleSignals } from "@/lib/vision/types";

/**
 * Optional style-reference stash (session / approved save).
 * In-memory only — never writes local filesystem.
 */
export type StyleReferenceChoice = "session_only" | "profile_save" | "discard";

export type StyleReferenceRecord = {
  id: string;
  userId: string;
  choice: StyleReferenceChoice;
  signals: VisionStyleSignals;
  sourceAttachmentIds: string[];
  note: string | null;
  createdAt: string;
};

function styleRefs(): StyleReferenceRecord[] {
  const g = globalThis as typeof globalThis & {
    __atlasStyleRefs?: StyleReferenceRecord[];
  };
  if (!g.__atlasStyleRefs) g.__atlasStyleRefs = [];
  return g.__atlasStyleRefs;
}

export async function saveStyleReference(input: {
  userId: string;
  choice: StyleReferenceChoice;
  signals: VisionStyleSignals;
  sourceAttachmentIds: string[];
  note?: string | null;
}): Promise<StyleReferenceRecord | null> {
  if (input.choice === "discard") return null;

  const record: StyleReferenceRecord = {
    id: `sref_${crypto.randomUUID().replace(/-/g, "").slice(0, 14)}`,
    userId: input.userId,
    choice: input.choice,
    signals: input.signals,
    sourceAttachmentIds: input.sourceAttachmentIds,
    note: input.note ?? null,
    createdAt: new Date().toISOString(),
  };
  styleRefs().push(record);
  return record;
}
