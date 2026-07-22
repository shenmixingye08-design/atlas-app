import "server-only";

import type { WorkflowRun } from "@/lib/memory/types/workflow-run";
import { evaluateBillingAiUsage } from "@/lib/billing/access/snapshot";
import { isAutomationSuspendedForUser } from "@/lib/billing/subscriptions/lifecycle";
import { setAutomationTaskCount } from "@/lib/billing/usage/store";

import { isAutomationDue, computeNextRunIso } from "./schedule";
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
  schedulePersistAutomations,
} from "./durable";
import {
  claimAutomationTickSlot,
  listAutomationOwnerUserIds,
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
    schedulePersistAutomations(userId);
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
      schedulePersistAutomations(userId);
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
      triggerType?: "manual" | "automation";
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

    if (userId && !options.skipIdempotencyClaim) {
      const { claimAutomationJob } = await import("@/lib/jobs/job-store");
      const { buildAutomationIdempotencyKey } = await import(
        "@/lib/jobs/idempotency"
      );
      const jobId = crypto.randomUUID();
      const idempotencyKey = buildAutomationIdempotencyKey({
        userId,
        automationId: automation.id,
        triggerType,
        scheduledAt: options.scheduledAt ?? automation.nextRun,
      });
      const claim = await claimAutomationJob({
        id: jobId,
        userId,
        automationId: automation.id,
        idempotencyKey,
        scheduledAt: options.scheduledAt ?? automation.nextRun,
      });
      if (claim.action === "skip") {
        return {
          automationId: automation.id,
          workflowRunId: claim.record.id,
          status:
            claim.record.status === "completed" ||
            claim.record.status === "partially_completed"
              ? "completed"
              : "failed",
          orchestrationStatus: claim.record.status,
          approved: true,
          totalDurationMs: 0,
          finalResponsePreview: claim.record.resultSummary,
          error: claim.record.lastErrorMessage,
          deliverableCount: 0,
          dedupeSkipped: true,
        };
      }
      options.existingJobId = claim.record.id;
    }

    const result = await executeAutomationRun(automation, {
      triggerType,
      userId,
      requestOrigin: options.requestOrigin,
      jobId: options.existingJobId,
      scheduledAt: options.scheduledAt ?? automation.nextRun,
    });

    const ownerId = userId;
    if (ownerId) schedulePersistAutomations(ownerId);
    return result;
  }

  /**
   * Vercel Cron due processor — hydrates each owner, claims tick slots,
   * enforces billing, and persists results.
   */
  async processDueAutomations(
    options: { requestOrigin?: string } = {},
  ): Promise<AutomationRunResult[]> {
    const ownerIds = await listAutomationOwnerUserIds();
    const results: AutomationRunResult[] = [];

    // Also include any in-memory owners (single-instance / tests without Supabase).
    const memoryOwners = new Set(
      (await this.automations.list())
        .map((row) => row.userId)
        .filter((id): id is string => typeof id === "string" && id.length > 0),
    );
    for (const id of ownerIds) memoryOwners.add(id);

    for (const userId of memoryOwners) {
      await ensureAutomationsHydrated(userId);

      if (isAutomationSuspendedForUser(userId)) {
        continue;
      }

      const enabled = await this.automations.list({
        enabled: true,
        userId,
      });
      const due = enabled.filter((automation) => isAutomationDue(automation));

      for (const automation of due) {
        if (automation.status === "running") continue;

        const claimed = await claimAutomationTickSlot(
          userId,
          automation.id,
          automation.nextRun,
        );
        if (!claimed) continue;

        const { denial } = await evaluateBillingAiUsage(userId);
        if (denial) {
          await this.automations.update(automation.id, {
            lastError: denial.reason,
            status: "failed",
            nextRun: computeNextRunIso(automation.schedule, new Date()),
          });
          schedulePersistAutomations(userId);
          continue;
        }

        // Advance nextRun before execute so a second instance skips isAutomationDue.
        const reservedNext = computeNextRunIso(automation.schedule, new Date());
        await this.automations.update(automation.id, {
          status: "running",
          nextRun: reservedNext,
          lastError: null,
        });
        schedulePersistAutomations(userId);

        const result = await this.runNow(automation.id, {
          userId,
          requestOrigin: options.requestOrigin,
          triggerType: "automation",
          scheduledAt: automation.nextRun,
        });
        if (!result) continue;
        if (result.dedupeSkipped) continue;
        results.push(result);
        schedulePersistAutomations(userId);
      }
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
