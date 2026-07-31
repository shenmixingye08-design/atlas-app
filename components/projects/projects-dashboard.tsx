"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

import { shouldShowFirstExperience } from "@/lib/first-experience";
import { shouldShowWelcomeWizard } from "@/lib/onboarding";
import { useProjects } from "@/lib/projects/use-projects";
import { ui } from "@/lib/i18n";
import { LoadingState } from "@/components/ui/loading-state";
import { HomeDashboardErrorBoundary } from "@/components/home/home-dashboard-error-boundary";
import { SecretaryHomeDashboard } from "@/components/home/secretary-home-dashboard";
import { FirstSuccessExperience } from "@/components/onboarding/first-success-experience";
import { WelcomeWizard } from "@/components/onboarding/welcome-wizard";

/**
 * Phase1 home orchestrator — ask surface only.
 * Tutorials / welcome are opt-in via query only (not auto).
 */
export function ProjectsDashboard() {
  const searchParams = useSearchParams();
  const { isReady } = useProjects();
  const [showWizard, setShowWizard] = useState(false);
  const [showFirstExperience, setShowFirstExperience] = useState(false);

  useEffect(() => {
    const forceWelcome = searchParams.get("welcome") === "1";
    const forceExperience = searchParams.get("experience") === "1";
    // Phase1: never auto-show overlays that steal the 5-second ask moment.
    setShowWizard(forceWelcome && shouldShowWelcomeWizard());
    setShowFirstExperience(
      forceExperience && !forceWelcome && shouldShowFirstExperience(),
    );
  }, [searchParams]);

  if (!isReady) {
    return <LoadingState message={ui.secretaryProgress.preparing} />;
  }

  return (
    <HomeDashboardErrorBoundary>
      {showWizard && (
        <WelcomeWizard onComplete={() => setShowWizard(false)} />
      )}
      {showFirstExperience && !showWizard && (
        <FirstSuccessExperience
          onComplete={() => setShowFirstExperience(false)}
          onDefer={() => setShowFirstExperience(false)}
        />
      )}
      <SecretaryHomeDashboard />
    </HomeDashboardErrorBoundary>
  );
}
