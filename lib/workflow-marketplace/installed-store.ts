import type { CompanyTemplateId } from "@/lib/company-templates/types";
import { DEFAULT_COMPANY_TEMPLATE_ID } from "@/lib/company-templates/types";

import type { InstalledWorkflowPackage } from "./types";
import { getWorkflowPackageMetadata } from "./definitions/packages";

export const INSTALLED_PACKAGES_STORAGE_KEY = "atlas-installed-workflow-packages";

type InstalledBucket = Map<CompanyTemplateId, InstalledWorkflowPackage>;

function createDefaultInstalled(): InstalledWorkflowPackage {
  const now = new Date().toISOString();
  const metadata = getWorkflowPackageMetadata(DEFAULT_COMPANY_TEMPLATE_ID);

  return {
    templateId: DEFAULT_COMPANY_TEMPLATE_ID,
    installedAt: now,
    updatedAt: now,
    installedVersion: metadata.version,
  };
}

function seedDefaults(bucket: InstalledBucket): void {
  if (bucket.size > 0) return;
  const defaults = createDefaultInstalled();
  bucket.set(defaults.templateId, defaults);
}

function getServerBucket(): InstalledBucket {
  const globalScope = globalThis as typeof globalThis & {
    __atlasInstalledWorkflowPackages?: InstalledBucket;
  };

  if (!globalScope.__atlasInstalledWorkflowPackages) {
    globalScope.__atlasInstalledWorkflowPackages = new Map();
    seedDefaults(globalScope.__atlasInstalledWorkflowPackages);
  }

  return globalScope.__atlasInstalledWorkflowPackages;
}

export function getServerInstalledPackages(): InstalledWorkflowPackage[] {
  return [...getServerBucket().values()].sort(
    (a, b) =>
      new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
  );
}

export function getServerInstalledPackage(
  templateId: CompanyTemplateId,
): InstalledWorkflowPackage | null {
  return getServerBucket().get(templateId) ?? null;
}

export function saveServerInstalledPackage(
  record: InstalledWorkflowPackage,
): InstalledWorkflowPackage {
  getServerBucket().set(record.templateId, record);
  return record;
}

export function removeServerInstalledPackage(
  templateId: CompanyTemplateId,
): boolean {
  return getServerBucket().delete(templateId);
}

export function getClientInstalledPackages(): InstalledWorkflowPackage[] {
  if (typeof window === "undefined") {
    return [createDefaultInstalled()];
  }

  try {
    const raw = localStorage.getItem(INSTALLED_PACKAGES_STORAGE_KEY);
    if (!raw) {
      const defaults = [createDefaultInstalled()];
      localStorage.setItem(INSTALLED_PACKAGES_STORAGE_KEY, JSON.stringify(defaults));
      return defaults;
    }

    return JSON.parse(raw) as InstalledWorkflowPackage[];
  } catch {
    return [createDefaultInstalled()];
  }
}

export function setClientInstalledPackages(
  packages: InstalledWorkflowPackage[],
): InstalledWorkflowPackage[] {
  if (typeof window !== "undefined") {
    localStorage.setItem(
      INSTALLED_PACKAGES_STORAGE_KEY,
      JSON.stringify(packages),
    );
  }
  return packages;
}

export function syncClientInstalledPackage(
  record: InstalledWorkflowPackage,
): void {
  const existing = getClientInstalledPackages();
  const next = existing.filter((item) => item.templateId !== record.templateId);
  next.unshift(record);
  setClientInstalledPackages(next);
}

export function removeClientInstalledPackage(
  templateId: CompanyTemplateId,
): void {
  const next = getClientInstalledPackages().filter(
    (item) => item.templateId !== templateId,
  );
  setClientInstalledPackages(next);
}
