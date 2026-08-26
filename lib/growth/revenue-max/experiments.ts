import { createHash } from "node:crypto";

import type { ExperimentStatus } from "./types";

export const EXPERIMENT_MIN_SAMPLES = 100;
export const EXPERIMENT_MIN_DAYS = 14;

export function assignVariant(userId: string, experimentId: string): string {
  const digest = createHash("sha256")
    .update(`${userId}:${experimentId}`)
    .digest("hex");
  return Number.parseInt(digest.slice(0, 8), 16) % 2 === 0 ? "a" : "b";
}

export function stickyVariant(
  existing: string | undefined,
  userId: string,
  experimentId: string,
): string {
  if (existing === "a" || existing === "b") return existing;
  return assignVariant(userId, experimentId);
}

export function resolveExperimentStatus(input: {
  sampleSize: number;
  startedAt: string;
  endedAt?: string | null;
  adopted?: boolean;
  rejected?: boolean;
  stopped?: boolean;
  now?: Date;
  firstSuccessRateA?: number | null;
  firstSuccessRateB?: number | null;
  paidRateA?: number | null;
  paidRateB?: number | null;
}): ExperimentStatus {
  if (input.adopted) return "adopted";
  if (input.rejected) return "rejected";
  if (input.stopped) return "stopped";
  const now = input.now ?? new Date();
  const started = Date.parse(input.startedAt);
  const days = Number.isNaN(started)
    ? 0
    : (now.getTime() - started) / (24 * 60 * 60 * 1000);
  if (input.sampleSize < EXPERIMENT_MIN_SAMPLES || days < EXPERIMENT_MIN_DAYS) {
    return "insufficient_data";
  }
  const guardrailBroken =
    (input.firstSuccessRateA != null &&
      input.firstSuccessRateB != null &&
      input.firstSuccessRateB < input.firstSuccessRateA) ||
    false;
  if (guardrailBroken) return "rejected";
  if (input.paidRateA != null && input.paidRateB != null && input.paidRateB > input.paidRateA) {
    return "candidate_winner";
  }
  return "running";
}
