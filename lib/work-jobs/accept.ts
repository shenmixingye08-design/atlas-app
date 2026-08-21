/**
 * Accept a secretary work request with DB-level create idempotency.
 * Only the claim winner starts AI execution.
 */

import "server-only";

import { randomUUID } from "node:crypto";

import { MAX_IMMEDIATE_RETRIES } from "@/lib/reliability";

import {
  claimWorkJob,
  WorkJobClaimUnavailableError,
} from "./claim";
import {
  buildWorkJobIdempotencyKey,
  hydrateWorkJobMemory,
  saveWorkJob,
  type WorkJobRecord,
} from "./store";
import { withPropagatedJobId } from "./job-id";

export type AcceptWorkJobSuccess = {
  ok: true;
  jobId: string;
  status: WorkJobRecord["status"];
  reused: boolean;
  idempotencyKey: string;
};

export type AcceptWorkJobFailure = {
  ok: false;
  httpStatus: 429 | 503;
  error: string;
  response?: Response;
};

async function quotaFailureFromResponse(
  denied: Response,
): Promise<AcceptWorkJobFailure> {
  const body = (await denied.clone().json().catch(() => ({}))) as {
    message?: string;
    error?: string;
  };
  return {
    ok: false,
    httpStatus: (denied.status === 429 ? 429 : 503) as 429 | 503,
    error:
      body.message ??
      (typeof body.error === "string" ? body.error : null) ??
      "今月のAI作業上限に達しました。",
    response: denied,
  };
}

export async function acceptWorkJob(input: {
  userId: string;
  assignment: string;
  clientKey?: string | null;
  metadata?: Readonly<Record<string, unknown>>;
  nowMs?: number;
  /** Called only when this instance won the atomic create. */
  startExecution?: (jobId: string, userId: string) => void;
}): Promise<AcceptWorkJobSuccess | AcceptWorkJobFailure> {
  const userId = input.userId.trim();
  const assignment = input.assignment.trim();
  if (!userId || !assignment) {
    return {
      ok: false,
      httpStatus: 503,
      error: "依頼を受け付けできませんでした。",
    };
  }

  const idempotencyKey = buildWorkJobIdempotencyKey({
    userId,
    assignment,
    clientKey: input.clientKey,
    nowMs: input.nowMs,
  });

  const { requireBillingAiUsage, requireAndConsumeAiJob } = await import(
    "@/lib/billing/access"
  );
  const precheckDenied = await requireBillingAiUsage(userId);
  if (precheckDenied) {
    return quotaFailureFromResponse(precheckDenied);
  }

  const id = randomUUID();
  const now = new Date().toISOString();
  const draft: WorkJobRecord = {
    id,
    userId,
    assignment,
    idempotencyKey,
    metadata: withPropagatedJobId(input.metadata ?? {}, id),
    status: "queued",
    attemptCount: 0,
    maxAttempts: MAX_IMMEDIATE_RETRIES,
    error: null,
    visionGate: null,
    result: null,
    createdAt: now,
    updatedAt: now,
    completedAt: null,
  };

  // Claim identity first. Usage is reserved only after a durable job exists
  // so a Supabase/claim outage cannot increment AI Usage with no job.
  let claim;
  try {
    claim = await claimWorkJob(draft);
  } catch (error) {
    if (error instanceof WorkJobClaimUnavailableError) {
      return {
        ok: false,
        httpStatus: 503,
        error:
          "依頼の保存に失敗しました。しばらくしてからもう一度お試しください。",
      };
    }
    throw error;
  }

  const job = claim.job;
  if (job.userId !== userId) {
    return {
      ok: false,
      httpStatus: 503,
      error: "依頼の保存に失敗しました。しばらくしてからもう一度お試しください。",
    };
  }

  const quotaDenied = await requireAndConsumeAiJob(
    userId,
    "work_job",
    idempotencyKey,
  );
  if (quotaDenied) {
    // Do not persist or start a runnable queued job when Usage refuses.
    return quotaFailureFromResponse(quotaDenied);
  }

  hydrateWorkJobMemory(job);

  if (claim.action === "created") {
    try {
      await saveWorkJob({
        ...job,
        metadata: withPropagatedJobId(
          {
            ...(input.metadata ?? {}),
            ...(job.metadata ?? {}),
          },
          job.id,
        ),
      });
    } catch {
      return {
        ok: false,
        httpStatus: 503,
        error:
          "依頼の保存に失敗しました。しばらくしてからもう一度お試しください。",
      };
    }
    input.startExecution?.(job.id, userId);
  }

  return {
    ok: true,
    jobId: job.id,
    status: job.status,
    reused: claim.action === "reused",
    idempotencyKey,
  };
}
