import type { CompanyTemplateId } from "@/lib/company-templates/types";
import type { IntegrationProviderId } from "@/lib/integrations/types";

/** ISO 8601 timestamp. */
export type Timestamp = string;

/** Marketplace browse / filter sections. */
export type MarketplaceSectionId =
  | "featured"
  | "new"
  | "popular"
  | "productivity"
  | "marketing"
  | "sales"
  | "development";

/** Metadata-only listing for a workflow package (payload lives in CompanyTemplate). */
export type WorkflowPackageMetadata = {
  templateId: CompanyTemplateId;
  slug: string;
  version: string;
  author: string;
  publisher: "atlas" | "community";
  tagline: string;
  sections: readonly MarketplaceSectionId[];
  recommendedIntegrations: readonly IntegrationProviderId[];
  /** Reserved for future community marketplace submissions. */
  communityReady: boolean;
};

/** Persisted install record — references existing CompanyTemplate by id. */
export type InstalledWorkflowPackage = {
  templateId: CompanyTemplateId;
  installedAt: Timestamp;
  updatedAt: Timestamp;
  installedVersion: string;
};

/** Rich preview payload derived from CompanyTemplate (read-only reference). */
export type WorkflowPackagePreview = {
  workflows: readonly {
    id: string;
    name: string;
    description: string;
    sampleAssignment: string;
  }[];
  automations: readonly {
    id: string;
    name: string;
    description: string;
  }[];
  deliverableRules: readonly {
    id: string;
    keywords: readonly string[];
    formats: readonly string[];
  }[];
  qualityEmphasis: Partial<Record<string, "high" | "medium" | "low">>;
  memoryPreferences: {
    retainResearchReports: boolean;
    retainQualityReviews: boolean;
    conversationHistoryDays: number;
    preferredLanguage: string;
    tags: readonly string[];
  };
  researchGuidance: string;
};

/** Resolved package for UI — template loaded from company-templates registry. */
export type WorkflowPackageView = WorkflowPackageMetadata & {
  name: string;
  description: string;
  icon: string;
  brandColor: string;
  preview: WorkflowPackagePreview;
  isInstalled: boolean;
  isActive: boolean;
  installedAt: Timestamp | null;
  updatedAt: Timestamp | null;
  installedVersion: string | null;
  hasUpdate: boolean;
  contents: WorkflowPackageContents;
};

/** Summary of what a package includes (derived from CompanyTemplate, not duplicated). */
export type WorkflowPackageContents = {
  departments: readonly string[];
  automationPresets: number;
  defaultWorkflows: number;
  deliverableFormats: readonly string[];
  qualityPassThreshold: number;
  memoryTags: readonly string[];
  integrations: readonly IntegrationProviderId[];
};

export type WorkflowMarketplaceCatalog = {
  packages: WorkflowPackageView[];
  installed: InstalledWorkflowPackage[];
  activeTemplateId: CompanyTemplateId;
  sections: Record<MarketplaceSectionId, readonly CompanyTemplateId[]>;
};

export type InstallPackageResult = {
  package: WorkflowPackageView;
  automationsMerged: number;
  activated: boolean;
};

export type UpdatePackageResult = InstallPackageResult;

export type RemovePackageResult = {
  removed: CompanyTemplateId;
  activeTemplateId: CompanyTemplateId;
};

export const MARKETPLACE_SECTION_LABELS: Record<MarketplaceSectionId, string> = {
  featured: "注目",
  new: "新着",
  popular: "人気",
  productivity: "生産性",
  marketing: "マーケティング",
  sales: "営業",
  development: "開発",
};
