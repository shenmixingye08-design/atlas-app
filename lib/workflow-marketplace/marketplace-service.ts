import "server-only";

import { applyCompanyTemplate } from "@/lib/company-templates/apply-template.server";
import { getCompanyTemplate, companyTemplates } from "@/lib/company-templates/registry";
import {
  getServerActiveCompanyState,
  setClientActiveCompanyState,
} from "@/lib/company-templates/store";
import type { CompanyTemplateId } from "@/lib/company-templates/types";
import { DEFAULT_COMPANY_TEMPLATE_ID } from "@/lib/company-templates/types";

import {
  buildPackageView,
  buildSectionIndex,
} from "./catalog";
import { getWorkflowPackageMetadata } from "./definitions/packages";
import {
  getServerInstalledPackage,
  getServerInstalledPackages,
  removeServerInstalledPackage,
  saveServerInstalledPackage,
  setClientInstalledPackages,
} from "./installed-store";
import type {
  InstallPackageResult,
  RemovePackageResult,
  UpdatePackageResult,
  WorkflowMarketplaceCatalog,
  WorkflowPackageView,
} from "./types";

function resolveInstalledMap(
  userId: string
): Map<CompanyTemplateId, ReturnType<typeof getServerInstalledPackage>> {
  return new Map(
    getServerInstalledPackages(userId).map((record) => [
      record.templateId,
      record,
    ])
  );
}

function buildCatalogViews(userId: string): WorkflowPackageView[] {
  const activeTemplateId = getServerActiveCompanyState(userId).templateId;
  const installedMap = resolveInstalledMap(userId);

  return companyTemplates.map((template) =>
    buildPackageView(template, {
      installed: installedMap.get(template.id) ?? null,
      isActive: template.id === activeTemplateId,
    })
  );
}

export class WorkflowMarketplaceService {
  getCatalog(userId: string): WorkflowMarketplaceCatalog {
    if (!userId) {
      throw new Error("marketplace_userId_required");
    }
    const packages = buildCatalogViews(userId);
    const activeTemplateId = getServerActiveCompanyState(userId).templateId;

    return {
      packages,
      installed: getServerInstalledPackages(userId),
      activeTemplateId,
      sections: buildSectionIndex(packages),
    };
  }

  getPackage(templateId: CompanyTemplateId, userId: string): WorkflowPackageView {
    if (!userId) {
      throw new Error("marketplace_userId_required");
    }
    const template = getCompanyTemplate(templateId);
    const installed = getServerInstalledPackage(templateId, userId);
    const activeTemplateId = getServerActiveCompanyState(userId).templateId;

    return buildPackageView(template, {
      installed,
      isActive: templateId === activeTemplateId,
    });
  }

  async installPackage(
    templateId: CompanyTemplateId,
    userId: string
  ): Promise<InstallPackageResult> {
    if (!userId) throw new Error("userId required");
    const metadata = getWorkflowPackageMetadata(templateId);
    const now = new Date().toISOString();

    const applyResult = await applyCompanyTemplate(templateId, userId);

    const record = saveServerInstalledPackage(
      {
        templateId,
        installedAt:
          getServerInstalledPackage(templateId, userId)?.installedAt ?? now,
        updatedAt: now,
        installedVersion: metadata.version,
      },
      userId
    );

    setClientInstalledPackages(getServerInstalledPackages(userId));
    setClientActiveCompanyState(applyResult.state);

    return {
      package: this.getPackage(templateId, userId),
      automationsMerged: applyResult.automationsMerged,
      activated: true,
    };
  }

  async updatePackage(
    templateId: CompanyTemplateId,
    userId: string
  ): Promise<UpdatePackageResult> {
    if (!userId) throw new Error("userId required");
    const installed = getServerInstalledPackage(templateId, userId);
    if (!installed) {
      throw new Error("Package is not installed. Install it before updating.");
    }

    return this.installPackage(templateId, userId);
  }

  async removePackage(
    templateId: CompanyTemplateId,
    userId: string
  ): Promise<RemovePackageResult> {
    if (!userId) throw new Error("userId required");
    const installed = getServerInstalledPackage(templateId, userId);
    if (!installed) {
      throw new Error("Package is not installed.");
    }

    removeServerInstalledPackage(templateId, userId);

    let activeTemplateId = getServerActiveCompanyState(userId).templateId;

    if (activeTemplateId === templateId) {
      const fallback =
        getServerInstalledPackages(userId)[0]?.templateId ??
        DEFAULT_COMPANY_TEMPLATE_ID;

      const applyResult = await applyCompanyTemplate(fallback, userId);
      activeTemplateId = applyResult.state.templateId;
      setClientActiveCompanyState(applyResult.state);
    }

    setClientInstalledPackages(getServerInstalledPackages(userId));

    return {
      removed: templateId,
      activeTemplateId,
    };
  }
}

export const workflowMarketplaceService = new WorkflowMarketplaceService();
