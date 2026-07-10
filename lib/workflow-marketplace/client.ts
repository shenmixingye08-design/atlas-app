import { ui } from "@/lib/i18n";

import type {
  InstallPackageResult,
  RemovePackageResult,
  UpdatePackageResult,
  WorkflowMarketplaceCatalog,
  WorkflowPackageView,
} from "./types";
import type { CompanyTemplateId } from "@/lib/company-templates/types";

export async function fetchMarketplaceCatalog(): Promise<WorkflowMarketplaceCatalog> {
  const response = await fetch("/api/marketplace", { cache: "no-store" });

  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? ui.error.loadFailed);
  }

  return response.json() as Promise<WorkflowMarketplaceCatalog>;
}

export async function fetchMarketplacePackage(
  templateId: CompanyTemplateId,
): Promise<WorkflowPackageView> {
  const response = await fetch(`/api/marketplace/${templateId}`, {
    cache: "no-store",
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? ui.error.loadFailed);
  }

  return response.json() as Promise<WorkflowPackageView>;
}

export async function installMarketplacePackage(
  templateId: CompanyTemplateId,
): Promise<InstallPackageResult> {
  const response = await fetch(`/api/marketplace/${templateId}/install`, {
    method: "POST",
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? ui.error.installFailed);
  }

  return response.json() as Promise<InstallPackageResult>;
}

export async function updateMarketplacePackage(
  templateId: CompanyTemplateId,
): Promise<UpdatePackageResult> {
  const response = await fetch(`/api/marketplace/${templateId}/update`, {
    method: "POST",
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? ui.error.updateFailed);
  }

  return response.json() as Promise<UpdatePackageResult>;
}

export async function removeMarketplacePackage(
  templateId: CompanyTemplateId,
): Promise<RemovePackageResult> {
  const response = await fetch(`/api/marketplace/${templateId}`, {
    method: "DELETE",
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? ui.error.removeFailed);
  }

  return response.json() as Promise<RemovePackageResult>;
}

export { MARKETPLACE_SECTION_LABELS } from "./types";
