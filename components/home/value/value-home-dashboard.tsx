"use client";

import { useEffect, useMemo, useState } from "react";

import type { Automation } from "@/lib/automations/types";
import type { Project } from "@/lib/projects/types";
import {
  buildValueHomeSnapshot,
  notifyTodaySavings,
  summarizeValueAnalytics,
  trackValueEvent,
} from "@/lib/value";
import { HomeChatBar } from "@/components/home/home-chat-bar";

import { AutomationRoiList } from "./automation-roi-list";
import { CompletedWorkList } from "./completed-work-list";
import { FirstUsePitch } from "./first-use-pitch";
import { MemoryRoiCard } from "./memory-roi-card";
import { RoiCard } from "./roi-card";
import { SavingsNoticeBanner } from "./savings-notice-banner";
import { SecretaryReportCard } from "./secretary-report-card";
import { ValueHero } from "./value-hero";
import { ValueRankings } from "./value-rankings";
import { WorkReductionMeter } from "./work-reduction-meter";

export type ValueHomeDashboardProps = {
  automations: Automation[];
  projects: Project[];
  /** When true, keep a compact ask bar under the outcomes (legacy secretary). */
  showAskBar?: boolean;
};

/**
 * Outcome-first home — sells reduced work, not AI features.
 * Forbidden on this surface: LLM / Prompt / Token / Workflow / Node.
 */
export function ValueHomeDashboard({
  automations,
  projects,
  showAskBar = false,
}: ValueHomeDashboardProps) {
  const snapshot = useMemo(
    () => buildValueHomeSnapshot({ automations, projects }),
    [automations, projects],
  );
  const [showPitch, setShowPitch] = useState(!snapshot.firstUsePitchSeen);

  useEffect(() => {
    trackValueEvent("value_home_viewed", {
      jobs: snapshot.hero.jobsCompleted,
      minutes: snapshot.hero.minutesSaved,
    });
    if (snapshot.hero.minutesSaved > 0) {
      notifyTodaySavings(snapshot.hero.minutesSaved);
    }
    summarizeValueAnalytics({
      roiMultiple: snapshot.roi.roiMultiple,
      monthMinutesSaved: snapshot.roi.monthMinutesSaved,
      automationCount: snapshot.meters.find((m) => m.period === "month")
        ?.automationCount ?? 0,
      memoryApplyCount: snapshot.memoryRoi.applyCount,
      deliverableCount: snapshot.meters.find((m) => m.period === "month")
        ?.deliverableCount ?? 0,
    });
  }, [snapshot]);

  return (
    <div
      className="value-home-dashboard mx-auto w-full max-w-3xl space-y-6 pb-12 pt-4 sm:space-y-8 sm:pb-16 sm:pt-6"
      data-testid="value-home-dashboard"
    >
      {showPitch ? <FirstUsePitch onDismiss={() => setShowPitch(false)} /> : null}

      <header className="space-y-1">
        <p className="text-xs font-semibold tracking-wide text-[var(--brand)]">
          MINERVOT
        </p>
        <h1 className="text-2xl font-semibold tracking-tight text-[var(--text-primary)] sm:text-3xl">
          成果
        </h1>
        <p className="text-sm text-[var(--text-secondary)]">
          今月AIが終わらせた仕事を、毎回ここで確認できます。
        </p>
      </header>

      <SavingsNoticeBanner fallbackMinutes={snapshot.hero.minutesSaved} />
      <ValueHero snapshot={snapshot} />
      <WorkReductionMeter snapshot={snapshot} />
      <RoiCard snapshot={snapshot} />
      <SecretaryReportCard snapshot={snapshot} />
      <CompletedWorkList snapshot={snapshot} />
      <AutomationRoiList snapshot={snapshot} />
      <MemoryRoiCard snapshot={snapshot} />
      <ValueRankings snapshot={snapshot} />

      {showAskBar ? (
        <section className="border-t border-[var(--border)] pt-6">
          <p className="mb-3 text-sm text-[var(--text-secondary)]">
            追加のお願いがあるときだけ
          </p>
          <HomeChatBar />
        </section>
      ) : null}
    </div>
  );
}
