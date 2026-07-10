"use client";

import { listActivityMetadata } from "@/lib/activity-history/metadata-store";
import { listActivityTemplates } from "@/lib/activity-history/templates-store";
import { fetchAutomations } from "@/lib/automations/client";
import type { Automation } from "@/lib/automations/types";
import { getClientActiveCompanyState } from "@/lib/company-templates/store";
import { loadCategoryExecutionModes } from "@/lib/cost-optimization/category-defaults-store";
import { fetchExternalServiceCatalog } from "@/lib/integrations/external-services/client";
import type { ExternalServiceConnection } from "@/lib/integrations/external-services/types";
import {
  fetchNotificationPreferences,
  fetchNotifications,
} from "@/lib/notifications/client";
import type {
  NotificationPreferences,
  NotificationRecord,
} from "@/lib/notifications/types";
import { normalizeProjects } from "@/lib/compatibility";
import { projectService } from "@/lib/projects/project-service";
import type { Project } from "@/lib/projects/types";
import { fetchUserMemories } from "@/lib/user-memory/client";
import type { UserMemory } from "@/lib/user-memory/types";
import { loadUserWorkProfile } from "@/lib/user-profile/store";
import { getClientInstalledPackages } from "@/lib/workflow-marketplace/installed-store";

import {
  DEFAULT_EXPORT_SECTIONS,
  EXPORT_SCHEMA_VERSION,
  type AtlasExportBundle,
  type ExportProgress,
  type ExportSectionSelection,
  type FavoriteExportItem,
} from "./types";

export type CollectProgressCallback = (progress: ExportProgress) => void;

function sanitizeGoogleSettings(
  services: ExternalServiceConnection[],
): ExternalServiceConnection[] {
  return services.map((service) => ({
    serviceId: service.serviceId,
    serviceName: service.serviceName,
    status: service.status,
    connectedAt: service.connectedAt,
    lastUsedAt: service.lastUsedAt,
    scopes: service.scopes,
    features: service.features,
    errorMessage: service.errorMessage,
    account: service.account
      ? {
          email: service.account.email,
          name: service.account.name,
          pictureUrl: service.account.pictureUrl,
          providerUserId: service.account.providerUserId,
          username: service.account.username,
        }
      : undefined,
  }));
}

function buildFavoriteItems(): FavoriteExportItem[] {
  const metadata = listActivityMetadata();
  return Object.entries(metadata)
    .filter(([, value]) => value.favorite)
    .map(([id, value]) => ({
      id,
      favorite: true as const,
      metadata: value,
    }));
}

function filterBundleSections(
  bundle: AtlasExportBundle,
  sections: ExportSectionSelection,
): AtlasExportBundle {
  return {
    ...bundle,
    sections: {
      workHistory: sections.workHistory
        ? bundle.sections.workHistory
        : { projects: [], activityMetadata: {} },
      chat: sections.chat
        ? bundle.sections.chat
        : { messages: [], note: "" },
      memory: sections.memory ? bundle.sections.memory : { memories: [] },
      notifications: sections.notifications
        ? bundle.sections.notifications
        : { notifications: [], preferences: null },
      automations: sections.automations
        ? bundle.sections.automations
        : { automations: [] },
      googleSettings: sections.googleSettings
        ? bundle.sections.googleSettings
        : { services: [] },
      templates: sections.templates
        ? bundle.sections.templates
        : {
            activityTemplates: [],
            companyTemplate: getClientActiveCompanyState(),
            installedPackages: [],
          },
      favorites: sections.favorites ? bundle.sections.favorites : { items: [] },
      profile: sections.profile
        ? bundle.sections.profile
        : {
            workProfile: loadUserWorkProfile(),
            costOptimization: loadCategoryExecutionModes(),
          },
    },
  };
}

export async function collectAtlasExportData(input?: {
  sections?: ExportSectionSelection;
  onProgress?: CollectProgressCallback;
}): Promise<AtlasExportBundle> {
  const sections = input?.sections ?? DEFAULT_EXPORT_SECTIONS;
  const onProgress = input?.onProgress;

  onProgress?.({ stage: "collecting", percent: 5 });

  const projects: Project[] = normalizeProjects(projectService.list());
  onProgress?.({ stage: "collecting", percent: 15 });

  let memories: UserMemory[] = [];
  let notifications: NotificationRecord[] = [];
  let notificationPreferences: NotificationPreferences | null = null;
  let automations: Automation[] = [];
  let googleServices: ExternalServiceConnection[] = [];

  try {
    const memoryResponse = await fetchUserMemories();
    memories = memoryResponse.memories ?? [];
  } catch {
    memories = [];
  }
  onProgress?.({ stage: "collecting", percent: 30 });

  try {
    const notificationResponse = await fetchNotifications();
    notifications = notificationResponse.notifications ?? [];
  } catch {
    notifications = [];
  }

  try {
    notificationPreferences = await fetchNotificationPreferences();
  } catch {
    notificationPreferences = null;
  }
  onProgress?.({ stage: "collecting", percent: 45 });

  try {
    automations = await fetchAutomations();
  } catch {
    automations = [];
  }
  onProgress?.({ stage: "collecting", percent: 55 });

  try {
    const catalog = await fetchExternalServiceCatalog();
    googleServices = sanitizeGoogleSettings(
      catalog.services.map((service) => service.connection),
    );
  } catch {
    googleServices = [];
  }
  onProgress?.({ stage: "collecting", percent: 70 });

  const bundle: AtlasExportBundle = {
    schemaVersion: EXPORT_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    app: "ATLAS",
    sections: {
      workHistory: {
        projects,
        activityMetadata: listActivityMetadata(),
      },
      chat: {
        messages: [],
        note:
          "追加依頼は現在セッション内のみ保持され、永続化されていません。将来のバージョンで履歴エクスポートに対応予定です。",
      },
      memory: { memories },
      notifications: {
        notifications,
        preferences: notificationPreferences,
      },
      automations: { automations },
      googleSettings: { services: googleServices },
      templates: {
        activityTemplates: listActivityTemplates(),
        companyTemplate: getClientActiveCompanyState(),
        installedPackages: getClientInstalledPackages(),
      },
      favorites: { items: buildFavoriteItems() },
      profile: {
        workProfile: loadUserWorkProfile(),
        costOptimization: loadCategoryExecutionModes(),
      },
    },
  };

  onProgress?.({ stage: "collecting", percent: 100 });
  return filterBundleSections(bundle, sections);
}
