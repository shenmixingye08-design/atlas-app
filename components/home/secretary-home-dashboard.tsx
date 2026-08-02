"use client";

import type { Automation } from "@/lib/automations/types";
import type { Project } from "@/lib/projects/types";
import { isActivationCompleted } from "@/lib/activation";
import { ui } from "@/lib/i18n";

import { RetentionDayPlanPanel } from "@/components/retention/day-plan-panel";
import { HomeBootstrapPanel } from "@/components/retention/home-bootstrap-panel";
import { NextAutomatePanel } from "@/components/retention/next-automate-panel";
import { RetentionValueDashboard } from "@/components/retention/value-dashboard";

import { HomeChatBar } from "./home-chat-bar";
import { HomeGreetingHeader } from "./home-greeting-header";

type SecretaryHomeDashboardProps = {
  automations: Automation[];
  projects: Project[];
};

/**
 * Post-login home — chat-first, but never an empty void for new users.
 * Retention bootstrap / value / 7-day plan sit below the primary ask bar.
 */
export function SecretaryHomeDashboard({
  automations,
  projects,
}: SecretaryHomeDashboardProps) {
  const showBootstrap = !isActivationCompleted() || automations.length === 0;

  return (
    <div className="home-dashboard mx-auto flex min-h-[70vh] w-full max-w-3xl flex-col space-y-8 pb-16 pt-8 sm:space-y-10 sm:pb-20 sm:pt-12">
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

      {showBootstrap ? <HomeBootstrapPanel /> : null}
      <RetentionValueDashboard />
      <NextAutomatePanel automations={automations} />
      <RetentionDayPlanPanel />
    </div>
  );
}
