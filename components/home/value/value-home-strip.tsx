"use client";

import { useEffect, useMemo, useState } from "react";

import type { Automation } from "@/lib/automations/types";
import type { Project } from "@/lib/projects/types";
import {
  buildValueHomeSnapshot,
  notifyTodaySavings,
  trackValueEvent,
} from "@/lib/value";

import { FirstUsePitch } from "./first-use-pitch";
import { RoiCard } from "./roi-card";
import { SavingsNoticeBanner } from "./savings-notice-banner";
import { SecretaryReportCard } from "./secretary-report-card";
import { ValueHero } from "./value-hero";
import { WorkReductionMeter } from "./work-reduction-meter";

/** Compact outcome strip for Automation First home (above ops timeline). */
export function ValueHomeStrip({
  automations,
  projects,
}: {
  automations: Automation[];
  projects: Project[];
}) {
  const snapshot = useMemo(
    () => buildValueHomeSnapshot({ automations, projects }),
    [automations, projects],
  );
  const [showPitch, setShowPitch] = useState(!snapshot.firstUsePitchSeen);

  useEffect(() => {
    trackValueEvent("value_home_viewed", {
      jobs: snapshot.hero.jobsCompleted,
      minutes: snapshot.hero.minutesSaved,
      surface: "af_strip",
    });
    if (snapshot.hero.minutesSaved > 0) {
      notifyTodaySavings(snapshot.hero.minutesSaved);
    }
  }, [snapshot.hero.jobsCompleted, snapshot.hero.minutesSaved]);

  return (
    <div className="space-y-5" data-testid="value-home-strip">
      {showPitch ? <FirstUsePitch onDismiss={() => setShowPitch(false)} /> : null}
      <SavingsNoticeBanner fallbackMinutes={snapshot.hero.minutesSaved} />
      <ValueHero snapshot={snapshot} />
      <WorkReductionMeter snapshot={snapshot} />
      <RoiCard snapshot={snapshot} />
      <SecretaryReportCard snapshot={snapshot} />
    </div>
  );
}
