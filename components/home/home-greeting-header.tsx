"use client";

import { useMemo } from "react";

import type { Automation } from "@/lib/automations/types";
import type { Project } from "@/lib/projects/types";
import { ui } from "@/lib/i18n";

type HomeGreetingHeaderProps = {
  automations: Automation[];
  projects: Project[];
  profileVersion?: number;
};

function greetingPeriod(): "morning" | "afternoon" | "evening" {
  const hour = new Date().getHours();
  if (hour < 11) return "morning";
  if (hour < 17) return "afternoon";
  return "evening";
}

/** Calm greeting only — no Morning Brief / stats / employee theater. */
export function HomeGreetingHeader({
  automations,
  projects,
  profileVersion = 0,
}: HomeGreetingHeaderProps) {
  void automations;
  void projects;
  void profileVersion;

  const greeting = useMemo(
    () => ui.dailyBrief.greeting[greetingPeriod()],
    [],
  );

  return (
    <div className="space-y-2">
      <p className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
        {greeting}
      </p>
    </div>
  );
}
