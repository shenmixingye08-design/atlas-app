import "server-only";

import { promises as fs } from "fs";
import path from "path";

import type { VisionStyleSignals } from "@/lib/vision/types";

/**
 * Optional style-reference stash (session / approved save).
 * Does NOT write into User Profile / Business Profile cores.
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

const ROOT = path.join(process.cwd(), ".data", "vision-style-refs");

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

  const dir = path.join(ROOT, input.userId);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(
    path.join(dir, `${record.id}.json`),
    JSON.stringify(record, null, 2),
    "utf8",
  );
  return record;
}
