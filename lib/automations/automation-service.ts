import "server-only";

import type {
  WorkflowRun,
  WorkflowRunTriggerType,
} from "@/lib/memory/types/workflow-run";
import { setAutomationTaskCount } from "@/lib/billing/usage/store";
import { claimAutomationJob } from "@/lib/jobs/job-store";
import { buildAutomationIdempotencyKey } from "@/lib/jobs/idempotency";

import type {
  Automation,
  AutomationFilter,
  AutomationRunResult,
  CreateAutomationInput,
  UpdateAutomationInput,
} from "./types";
import { executeAutomationRun } from "./run-automation";
import type { AutomationRepository } from "./repositories/types";
import { serverAutomationRepository } from "./repositories/server-automation-repository";
import { serverWorkflowRunRepository } from "./repositories/workflow-run-store";
import {
  ensureAutomationsHydrated,
  persistAutomationsNow,
} from "./durable";
import {
  registerAutomationUserId,
} from "./global-durable";

export type AutomationServiceOptions = {
  automations?: AutomationRepository;
};

/**
 * Application service for recurring AI work.
 * Triggers the existing orchestration pipeline — no duplicated AI logic.
 */
export class AutomationService {
  constructor(
    private readonly automations: AutomationRepository = serverAutomationRepository,
  ) {}

  list(filter?: AutomationFilter): Promise<Automation[]> {
    return this.automations.list(filter);
  }

  async listForUser(userId: string): Promise<Automation[]> {
    await ensureAutomationsHydrated(userId);
    return this.automations.list({ userId });
  }

  getById(id: string): Promise<Automation | null> {
    return this.automations.findById(id);
  }

  async getByIdForUser(
    id: string,
    userId: string,
  ): Promise<Automation | null> {
    await ensureAutomationsHydrated(userId);
    const automation = await this.automations.findById(id);
    if (!automation || automation.userId !== userId) return null;
    return automation;
  }

  async createForUser(
    userId: string,
    input: CreateAutomationInput,
  ): Promise<Automation> {
    await ensureAutomationsHydrated(userId);
    const automation = await this.automations.create({
      ...input,
      userId,
    });
    await registerAutomationUserId(userId);
    await this.syncTaskCount(userId);
    await persistAutomationsNow(userId);
    return automation;
  }

  create(input: CreateAutomationInput): Promise<Automation> {
    return this.automations.create(input);
  }

  async updateForUser(
    id: string,
    userId: string,
    patch: UpdateAutomationInput,
  ): Promise<Automation | null> {
    await ensureAutomationsHydrated(userId);
    const existing = await this.automations.findById(id);
    if (!existing || existing.userId !== userId) return null;
    const updated = await this.automations.update(id, patch);
    if (updated) {
      await this.syncTaskCount(userId);
      await persistAutomationsNow(userId);
    }
    return updated;
  }

  update(id: string, patch: UpdateAutomationInput): Promise<Automation | null> {
    return this.automations.update(id, patch);
  }

  async setEnabledForUser(
    id: string,
    userId: string,
    enabled: boolean,
  ): Promise<Automation | null> {
    return this.updateForUser(id, userId, { enabled });
  }

  setEnabled(id: string, enabled: boolean): Promise<Automation | null> {
    return this.automations.update(id, { enabled });
  }

