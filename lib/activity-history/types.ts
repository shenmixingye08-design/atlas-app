import type { WorkCategoryId } from "@/lib/home/monthly-achievements";
import type { OrchestrationResult } from "@/lib/orchestration/types";
import type { ProjectStatus } from "@/lib/projects/types";

export type ActivityHistorySource = "project" | "automation";

export type ActivityHistoryStatus = ProjectStatus | "failed";

export type ActivityHistoryMetadata = {
  favorite: boolean;
  memoryLearned: boolean;
  templateId: string | null;
};

export type ActivityHistoryItem = {
  id: string;
  source: ActivityHistorySource;
  projectId: string | null;
  automationId: string | null;
  completedAt: string;
  title: string;
  workRequest: string;
  category: WorkCategoryId;
  categoryLabel: string;
  status: ActivityHistoryStatus;
  durationMs: number;
  employees: string[];
  services: string[];
  deliverablePreview: string | null;
  deliverableType: string | null;
  result: OrchestrationResult | null;
  error: string | null;
  metadata: ActivityHistoryMetadata;
};

export type ActivityHistoryFilters = {
  keyword: string;
  category: WorkCategoryId | "all";
  employee: string | "all";
  period: "all" | "7d" | "30d" | "90d";
  favoritesOnly: boolean;
};

export type ActivityHistoryTemplate = {
  id: string;
  title: string;
  workRequest: string;
  category: WorkCategoryId;
  createdAt: string;
  sourceHistoryId: string;
};
