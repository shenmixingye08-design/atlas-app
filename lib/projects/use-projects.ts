"use client";

import { useCallback, useEffect, useState } from "react";

import { filterProjects } from "./utils";
import { projectService } from "./project-service";
import { normalizeProjects } from "@/lib/compatibility";
import {
  localStorageProjectRepository,
  SupabaseProjectRepository,
} from "./repository-provider";
import type { CreateProjectInput, Project } from "./types";

/**
 * Projects hook.
 * When Supabase is primary, localStorage is write-through cache only.
 */
export function useProjects() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const repo = projectService.getRepository();
        if (repo instanceof SupabaseProjectRepository) {
          const cached = localStorageProjectRepository.list();
          if (!cancelled && cached.length > 0) {
            setProjects(normalizeProjects(cached));
          }

          const remote = await repo.hydrate();
          if (cancelled) return;

          if (remote.length > 0) {
            setProjects(normalizeProjects(remote));
            localStorageProjectRepository.save(remote);
          } else if (cached.length > 0) {
            // Migrate browser cache → durable Supabase once.
            repo.save(cached);
            setProjects(normalizeProjects(cached));
          } else {
            setProjects([]);
          }
        } else {
          setProjects(normalizeProjects(projectService.list()));
        }
      } catch (error) {
        console.error("[useProjects] Failed to load projects:", error);
        if (!cancelled) setProjects([]);
      } finally {
        if (!cancelled) setIsReady(true);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const persist = useCallback((next: Project[]) => {
    setProjects(next);
    projectService.saveAll(next);
    const repo = projectService.getRepository();
    if (repo instanceof SupabaseProjectRepository) {
      localStorageProjectRepository.save(next);
    }
  }, []);

  const addProject = useCallback(
    (input: CreateProjectInput) => {
      const project = projectService.addProject(input, projects);
      const next = [project, ...projects];
      persist(next);
      return project;
    },
    [projects, persist],
  );

  const removeProject = useCallback(
    (id: string) => {
      const next = projects.filter((p) => p.id !== id);
      projectService.removeProject(id, projects);
      persist(next);
    },
    [projects, persist],
  );

  const getProject = useCallback(
    (id: string) => projects.find((p) => p.id === id) ?? null,
    [projects],
  );

  const filteredProjects = filterProjects(projects, searchQuery);

  return {
    projects,
    filteredProjects,
    searchQuery,
    setSearchQuery,
    addProject,
    removeProject,
    getProject,
    isReady,
  };
}
