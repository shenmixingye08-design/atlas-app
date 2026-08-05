"use client";

import type { Automation } from "@/lib/automations/types";
import type { Project } from "@/lib/projects/types";
import { ui } from "@/lib/i18n";

import { HomeChatBar } from "./home-chat-bar";
import { HomeGreetingHeader } from "./home-greeting-header";
import { ExecutiveAssistantPanel } from "./executive-assistant-panel";

type SecretaryHomeDashboardProps = {
  automations: Automation[];
  projects: Project[];
};

/**
 * Post-login home — 迷いゼロの第一画面 + AI秘書の先行提案。
 */
export function SecretaryHomeDashboard({
  automations,
  projects,
}: SecretaryHomeDashboardProps) {
  return (
    <div className="home-dashboard mx-auto flex min-h-[70vh] w-full max-w-2xl flex-col justify-center space-y-10 pb-16 pt-8 sm:space-y-12 sm:pb-20 sm:pt-12">
      <header className="space-y-3 text-center sm:space-y-4">
        <p className="text-sm font-medium tracking-wide text-accent">
          {ui.secretaryHome.brandTagline}
        </p>
        <HomeGreetingHeader automations={automations} projects={projects} />
        <p className="mx-auto max-w-md text-base text-[var(--foreground-muted)] sm:text-lg">
          {ui.secretaryHome.zeroFrictionHint}
        </p>
      </header>

      <HomeChatBar />

      <div className="w-full">
        <ExecutiveAssistantPanel
          automations={automations}
          projects={projects}
          compact
        />
      </div>
    </div>
  );
}