  async runNow(
    id: string,
    options: {
      userId?: string | null;
      requestOrigin?: string;
      triggerType?: WorkflowRunTriggerType;
      scheduledAt?: string | null;
      skipIdempotencyClaim?: boolean;
      existingJobId?: string;
    } = {},
  ): Promise<AutomationRunResult | null> {
    if (options.userId) {
      await ensureAutomationsHydrated(options.userId);
    }
    const automation = await this.automations.findById(id);
    if (!automation) return null;
    if (options.userId && automation.userId !== options.userId) return null;

    const userId = options.userId ?? automation.userId;
    const triggerType = options.triggerType ?? "manual";
    const scheduledAt = options.scheduledAt ?? automation.nextRun;
    let jobId = options.existingJobId;

    if (userId && !options.skipIdempotencyClaim) {
      const idempotencyKey = buildAutomationIdempotencyKey({
        userId,
        automationId: automation.id,
        triggerType,
        scheduledAt,
      });
      let claim = await claimAutomationJob({
        id: crypto.randomUUID(),
        userId,
        automationId: automation.id,
        idempotencyKey,
        scheduledAt,
      });

      // Manual double-submit protection should only block in-flight runs.
      // After a terminal result, the user may intentionally run again.
      if (
        claim.action === "skip" &&
        triggerType === "manual" &&
        (claim.record.status === "completed" ||
          claim.record.status === "partially_completed" ||
          claim.record.status === "failed" ||
          claim.record.status === "cancelled")
      ) {
        claim = await claimAutomationJob({
          id: crypto.randomUUID(),
          userId,
          automationId: automation.id,
          idempotencyKey: `${idempotencyKey}:rerun:${crypto.randomUUID()}`,
          scheduledAt,
        });
      }

      if (claim.action === "skip") {
        const skippedCompleted =
          claim.record.status === "completed" ||
          claim.record.status === "partially_completed";
        return {
          automationId: automation.id,
          workflowRunId: claim.record.id,
          status: skippedCompleted ? "completed" : "failed",
          orchestrationStatus: claim.record.status,
          approved: true,
          totalDurationMs: 0,
          finalResponsePreview: claim.record.resultSummary,
          error: claim.record.lastErrorMessage,
          deliverableCount: 0,
          dedupeSkipped: true,
        };
      }

      jobId = claim.record.id;
    }

    const result = await executeAutomationRun(automation, {
      triggerType,
      userId,
      requestOrigin: options.requestOrigin,
      jobId,
      scheduledAt,
    });

    if (userId) await persistAutomationsNow(userId);
    return result;
  }

  /**
   * Due processor — enqueues durable work-queue jobs and drains the worker.
   * Does not synchronously execute the full pipeline inside the cron request
   * beyond a bounded worker batch of leased steps/jobs.
   */
  async processDueAutomations(
    options: { requestOrigin?: string } = {},
  ): Promise<AutomationRunResult[]> {
    const { processWorkQueueTick } = await import("@/lib/work-queue/tick");
    const tick = await processWorkQueueTick({
      requestOrigin: options.requestOrigin,
    });

    const results: AutomationRunResult[] = [];
    for (const job of tick.worker.completedJobs) {
      if (!job.automationId) continue;
      results.push({
        automationId: job.automationId,
        workflowRunId: job.runId,
        status: "completed",
        orchestrationStatus: "completed",
        approved: true,
        totalDurationMs: 0,
        finalResponsePreview: "work-queue completed",
        error: null,
        deliverableCount: 1,
      });
      const automation = await this.automations.findById(job.automationId);
      if (automation?.userId) await persistAutomationsNow(automation.userId);
    }
    for (const job of tick.worker.failedJobs) {
      if (!job.automationId) continue;
      results.push({
        automationId: job.automationId,
        workflowRunId: job.runId,
        status: "failed",
        orchestrationStatus: "failed",
        approved: false,
        totalDurationMs: 0,
        finalResponsePreview: null,
        error: job.errorCode,
        deliverableCount: 0,
        errorCode: job.errorCode,
      });
    }
    return results;
  }

  async listWorkflowRuns(automationId: string): Promise<WorkflowRun[]> {
    const page = await serverWorkflowRunRepository.list({ automationId });
    return page.items;
  }

  private async syncTaskCount(userId: string): Promise<void> {
    const enabled = await this.automations.list({ userId, enabled: true });
    setAutomationTaskCount(userId, enabled.length);
  }
}

export const automationService = new AutomationService();

export function createAutomationService(
  options: AutomationServiceOptions = {},
): AutomationService {
  return new AutomationService(options.automations);
}
