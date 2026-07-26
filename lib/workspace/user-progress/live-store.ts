import "server-only";

import type { OrchestrationStep } from "@/lib/orchestration/types";

import type {
  UserProgressKind,
  UserProgressSessionRecord,
} from "./types";

type Bucket = Map<string, UserProgressSessionRecord>;

function getBucket(): Bucket {
  const scope = globalThis as typeof globalThis & {
    __atlasUserProgressSessions?: Bucket;
  };
  if (!scope.__atlasUserProgressSessions) {
    scope.__atlasUserProgressSessions = new Map();
  }
  return scope.__atlasUserProgressSessions;
}

function key(userId: string, sessionId: string): string {
  return `${userId}:${sessionId}`;
}

export function startUserProgressSession(input: {
  userId: string;
  sessionId: string;
  kind: UserProgressKind;
}): UserProgressSessionRecord {
  const record: UserProgressSessionRecord = {
    sessionId: input.sessionId,
    userId: input.userId,
    kind: input.kind,
    phase: "orchestrating",
    orchestrationStep: "ceo",
    orchestrationStepIndex: 0,
    fileGenerating: false,
    failed: false,
    completed: false,
    updatedAt: new Date().toISOString(),
  };
  getBucket().set(key(input.userId, input.sessionId), record);
  return record;
}

export function getUserProgressSession(
  userId: string,
  sessionId: string,
): UserProgressSessionRecord | null {
  return getBucket().get(key(userId, sessionId)) ?? null;
}

export function reportUserProgressOrchestrationStep(input: {
  userId: string;
  sessionId: string;
  step: OrchestrationStep;
  stepIndex: number;
}): UserProgressSessionRecord | null {
  const existing = getUserProgressSession(input.userId, input.sessionId);
  if (!existing || existing.completed || existing.failed) return existing;

  const nextIndex = Math.max(existing.orchestrationStepIndex, input.stepIndex);
  const updated: UserProgressSessionRecord = {
    ...existing,
    orchestrationStep: input.step,
    orchestrationStepIndex: nextIndex,
    phase: "orchestrating",
    updatedAt: new Date().toISOString(),
  };
  getBucket().set(key(input.userId, input.sessionId), updated);
  return updated;
}

export function markUserProgressFileGenerating(input: {
  userId: string;
  sessionId: string;
  fileGenerating: boolean;
}): UserProgressSessionRecord | null {
  const existing = getUserProgressSession(input.userId, input.sessionId);
  if (!existing || existing.completed || existing.failed) return existing;
  const updated: UserProgressSessionRecord = {
    ...existing,
    fileGenerating: input.fileGenerating,
    phase: input.fileGenerating ? "file_generating" : existing.phase,
    // When orch finished and files start, ensure polish index at least reached.
    orchestrationStepIndex: Math.max(existing.orchestrationStepIndex, 2),
    updatedAt: new Date().toISOString(),
  };
  getBucket().set(key(input.userId, input.sessionId), updated);
  return updated;
}

export function completeUserProgressSession(input: {
  userId: string;
  sessionId: string;
  failed?: boolean;
}): UserProgressSessionRecord | null {
  const existing = getUserProgressSession(input.userId, input.sessionId);
  if (!existing) return null;
  const updated: UserProgressSessionRecord = {
    ...existing,
    completed: !input.failed,
    failed: Boolean(input.failed),
    fileGenerating: false,
    phase: input.failed ? "failed" : "completed",
    orchestrationStepIndex: input.failed
      ? existing.orchestrationStepIndex
      : Math.max(existing.orchestrationStepIndex, 4),
    updatedAt: new Date().toISOString(),
  };
  getBucket().set(key(input.userId, input.sessionId), updated);
  return updated;
}

/** Called from orchestrator trackStep via metadata progressSessionId. */
export function reportProgressFromMetadata(
  metadata: Readonly<Record<string, unknown>> | null | undefined,
  step: OrchestrationStep,
  stepIndex: number,
): void {
  if (!metadata) return;
  const sessionId =
    typeof metadata.progressSessionId === "string"
      ? metadata.progressSessionId.trim()
      : "";
  const userId =
    typeof metadata.progressUserId === "string"
      ? metadata.progressUserId.trim()
      : "";
  if (!sessionId || !userId) return;
  reportUserProgressOrchestrationStep({ userId, sessionId, step, stepIndex });
}

export function resetUserProgressStoreForTests(): void {
  getBucket().clear();
}
