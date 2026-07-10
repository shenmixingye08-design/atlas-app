import "server-only";

import type { WorkflowRun } from "@/lib/memory/types/workflow-run";

import { isAutomationDue } from "./schedule";
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

  getById(id: string): Promise<Automation | null> {
    return this.automations.findById(id);
  }

  create(input: CreateAutomationInput): Promise<Automation> {
    return this.automations.create(input);
  }

  update(id: string, patch: UpdateAutomationInput): Promise<Automation | null> {
    return this.automations.update(id, patch);
  }

  setEnabled(id: string, enabled: boolean): Promise<Automation | null> {
    return this.automations.update(id, { enabled });
  }

  async runNow(
    id: string,
    options: { userId?: string | null; requestOrigin?: string } = {},
  ): Promise<AutomationRunResult | null> {
    const automation = await this.automations.findById(id);
    if (!automation) return null;

    return executeAutomationRun(automation, {
      triggerType: "manual",
      userId: options.userId,
      requestOrigin: options.requestOrigin,
    });
  }

  async processDueAutomations(
    options: { requestOrigin?: string } = {},
  ): Promise<AutomationRunResult[]> {
    const enabled = await this.automations.list({ enabled: true });
    const due = enabled.filter((automation) => isAutomationDue(automation));

    const results: AutomationRunResult[] = [];

    for (const automation of due) {
      if (automation.status === "running") continue;

      const result = await executeAutomationRun(automation, {
        triggerType: "automation",
        requestOrigin: options.requestOrigin,
      });
      results.push(result);
    }

    return results;
  }

  async listWorkflowRuns(automationId: string): Promise<WorkflowRun[]> {
    const page = await serverWorkflowRunRepository.list({ automationId });
    return page.items;
  }
}

export const automationService = new AutomationService();

export function createAutomationService(
  options: AutomationServiceOptions = {},
): AutomationService {
  return new AutomationService(options.automations);
}
