import { createHash } from "crypto";

import type {
  CorrectionSignalKind,
  WorkflowLearningPatch,
} from "@/lib/workflow-learning/types";

export function fingerprintSignal(input: {
  automationId: string;
  kind: CorrectionSignalKind;
  text: string;
}): string {
  const normalized = input.text.trim().toLowerCase().replace(/\s+/g, " ");
  const raw = `${input.automationId}|${input.kind}|${normalized}`;
  return createHash("sha256").update(raw).digest("hex").slice(0, 24);
}

export function fingerprintCandidate(input: {
  automationId: string;
  type: string;
  patch: WorkflowLearningPatch;
}): string {
  const raw = `${input.automationId}|${input.type}|${JSON.stringify(input.patch)}`;
  return createHash("sha256").update(raw).digest("hex").slice(0, 24);
}

export function newId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}
