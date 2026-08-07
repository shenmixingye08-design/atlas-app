"use client";

import type { Automation } from "@/lib/automations/types";
import type { Project } from "@/lib/projects/types";
import { ui } from "@/lib/i18n";

import { HomeChatBar } from "./home-chat-bar";
import { HomeGreetingHeader } from "./home-greeting-header";

type SecretaryHomeDashboardProps = {
  automations: Automation[];
  projects: Project[];
};

/**
 * Post-login home — 迷いゼロの第一画面。
 * Lead with work completion, not "AI秘書です".
 * Dashboard / analytics / recommendations stay out of the first path.
 */
export function SecretaryHomeDashboard({
  automations,
  projects,
}: SecretaryHomeDashboardProps) {
  return (
    <div className="home-dashboard mx-auto flex min-h-[60vh] w-full max-w-2xl flex-col justify-center space-y-6 pb-10 pt-6 sm:space-y-8 sm:pb-14 sm:pt-10">
      <header className="animate-card-enter space-y-2 text-center sm:space-y-3">
        <p className="text-[length:var(--text-label)] font-semibold tracking-[0.1em] text-[var(--brand)]">
          MINERVOT
        </p>
        <p className="text-sm font-medium tracking-wide text-[var(--brand)]">
          {ui.secretaryHome.brandTagline}
        </p>
        <HomeGreetingHeader automations={automations} projects={projects} />
        <p className="mx-auto max-w-md text-sm text-[var(--foreground-muted)] sm:text-base">
          {ui.secretaryHome.zeroFrictionHint}
        </p>
      </header>

      <div className="animate-card-enter">
        <HomeChatBar />
      </div>
    </div>
  );
}
