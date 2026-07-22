"use client";

import type { Automation } from "@/lib/automations/types";
import type { Project } from "@/lib/projects/types";
import { ui } from "@/lib/i18n";

import { HomeActionSummary } from "./home-action-summary";
import { HomeAiActivityPanel } from "./home-ai-activity-panel";
import { HomeChatBar } from "./home-chat-bar";
import { HomeGreetingHeader } from "./home-greeting-header";
import { HomePrimaryCtas } from "./home-primary-ctas";
import { HomeTodayOutcomes } from "./home-today-outcomes";
import { HomeTodayWorkSummary } from "./home-today-work-summary";
import { ProactiveSuggestionsPanel } from "./proactive-suggestions-panel";

type SecretaryHomeDashboardProps = {
  automations: Automation[];
  projects: Project[];
};

/**
 * Post-login home — action-first: CTAs → alerts → today counts → outcomes → activity.
 */
export function SecretaryHomeDashboard({
  automations,
  projects,
}: SecretaryHomeDashboardProps) {
  return (
    <div className="home-dashboard mx-auto w-full max-w-3xl space-y-14 pb-10 pt-2 sm:space-y-16 sm:pb-14 sm:pt-4">
      <header className="space-y-5">
        <p className="text-sm font-medium tracking-wide text-accent">
          {ui.secretaryHome.brandTagline}
        </p>
        <HomeGreetingHeader automations={automations} projects={projects} />
        <HomePrimaryCtas />
      </header>

      <HomeActionSummary automations={automations} projects={projects} />

      <HomeTodayWorkSummary automations={automations} projects={projects} />

      <HomeTodayOutcomes automations={automations} projects={projects} />

      <HomeAiActivityPanel automations={automations} projects={projects} />

      {/* ④ 次におすすめ */}
      <section aria-labelledby="next-recommendation-heading" className="space-y-5">
        <div>
          <h2
            id="next-recommendation-heading"
            className="text-xl font-semibold tracking-tight text-foreground sm:text-2xl"
          >
            {ui.secretaryHome.nextUpTitle}
          </h2>
          <p className="mt-2 text-sm text-[var(--foreground-muted)] sm:text-base">
            {ui.secretaryHome.nextUpSubtitle}
          </p>
        </div>
        <ProactiveSuggestionsPanel automations={automations} embedded />
      </section>

      {/* ⑤ 追加の指示（副次・最下部） */}
      <HomeChatBar />
    </div>
  );
}
