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

function resolveInstalledMap(): Map<CompanyTemplateId, ReturnType<typeof getServerInstalledPackage>> {
  return new Map(
    getServerInstalledPackages().map((record) => [record.templateId, record]),
  );
}

function buildCatalogViews(): WorkflowPackageView[] {
  const activeTemplateId = getServerActiveCompanyState().templateId;
  const installedMap = resolveInstalledMap();

  return companyTemplates.map((template) =>
    buildPackageView(template, {
      installed: installedMap.get(template.id) ?? null,
      isActive: template.id === activeTemplateId,
    }),
  );
}

export class WorkflowMarketplaceService {
  getCatalog(): WorkflowMarketplaceCatalog {
    const packages = buildCatalogViews();
    const activeTemplateId = getServerActiveCompanyState().templateId;

    return {
      packages,
      installed: getServerInstalledPackages(),
      activeTemplateId,
      sections: buildSectionIndex(packages),
    };
  }

  getPackage(templateId: CompanyTemplateId): WorkflowPackageView {
    const template = getCompanyTemplate(templateId);
    const installed = getServerInstalledPackage(templateId);
    const activeTemplateId = getServerActiveCompanyState().templateId;

    return buildPackageView(template, {
      installed,
      isActive: templateId === activeTemplateId,
    });
  }

  async installPackage(templateId: CompanyTemplateId): Promise<InstallPackageResult> {
    const metadata = getWorkflowPackageMetadata(templateId);
    const now = new Date().toISOString();

    const applyResult = await applyCompanyTemplate(templateId);

    const record = saveServerInstalledPackage({
      templateId,
      installedAt: getServerInstalledPackage(templateId)?.installedAt ?? now,
      updatedAt: now,
      installedVersion: metadata.version,
    });

    setClientInstalledPackages(getServerInstalledPackages());
    setClientActiveCompanyState(applyResult.state);

    return {
      package: this.getPackage(templateId),
      automationsMerged: applyResult.automationsMerged,
      activated: true,
    };
  }

  async updatePackage(templateId: CompanyTemplateId): Promise<UpdatePackageResult> {
    const installed = getServerInstalledPackage(templateId);
    if (!installed) {
      throw new Error("Package is not installed. Install it before updating.");
    }

    return this.installPackage(templateId);
  }

  async removePackage(templateId: CompanyTemplateId): Promise<RemovePackageResult> {
    const installed = getServerInstalledPackage(templateId);
    if (!installed) {
      throw new Error("Package is not installed.");
    }

    removeServerInstalledPackage(templateId);

    let activeTemplateId = getServerActiveCompanyState().templateId;

    if (activeTemplateId === templateId) {
      const fallback = getServerInstalledPackages()[0]?.templateId
        ?? DEFAULT_COMPANY_TEMPLATE_ID;

      const applyResult = await applyCompanyTemplate(fallback);
      activeTemplateId = applyResult.state.templateId;
      setClientActiveCompanyState(applyResult.state);
    }

    setClientInstalledPackages(getServerInstalledPackages());

    return {
      removed: templateId,
      activeTemplateId,
    };
  }
}

export const workflowMarketplaceService = new WorkflowMarketplaceService();
