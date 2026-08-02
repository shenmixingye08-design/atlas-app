"use client";

import { useEffect, useState } from "react";

import { WelcomeWizard } from "@/components/onboarding/welcome-wizard";
import { RetentionDayPlanPanel } from "@/components/retention/day-plan-panel";
import { FirstDeliverableSurvey } from "@/components/retention/first-deliverable-survey";
import { HomeBootstrapPanel } from "@/components/retention/home-bootstrap-panel";
import { NextAutomatePanel } from "@/components/retention/next-automate-panel";
import { RetentionValueDashboard } from "@/components/retention/value-dashboard";
import {
  markActivationCompleted,
  resetActivationStateForTests,
} from "@/lib/activation/store";
import {
  completeRetentionWizard,
  markRetentionDayComplete,
  recordFirstWinDeliverable,
  resetRetentionStateForTests,
} from "@/lib/retention";
import { resetUserWorkProfile } from "@/lib/user-profile";
import { cn } from "@/lib/design-system/cn";

type PreviewScene = "wizard" | "home" | "survey" | "dayplan";

function seedPreviewHome(): void {
  resetUserWorkProfile();
  resetRetentionStateForTests();
  resetActivationStateForTests();
  completeRetentionWizard({
    workDescription: "毎週の営業報告と見積作成",
    company: "MINERVOT Demo",
    roleId: "sales",
    preferredTasks: ["sales_material", "email"],
    integrations: ["google", "calendar"],
    entryMode: "guide",
  });
  markActivationCompleted({
    automationId: "preview-auto",
    runId: "preview-run",
    artifactUrl: "/api/deliverables/preview",
  });
  recordFirstWinDeliverable("/projects/preview-auto");
  markRetentionDayComplete(1);
}

export function RetentionPreviewClient() {
  const [scene, setScene] = useState<PreviewScene>("wizard");
  const [viewport, setViewport] = useState<"pc" | "mobile">("pc");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    seedPreviewHome();
    setReady(true);
  }, []);

  if (!ready) {
    return (
      <div className="p-8 text-sm text-[var(--text-muted)]">preview loading…</div>
    );
  }

  return (
    <div className="min-h-[100dvh] bg-[var(--background)] p-4">
      <div className="mx-auto mb-4 flex max-w-4xl flex-wrap gap-2">
        {(
          [
            ["wizard", "1 Wizard"],
            ["home", "2 Home"],
            ["survey", "3 Survey"],
            ["dayplan", "4 7日プラン"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => {
              seedPreviewHome();
              setScene(id);
            }}
            className={cn(
              "min-h-11 rounded-[var(--radius-md)] border px-3 text-sm",
              scene === id
                ? "border-[var(--brand)] bg-[var(--brand-muted)] font-semibold"
                : "border-[var(--border)]",
            )}
          >
            {label}
          </button>
        ))}
        <button
          type="button"
          className="min-h-11 rounded-[var(--radius-md)] border border-[var(--border)] px-3 text-sm"
          onClick={() =>
            setViewport((value) => (value === "pc" ? "mobile" : "pc"))
          }
        >
          {viewport === "pc" ? "PC" : "360px"}
        </button>
      </div>

      <div
        className={cn(
          "mx-auto overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)]",
          viewport === "mobile" ? "w-[360px]" : "max-w-3xl",
        )}
        data-testid="retention-preview-frame"
        data-scene={scene}
        data-viewport={viewport}
      >
        {scene === "wizard" ? (
          <div className="relative min-h-[640px]">
            <WelcomeWizard onComplete={() => setScene("home")} />
          </div>
        ) : null}

        {scene === "home" ? (
          <div className="space-y-6 p-4 sm:p-6">
            <HomeBootstrapPanel />
            <RetentionValueDashboard />
            <NextAutomatePanel automations={[]} />
          </div>
        ) : null}

        {scene === "survey" ? (
          <div className="relative min-h-[520px]">
            <FirstDeliverableSurvey onClose={() => setScene("home")} />
          </div>
        ) : null}

        {scene === "dayplan" ? (
          <div className="p-4 sm:p-6">
            <RetentionDayPlanPanel />
          </div>
        ) : null}
      </div>
    </div>
  );
}
