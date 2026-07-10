"use client";

import { useMemo } from "react";

import type { Automation } from "@/lib/automations/types";
import { buildDailyBrief } from "@/lib/home/daily-brief";
import type { Project } from "@/lib/projects/types";
import { ui } from "@/lib/i18n";

type HomeGreetingHeaderProps = {
  automations: Automation[];
  projects: Project[];
  profileVersion?: number;
};

export function HomeGreetingHeader({
  automations,
  projects,
  profileVersion = 0,
}: HomeGreetingHeaderProps) {
  const brief = useMemo(() => {
    void profileVersion;
    return buildDailyBrief({ automations, projects });
  }, [automations, projects, profileVersion]);

  const greeting = ui.dailyBrief.greeting[brief.greetingPeriod];

  return (
    <header className="space-y-2">
      <p className="text-lg font-medium text-foreground">{greeting}</p>
      <p className="text-base text-[var(--text-secondary)]">{brief.headline}</p>
    </header>
  );
}
