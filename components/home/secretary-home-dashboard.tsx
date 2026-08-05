"use client";

import type { Automation } from "@/lib/automations/types";
import type { Project } from "@/lib/projects/types";

import { ValueHomeDashboard } from "./value/value-home-dashboard";

type SecretaryHomeDashboardProps = {
  automations: Automation[];
  projects: Project[];
};

/**
 * Post-login home — outcome-first.
 * Chat is secondary; reduced work and ROI are the product.
 */
export function SecretaryHomeDashboard({
  automations,
  projects,
}: SecretaryHomeDashboardProps) {
  return (
    <ValueHomeDashboard
      automations={automations}
      projects={projects}
      showAskBar
    />
  );
}
