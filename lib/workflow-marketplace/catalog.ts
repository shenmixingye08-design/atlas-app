import type { CompanyTemplate } from "@/lib/company-templates/types";

import type {
  InstalledWorkflowPackage,
  MarketplaceSectionId,
  WorkflowPackageContents,
  WorkflowPackageMetadata,
  WorkflowPackagePreview,
  WorkflowPackageView,
} from "./types";
import {
  getWorkflowPackageMetadata,
  listWorkflowPackageMetadata,
} from "./definitions/packages";

export function buildPackagePreview(
  template: CompanyTemplate,
): WorkflowPackagePreview {
  return {
    workflows: template.defaultWorkflows.map((workflow) => ({ ...workflow })),
    automations: template.automationPresets.map((preset) => ({
      id: preset.id,
      name: preset.name,
      description: preset.description,
    })),
    deliverableRules: template.deliverables.keywordRules.map((rule) => ({
      id: rule.id,
      keywords: [...rule.keywords],
      formats: rule.formats.map((format) => format.toUpperCase()),
    })),
    qualityEmphasis: { ...template.qualityCriteria.emphasis },
    memoryPreferences: { ...template.memoryPreferences },
    researchGuidance: template.researchBehavior.guidance,
  };
}

export function buildPackageContents(
  template: CompanyTemplate,
  metadata: WorkflowPackageMetadata,
): WorkflowPackageContents {
  return {
    departments: [...template.enabledDepartments],
    automationPresets: template.automationPresets.length,
    defaultWorkflows: template.defaultWorkflows.length,
    deliverableFormats: template.deliverables.defaultFormats.map((format) =>
      format.toUpperCase(),
    ),
    qualityPassThreshold: template.qualityCriteria.passThreshold,
    memoryTags: [...template.memoryPreferences.tags],
    integrations: [...metadata.recommendedIntegrations],
  };
}

export function buildPackageView(
  template: CompanyTemplate,
  options: {
    installed: InstalledWorkflowPackage | null;
    isActive: boolean;
  },
): WorkflowPackageView {
  const metadata = getWorkflowPackageMetadata(template.id);
  const isInstalled = options.installed !== null;
  const hasUpdate =
    isInstalled && options.installed!.installedVersion !== metadata.version;

  return {
    ...metadata,
    name: template.name,
    description: template.description,
    icon: template.icon,
    brandColor: template.brandColor,
    preview: buildPackagePreview(template),
    isInstalled,
    isActive: options.isActive,
    installedAt: options.installed?.installedAt ?? null,
    updatedAt: options.installed?.updatedAt ?? null,
    installedVersion: options.installed?.installedVersion ?? null,
    hasUpdate,
    contents: buildPackageContents(template, metadata),
  };
}

export function buildSectionIndex(
  packages: readonly WorkflowPackageView[],
): Record<MarketplaceSectionId, readonly WorkflowPackageMetadata["templateId"][]> {
  const sections: Record<
    MarketplaceSectionId,
    WorkflowPackageMetadata["templateId"][]
  > = {
    featured: [],
    new: [],
    popular: [],
    productivity: [],
    marketing: [],
    sales: [],
    development: [],
  };

  for (const pkg of packages) {
    for (const section of pkg.sections) {
      sections[section].push(pkg.templateId);
    }
  }

  return sections;
}

export function listAllPackageMetadata(): readonly WorkflowPackageMetadata[] {
  return listWorkflowPackageMetadata();
}
