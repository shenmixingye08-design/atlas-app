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
): Promise<number> {
  const existing = await serverAutomationRepository.list();
  const byId = new Map(existing.map((item) => [item.id, item]));
  let merged = 0;

  for (const preset of template.automationPresets) {
    if (byId.has(preset.id)) continue;

    byId.set(preset.id, {
      ...createAutomationFromInput(preset),
      id: preset.id,
    });
    merged += 1;
  }

  if (merged > 0) {
    await serverAutomationRepository.saveAll([...byId.values()]);
  }

  return merged;
}

/**
 * Activate a company template on the server.
 * Switching templates does NOT delete projects, workflow runs, or existing automations.
 */
export async function applyCompanyTemplate(
  templateId: CompanyTemplateId,
): Promise<ApplyTemplateResult> {
  const template = getCompanyTemplate(templateId);
  const state: ActiveCompanyState = {
    templateId,
    selectedAt: new Date().toISOString(),
  };

  setServerActiveCompanyState(state);
  setClientActiveCompanyState(state);

  const automationsMerged = await mergeAutomationPresets(template);

  return { template, state, automationsMerged };
}
