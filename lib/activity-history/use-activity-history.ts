"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { fetchAutomations } from "@/lib/automations/client";
import type { Automation } from "@/lib/automations/types";
import {
  buildActivityHistoryItems,
  DEFAULT_ACTIVITY_FILTERS,
  filterActivityHistoryItems,
  type ActivityHistoryFilters,
  type ActivityHistoryItem,
} from "@/lib/activity-history";
import { normalizeProjects } from "@/lib/compatibility";
import { projectService } from "@/lib/projects/project-service";
import type { Project } from "@/lib/projects/types";
import { fetchUserMemories } from "@/lib/user-memory/client";
import type { UserMemory } from "@/lib/user-memory/types";

export function useActivityHistory() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [automations, setAutomations] = useState<Automation[]>([]);
  const [memories, setMemories] = useState<UserMemory[]>([]);
  const [filters, setFilters] = useState<ActivityHistoryFilters>(
    DEFAULT_ACTIVITY_FILTERS,
  );
  const [isReady, setIsReady] = useState(false);
  const [version, setVersion] = useState(0);

  const reload = useCallback(() => {
    setVersion((v) => v + 1);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const [automationList, memoryResponse] = await Promise.all([
          fetchAutomations().catch(() => [] as Automation[]),
          fetchUserMemories().catch(() => ({ memories: [] as UserMemory[] })),
        ]);

        if (cancelled) return;

        setProjects(normalizeProjects(projectService.list()));
        setAutomations(automationList);
        setMemories(memoryResponse.memories ?? []);
      } finally {
        if (!cancelled) setIsReady(true);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [version]);

  const items = useMemo(
    () => buildActivityHistoryItems({ projects, automations, memories }),
    [projects, automations, memories],
  );

  const filteredItems = useMemo(
    () => filterActivityHistoryItems(items, filters),
    [items, filters],
  );

  const recentItems = useMemo(() => items.slice(0, 5), [items]);

  const refreshProjects = useCallback(() => {
    setProjects(normalizeProjects(projectService.list()));
  }, []);

  return {
    items,
    filteredItems,
    recentItems,
    filters,
    setFilters,
    isReady,
    reload,
    refreshProjects,
    getItem: (id: string): ActivityHistoryItem | null =>
      items.find((item) => item.id === id) ?? null,
  };
}
