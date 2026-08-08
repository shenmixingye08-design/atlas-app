import "server-only";

import { createAutomationFromInput } from "@/lib/automations/domain";
import { serverAutomationRepository } from "@/lib/automations/repositories/server-automation-repository";
import { registerAutomationUserId } from "@/lib/automations/global-durable";
import { persistAutomationsNow } from "@/lib/automations/durable";

import { getCompanyTemplate } from "./registry";
import {
  setClientActiveCompanyState,
  setServerActiveCompanyStateForUser,
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

function scopedPresetId(userId: string, presetId: string): string {
  return `co_${userId}_${presetId}`;
}

async function mergeAutomationPresetsForUser(
  userId: string,
  template: CompanyTemplate,
): Promise<number> {
  const existing = await serverAutomationRepository.list({ userId });
  const byId = new Map(existing.map((item) => [item.id, item]));
  let merged = 0;

  for (const preset of template.automationPresets) {
    const id = scopedPresetId(userId, preset.id);
    if (byId.has(id)) continue;

    byId.set(id, {
      ...createAutomationFromInput(preset),
      id,
      userId,
    });
    merged += 1;
  }

  if (merged > 0) {
    // User-scoped replace — never clear other tenants via saveAll.
    await serverAutomationRepository.replaceUserAutomations(userId, [
      ...byId.values(),
    ]);
    await registerAutomationUserId(userId);
    await persistAutomationsNow(userId);
  }

  return merged;
}

/**
 * Activate a company template for one authenticated user (P0-03).
 */
export async function applyCompanyTemplateForUser(
  userId: string,
  templateId: CompanyTemplateId,
): Promise<ApplyTemplateResult> {
  if (!userId.trim()) {
    throw new Error("userId is required");
  }

  const template = getCompanyTemplate(templateId);
  const state: ActiveCompanyState = {
    templateId,
    selectedAt: new Date().toISOString(),
  };

  setServerActiveCompanyStateForUser(userId, state);
  setClientActiveCompanyState(state);

  const automationsMerged = await mergeAutomationPresetsForUser(
    userId,
    template,
  );

  return { template, state, automationsMerged };
}

/**
 * @deprecated Use applyCompanyTemplateForUser — global apply is forbidden.
 */
export async function applyCompanyTemplate(
  templateId: CompanyTemplateId,
): Promise<ApplyTemplateResult> {
  void templateId;
  throw new Error(
    "applyCompanyTemplate requires a userId — use applyCompanyTemplateForUser",
  );
}
