import "server-only";

import { createAutomationFromInput } from "@/lib/automations/domain";
import { serverAutomationRepository } from "@/lib/automations/repositories/server-automation-repository";

import { getCompanyTemplate } from "./registry";
import {
  setClientActiveCompanyState,
  setServerActiveCompanyState,
} from "./store";
import type {
  ActiveCompanyState,
  CompanyTemplate,
  CompanyTemplateId,
} from "./types";

export type ApplyTemplateResult = {
  template: CompanyTemplate;
  state: ActiveCompanyState;
  automationsMerged: number;
};

async function mergeAutomationPresets(
  template: CompanyTemplate,
  userId: string
): Promise<number> {
  const existing = await serverAutomationRepository.list({ userId });
  const byId = new Map(existing.map((item) => [item.id, item]));
  let merged = 0;

  for (const preset of template.automationPresets) {
    // Scope preset id per user to avoid cross-tenant id collisions.
    const scopedId = `${userId}::${preset.id}`;
    if (byId.has(scopedId) || byId.has(preset.id)) continue;

    byId.set(scopedId, {
      ...createAutomationFromInput({ ...preset, userId }),
      id: scopedId,
      userId,
    });
    merged += 1;
  }

  if (merged > 0) {
    // Tenant-scoped replace — never list/saveAll the global automation pool.
    await serverAutomationRepository.replaceUserAutomations(
      userId,
      [...byId.values()].filter((a) => a.userId === userId)
    );
  }

  return merged;
}

/**
 * Activate a company template for a specific user.
 * Switching templates does NOT delete projects, workflow runs, or existing automations.
 */
export async function applyCompanyTemplate(
  templateId: CompanyTemplateId,
  userId: string
): Promise<ApplyTemplateResult> {
  if (!userId) {
    throw new Error("company_template_userId_required");
  }
  const template = getCompanyTemplate(templateId);
  const state: ActiveCompanyState = {
    templateId,
    selectedAt: new Date().toISOString(),
  };

  setServerActiveCompanyState(state, userId);
  setClientActiveCompanyState(state);

  const automationsMerged = await mergeAutomationPresets(template, userId);

  return { template, state, automationsMerged };
}
