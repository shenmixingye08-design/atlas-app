"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import {
  fetchAutomations,
  formatAutomationDateTime,
} from "@/lib/automations/client";
import type { Automation } from "@/lib/automations/types";
import { fetchIntegrationCatalog } from "@/lib/integrations/client";
import type { IntegrationCatalog } from "@/lib/integrations/types";
import { fetchKnowledgeEntries } from "@/lib/knowledge/client";
import type { KnowledgeEntry } from "@/lib/knowledge/types";
import type { Project } from "@/lib/projects/types";
import { fetchMarketplaceCatalog } from "@/lib/workflow-marketplace/client";
import type { WorkflowPackageView } from "@/lib/workflow-marketplace/types";

import type { ActivityEvent, DepartmentEmployee, DashboardMetric, KnowledgeGrowthPoint } from "./types";
import {
  buildDashboardMetrics,
  countConnectedIntegrations,
  deriveActivityFeed,
  deriveEmployeeStatuses,
  deriveKnowledgeGrowth,
  pickRecommendedPackages,
} from "./utils";

export function useDashboardHome(projects: Project[]) {
  const [automations, setAutomations] = useState<Automation[]>([]);
  const [knowledge, setKnowledge] = useState<KnowledgeEntry[]>([]);
  const [integrations, setIntegrations] = useState<IntegrationCatalog | null>(null);
  const [recommended, setRecommended] = useState<WorkflowPackageView[]>([]);
  const [isLoadingExtras, setIsLoadingExtras] = useState(true);

  const loadExtras = useCallback(async () => {
    try {
      const [autoItems, knowledgeRes, catalogRes, marketplaceRes] =
        await Promise.all([
          fetchAutomations().catch(() => [] as Automation[]),
          fetchKnowledgeEntries().catch(() => ({ entries: [], total: 0 })),
          fetchIntegrationCatalog().catch(() => null),
          fetchMarketplaceCatalog().catch(() => null),
        ]);

      setAutomations(autoItems);
      setKnowledge(knowledgeRes.entries);
      setIntegrations(catalogRes);

      if (marketplaceRes) {
        setRecommended(
          pickRecommendedPackages(
            marketplaceRes.packages,
            marketplaceRes.sections.featured ?? [],
          ),
        );
      }
    } finally {
      setIsLoadingExtras(false);
    }
  }, []);

  useEffect(() => {
    void loadExtras();
  }, [loadExtras]);

  const metrics = useMemo(
    (): DashboardMetric[] =>
      buildDashboardMetrics(
        projects,
        automations,
        knowledge.length,
        countConnectedIntegrations(integrations),
      ),
    [projects, automations, knowledge.length, integrations],
  );

  const employees = useMemo(
    (): DepartmentEmployee[] => deriveEmployeeStatuses(projects),
    [projects],
  );

  const activity = useMemo(
    (): ActivityEvent[] =>
      deriveActivityFeed(projects, automations, knowledge),
    [projects, automations, knowledge],
  );

  const knowledgeRecent = useMemo(
    () =>
      [...knowledge]
        .sort(
          (a, b) =>
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
        )
        .slice(0, 5),
    [knowledge],
  );

  const knowledgeReused = useMemo(
    () =>
      [...knowledge]
        .filter((e) => e.reusable)
        .sort((a, b) => b.confidence - a.confidence)
        .slice(0, 5),
    [knowledge],
  );

  const knowledgeGrowth = useMemo(
    (): KnowledgeGrowthPoint[] => deriveKnowledgeGrowth(knowledge),
    [knowledge],
  );

  const upcomingAutomations = useMemo(
    () =>
      [...automations]
        .filter((a) => a.enabled && a.nextRun)
        .sort(
          (a, b) =>
            new Date(a.nextRun!).getTime() - new Date(b.nextRun!).getTime(),
        )
        .slice(0, 4),
    [automations],
  );

  return {
    metrics,
    employees,
    activity,
    knowledgeRecent,
    knowledgeReused,
    knowledgeGrowth,
    recommended,
    integrations,
    automations,
    upcomingAutomations,
    isLoadingExtras,
    refreshExtras: loadExtras,
    formatAutomationDateTime,
  };
}
