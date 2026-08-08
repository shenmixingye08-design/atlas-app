import "server-only";

import { applyCompanyTemplateForUser } from "@/lib/company-templates/apply-template.server";
import { getCompanyTemplate, companyTemplates } from "@/lib/company-templates/registry";
import {
  getServerActiveCompanyStateForUser,
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
  getServerInstalledPackageForUser,
  getServerInstalledPackagesForUser,
  removeServerInstalledPackageForUser,
  saveServerInstalledPackageForUser,
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
  userId: string,
): Map<CompanyTemplateId, ReturnType<typeof getServerInstalledPackageForUser>> {
  return new Map(
    getServerInstalledPackagesForUser(userId).map((record) => [
      record.templateId,
      record,
    ]),
  );
}

function buildCatalogViews(userId: string): WorkflowPackageView[] {
  const activeTemplateId = getServerActiveCompanyStateForUser(userId).templateId;
  const installedMap = resolveInstalledMap(userId);

  return companyTemplates.map((template) =>
    buildPackageView(template, {
      installed: installedMap.get(template.id) ?? null,
      isActive: template.id === activeTemplateId,
    }),
  );
}

export class WorkflowMarketplaceService {
  getCatalogForUser(userId: string): WorkflowMarketplaceCatalog {
    const packages = buildCatalogViews(userId);
    const activeTemplateId = getServerActiveCompanyStateForUser(userId).templateId;

    return {
      packages,
      installed: getServerInstalledPackagesForUser(userId),
      activeTemplateId,
      sections: buildSectionIndex(packages),
    };
  }

  getPackageForUser(
    userId: string,
    templateId: CompanyTemplateId,
  ): WorkflowPackageView {
    const template = getCompanyTemplate(templateId);
    const installed = getServerInstalledPackageForUser(userId, templateId);
    const activeTemplateId = getServerActiveCompanyStateForUser(userId).templateId;

    return buildPackageView(template, {
      installed,
      isActive: templateId === activeTemplateId,
    });
  }

  async installPackageForUser(
    userId: string,
    templateId: CompanyTemplateId,
  ): Promise<InstallPackageResult> {
    const metadata = getWorkflowPackageMetadata(templateId);
    const now = new Date().toISOString();

    const applyResult = await applyCompanyTemplateForUser(userId, templateId);

    saveServerInstalledPackageForUser(userId, {
      templateId,
      installedAt:
        getServerInstalledPackageForUser(userId, templateId)?.installedAt ?? now,
      updatedAt: now,
      installedVersion: metadata.version,
    });

    setClientInstalledPackages(getServerInstalledPackagesForUser(userId));
    setClientActiveCompanyState(applyResult.state);

    return {
      package: this.getPackageForUser(userId, templateId),
      automationsMerged: applyResult.automationsMerged,
      activated: true,
    };
  }

  async updatePackageForUser(
    userId: string,
    templateId: CompanyTemplateId,
  ): Promise<UpdatePackageResult> {
    const installed = getServerInstalledPackageForUser(userId, templateId);
    if (!installed) {
      throw new Error("Package is not installed. Install it before updating.");
    }

    return this.installPackageForUser(userId, templateId);
  }

  async removePackageForUser(
    userId: string,
    templateId: CompanyTemplateId,
  ): Promise<RemovePackageResult> {
    const installed = getServerInstalledPackageForUser(userId, templateId);
    if (!installed) {
      throw new Error("Package is not installed.");
    }

    removeServerInstalledPackageForUser(userId, templateId);

    let activeTemplateId = getServerActiveCompanyStateForUser(userId).templateId;

    if (activeTemplateId === templateId) {
      const fallback =
        getServerInstalledPackagesForUser(userId)[0]?.templateId ??
        DEFAULT_COMPANY_TEMPLATE_ID;

      const applyResult = await applyCompanyTemplateForUser(userId, fallback);
      activeTemplateId = applyResult.state.templateId;
      setClientActiveCompanyState(applyResult.state);
    }

    setClientInstalledPackages(getServerInstalledPackagesForUser(userId));

    return {
      removed: templateId,
      activeTemplateId,
    };
  }
}

export const workflowMarketplaceService = new WorkflowMarketplaceService();
