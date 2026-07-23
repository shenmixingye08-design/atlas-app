import "server-only";

import { evaluateBillingAiUsage } from "@/lib/billing/access/snapshot";
import { isAutomationSuspendedForUser } from "@/lib/billing/subscriptions/lifecycle";
import { setAutomationTaskCount } from "@/lib/billing/usage/store";
import type { WorkflowRun } from "@/lib/memory/types/workflow-run";

import {
  ensureAutomationsHydrated,
  persistAutomationsNow,
} from "./durable";
import {
  claimAutomationTickSlot,
  listAutomationOwnerUserIds,
  registerAutomationUserId,
} from "./global-durable";
import { executeAutomationRun } from "./run-automation";
import { isAutomationDue, computeNextRunAfterSuccessIso } from "./schedule";
import type {
  Automation,
  AutomationFilter,
  AutomationRunResult,
  CreateAutomationInput,
  UpdateAutomationInput,
} from "./types";
import type { AutomationRepository } from "./repositories/types";
import { serverAutomationRepository } from "./repositories/server-automation-repository";
import { serverWorkflowRunRepository } from "./repositories/workflow-run-store";

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
    options: { userId?: string | null; requestOrigin?: string } = {},
  ): Promise<AutomationRunResult | null> {
    if (options.userId) {
      await ensureAutomationsHydrated(options.userId);
    }
    const automation = await this.automations.findById(id);
    if (!automation) return null;
    if (options.userId && automation.userId !== options.userId) return null;

    const result = await executeAutomationRun(automation, {
      triggerType: "manual",
      userId: options.userId ?? automation.userId,
      requestOrigin: options.requestOrigin,
      attempt: 1,
    });

    const ownerId = options.userId ?? automation.userId;
    if (ownerId) await persistAutomationsNow(ownerId);
    return result;
  }

  /**
   * Vercel Cron due processor — hydrates each owner, claims tick slots,
   * runs due schedules + deferred retries, and awaits durable persist.
   */
  async processDueAutomations(
    options: { requestOrigin?: string } = {},
  ): Promise<AutomationRunResult[]> {
    const ownerIds = await listAutomationOwnerUserIds();
    const results: AutomationRunResult[] = [];

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
        const isRetry =
          automation.status === "retrying" &&
          Boolean(automation.nextRetryAt) &&
          new Date(automation.nextRetryAt!).getTime() <= Date.now();

        if (automation.status === "running") continue;

        const slotKey = isRetry
          ? `retry:${automation.id}:${automation.currentAttempt + 1}:${automation.nextRetryAt}`
          : automation.nextRun;

        if (!slotKey) continue;

        const claimed = await claimAutomationTickSlot(
          userId,
          automation.id,
          slotKey,
        );
        if (!claimed) continue;

        const { denial } = await evaluateBillingAiUsage(userId);
        if (denial) {
          await this.automations.update(automation.id, {
            lastError: denial.reason,
            status: "failed",
            nextRetryAt: null,
            activeSlotKey: null,
            nextRun: computeNextRunAfterSuccessIso(
              automation.schedule,
              new Date(),
            ),
          });
          await persistAutomationsNow(userId);
          continue;
        }

        const attempt = isRetry
          ? Math.max(1, (automation.currentAttempt ?? 1) + 1)
          : 1;

        // Do NOT advance nextRun before execute — claim + status prevent doubles.
        // nextRun advances only on terminal success/failure inside the runner.
        await this.automations.update(automation.id, {
          status: isRetry ? "retrying" : "running",
          currentAttempt: attempt,
          activeSlotKey: slotKey,
          nextRetryAt: null,
          lastError: null,
          lastResultSummary: isRetry
            ? `リトライ中（試行${attempt}）`
            : "AI秘書が現在仕事を進めています",
        });
        await persistAutomationsNow(userId);

        const result = await executeAutomationRun(
          {
            ...automation,
            status: isRetry ? "retrying" : "running",
            currentAttempt: attempt,
            activeSlotKey: slotKey,
            nextRetryAt: null,
          },
          {
            triggerType: "automation",
            userId,
            requestOrigin: options.requestOrigin,
            attempt,
            skipStartNotification: isRetry,
          },
        );
        results.push(result);
        await persistAutomationsNow(userId);
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
