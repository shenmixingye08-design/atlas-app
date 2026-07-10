"use client";

import { useCallback, useEffect, useState } from "react";

import { filterProjects } from "./utils";
import { projectService } from "./project-service";
import { normalizeProjects } from "@/lib/compatibility";
import type { CreateProjectInput, Project } from "./types";

export function useProjects() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    try {
      setProjects(normalizeProjects(projectService.list()));
    } catch (error) {
      console.error("[useProjects] Failed to load projects:", error);
      setProjects([]);
    } finally {
      setIsReady(true);
    }
  }, []);

  const persist = useCallback((next: Project[]) => {
    setProjects(next);
    projectService.saveAll(next);
  }, []);

  const addProject = useCallback(
    (input: CreateProjectInput) => {
      const project = projectService.addProject(input, projects);
      setProjects([project, ...projects]);
      return project;
    },
    [projects],
  );

  const removeProject = useCallback(
    (id: string) => {
      projectService.removeProject(id, projects);
      setProjects(projects.filter((p) => p.id !== id));
    },
    [projects],
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
