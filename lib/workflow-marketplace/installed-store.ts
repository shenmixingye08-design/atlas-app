import type { CompanyTemplateId } from "@/lib/company-templates/types";
import { DEFAULT_COMPANY_TEMPLATE_ID } from "@/lib/company-templates/types";

import type { InstalledWorkflowPackage } from "./types";
import { getWorkflowPackageMetadata } from "./definitions/packages";

export const INSTALLED_PACKAGES_STORAGE_KEY = "atlas-installed-workflow-packages";

type InstalledBucket = Map<CompanyTemplateId, InstalledWorkflowPackage>;
type UserInstalledBucket = Map<string, InstalledBucket>;

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

function getServerUserBucket(): UserInstalledBucket {
  const globalScope = globalThis as typeof globalThis & {
    __atlasInstalledWorkflowPackagesByUser?: UserInstalledBucket;
  };

  if (!globalScope.__atlasInstalledWorkflowPackagesByUser) {
    globalScope.__atlasInstalledWorkflowPackagesByUser = new Map();
  }

  return globalScope.__atlasInstalledWorkflowPackagesByUser;
}

function getUserBucket(userId: string): InstalledBucket {
  const users = getServerUserBucket();
  let bucket = users.get(userId);
  if (!bucket) {
    bucket = new Map();
    seedDefaults(bucket);
    users.set(userId, bucket);
  }
  return bucket;
}

export function getServerInstalledPackagesForUser(
  userId: string,
): InstalledWorkflowPackage[] {
  if (!userId) return [createDefaultInstalled()];
  return [...getUserBucket(userId).values()].sort(
    (a, b) =>
      new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
  );
}

export function getServerInstalledPackageForUser(
  userId: string,
  templateId: CompanyTemplateId,
): InstalledWorkflowPackage | null {
  if (!userId) return null;
  return getUserBucket(userId).get(templateId) ?? null;
}

export function saveServerInstalledPackageForUser(
  userId: string,
  record: InstalledWorkflowPackage,
): InstalledWorkflowPackage {
  getUserBucket(userId).set(record.templateId, record);
  return record;
}

export function removeServerInstalledPackageForUser(
  userId: string,
  templateId: CompanyTemplateId,
): boolean {
  if (!userId) return false;
  return getUserBucket(userId).delete(templateId);
}

/** @deprecated Prefer *ForUser variants */
export function getServerInstalledPackages(): InstalledWorkflowPackage[] {
  return [createDefaultInstalled()];
}

/** @deprecated Prefer *ForUser variants */
export function getServerInstalledPackage(
  templateId: CompanyTemplateId,
): InstalledWorkflowPackage | null {
  void templateId;
  return null;
}

/** @deprecated Prefer *ForUser variants */
export function saveServerInstalledPackage(
  record: InstalledWorkflowPackage,
): InstalledWorkflowPackage {
  return record;
}

/** @deprecated Prefer *ForUser variants */
export function removeServerInstalledPackage(
  templateId: CompanyTemplateId,
): boolean {
  void templateId;
  return false;
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

    const parsed = JSON.parse(raw) as InstalledWorkflowPackage[];
    return Array.isArray(parsed) && parsed.length > 0
      ? parsed
      : [createDefaultInstalled()];
  } catch {
    return [createDefaultInstalled()];
  }
}

export function setClientInstalledPackages(
  packages: InstalledWorkflowPackage[],
): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(INSTALLED_PACKAGES_STORAGE_KEY, JSON.stringify(packages));
}
