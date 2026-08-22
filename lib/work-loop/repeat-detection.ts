/**
 * VALUE 10 — propose Automation only after repeated successful work.
 * Prefer false-negative over inventing a new job.
 */

import {
  classifyWorkKind,
  isAutomatableKind,
  workFingerprint,
  type WorkKind,
} from "./kinds";

export const MIN_REPEAT_FOR_PROPOSAL = 3;

export type SuccessfulJob = {
  id: string;
  userId: string;
  title: string;
  assignment: string;
  completedAt: string;
  status: "completed" | "failed";
  deliverableFormat?: string | null;
  services?: readonly string[];
};

export type WorkProposal = {
  id: string;
  userId: string;
  fingerprint: string;
  kind: WorkKind;
  title: string;
  assignment: string;
  repeatCount: number;
  message: string;
  cadence: "daily" | "weekly" | "monthly";
};

function inferCadence(completedAt: readonly string[]): WorkProposal["cadence"] {
  if (completedAt.length < 2) return "weekly";
  const times = completedAt
    .map((value) => new Date(value).getTime())
    .filter((value) => Number.isFinite(value))
    .sort((a, b) => a - b);
  if (times.length < 2) return "weekly";
  const gaps: number[] = [];
  for (let i = 1; i < times.length; i += 1) {
    gaps.push(times[i]! - times[i - 1]!);
  }
  const avg = gaps.reduce((sum, gap) => sum + gap, 0) / gaps.length;
  const day = 24 * 60 * 60 * 1000;
  if (avg <= 1.6 * day) return "daily";
  if (avg >= 20 * day) return "monthly";
  return "weekly";
}

export function detectRepeatedWork(input: {
  userId: string;
  jobs: readonly SuccessfulJob[];
  existingFingerprints?: readonly string[];
  dismissedKeys?: readonly string[];
}): WorkProposal[] {
  const dismissed = new Set(input.dismissedKeys ?? []);
  const existing = new Set(input.existingFingerprints ?? []);
  const groups = new Map<
    string,
    { jobs: SuccessfulJob[]; kind: WorkKind }
  >();

  for (const job of input.jobs) {
    if (job.userId !== input.userId) continue;
    if (job.status !== "completed") continue;
    const kind = classifyWorkKind({
      assignment: job.assignment,
      title: job.title,
      deliverableType: job.deliverableFormat,
      services: job.services,
    });
    if (!isAutomatableKind(kind)) continue;
    const fingerprint = workFingerprint({
      kind,
      assignment: job.assignment,
      deliverableFormat: job.deliverableFormat,
    });
    const group = groups.get(fingerprint) ?? { jobs: [], kind };
    group.jobs.push(job);
    groups.set(fingerprint, group);
  }

  const proposals: WorkProposal[] = [];
  for (const [fingerprint, group] of groups) {
    if (group.jobs.length < MIN_REPEAT_FOR_PROPOSAL) continue;
    if (existing.has(fingerprint)) continue;
    if (dismissed.has(fingerprint)) continue;
    const latest = group.jobs
      .slice()
      .sort((a, b) => b.completedAt.localeCompare(a.completedAt))[0]!;
    const cadence = inferCadence(group.jobs.map((job) => job.completedAt));
    const cadenceLabel =
      cadence === "daily" ? "毎日" : cadence === "monthly" ? "毎月" : "毎週";
    proposals.push({
      id: `proposal_${fingerprint}`,
      userId: input.userId,
      fingerprint,
      kind: group.kind,
      title: latest.title,
      assignment: latest.assignment,
      repeatCount: group.jobs.length,
      message: `この仕事を${group.jobs.length}回繰り返しています。次回から${cadenceLabel}、自動で実行しますか？`,
      cadence,
    });
  }

  return proposals;
}

export function shouldProposeAutomation(repeatCount: number): boolean {
  return repeatCount >= MIN_REPEAT_FOR_PROPOSAL;
}
