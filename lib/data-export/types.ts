import type { ActivityHistoryMetadata, ActivityHistoryTemplate } from "@/lib/activity-history/types";
import type { Automation } from "@/lib/automations/types";
import type { ActiveCompanyState } from "@/lib/company-templates/types";
import type { CategoryExecutionModeDefaults } from "@/lib/cost-optimization/category-defaults-store";
import type { ExternalServiceConnection } from "@/lib/integrations/external-services/types";
import type { NotificationPreferences, NotificationRecord } from "@/lib/notifications/types";
import type { Project } from "@/lib/projects/types";
import type { UserMemory } from "@/lib/user-memory/types";
import type { UserWorkProfile } from "@/lib/user-profile/types";
import type { InstalledWorkflowPackage } from "@/lib/workflow-marketplace/types";

export const EXPORT_SCHEMA_VERSION = 1;

export type ExportFormat = "json" | "csv" | "markdown" | "zip";

export type AutoBackupSchedule = "manual" | "weekly" | "monthly";

export type ExportSectionId =
  | "workHistory"
  | "chat"
  | "memory"
  | "notifications"
  | "automations"
  | "googleSettings"
  | "templates"
  | "favorites"
  | "profile";

export type ExportSectionSelection = Record<ExportSectionId, boolean>;

export const DEFAULT_EXPORT_SECTIONS: ExportSectionSelection = {
  workHistory: true,
  chat: true,
  memory: true,
  notifications: true,
  automations: true,
  googleSettings: true,
  templates: true,
  favorites: true,
  profile: true,
};

export type SanitizedGoogleSettings = {
  services: ExternalServiceConnection[];
};

export type FavoriteExportItem = {
  id: string;
  favorite: true;
  metadata: ActivityHistoryMetadata;
};

export type AtlasExportBundle = {
  schemaVersion: number;
  exportedAt: string;
  app: "MINERVOT" | "ATLAS";
  sections: {
    workHistory: {
      projects: Project[];
      activityMetadata: Record<string, ActivityHistoryMetadata>;
    };
    chat: {
      messages: [];
      note: string;
    };
    memory: {
      memories: UserMemory[];
    };
    notifications: {
      notifications: NotificationRecord[];
      preferences: NotificationPreferences | null;
    };
    automations: {
      automations: Automation[];
    };
    googleSettings: SanitizedGoogleSettings;
    templates: {
      activityTemplates: ActivityHistoryTemplate[];
      companyTemplate: ActiveCompanyState;
      installedPackages: InstalledWorkflowPackage[];
    };
    favorites: {
      items: FavoriteExportItem[];
    };
    profile: {
      workProfile: UserWorkProfile;
      costOptimization: CategoryExecutionModeDefaults;
    };
  };
};

export type BackupHistoryStatus = "success" | "failed";

export type BackupHistoryEntry = {
  id: string;
  createdAt: string;
  format: ExportFormat;
  sizeBytes: number;
  status: BackupHistoryStatus;
  destination: "download" | "google_drive";
  errorMessage?: string;
  fileName: string;
};

export type AutoBackupSettings = {
  schedule: AutoBackupSchedule;
  lastRunAt: string | null;
  lastRunStatus: BackupHistoryStatus | null;
  enabled: boolean;
};

export type ExportProgressStage = "collecting" | "formatting" | "downloading" | "uploading";

export type ExportProgress = {
  stage: ExportProgressStage;
  percent: number;
};
