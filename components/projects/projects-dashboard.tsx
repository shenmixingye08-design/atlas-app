"use client";
import { scheduleMountWork } from "@/lib/react/schedule-mount-work";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

import { AutomationFirstHome } from "@/components/automation-first/automation-first-home";
import { fetchAutomations } from "@/lib/automations/client";
import type { Automation } from "@/lib/automations/types";
import { normalizeAutomations, normalizeProjects } from "@/lib/compatibility";
import { shouldShowFirstExperience } from "@/lib/first-experience";
import { shouldShowWelcomeWizard } from "@/lib/onboarding";
import { useProjects } from "@/lib/projects/use-projects";
import { ui } from "@/lib/i18n";
import { useFeatureAvailability } from "@/lib/feature-flags";
import { LoadingState } from "@/components/ui/loading-state";
import {
  HomeDashboardErrorBoundary,
  HomeWorkLoadError,
} from "@/components/home/home-dashboard-error-boundary";
import { SecretaryHomeDashboard } from "@/components/home/secretary-home-dashboard";
import { FirstSuccessExperience } from "@/components/onboarding/first-success-experience";
import { WelcomeWizard } from "@/components/onboarding/welcome-wizard";

export function ProjectsDashboard() {
  const searchParams = useSearchParams();
  const { projects: rawProjects, isReady } = useProjects();
  const projects = normalizeProjects(rawProjects);
  const {
    flags,
    loading: flagsLoading,
    error: flagsError,
    reload: reloadFlags,
  } = useFeatureAvailability();
  const [automations, setAutomations] = useState<Automation[]>([]);
  const [automationsError, setAutomationsError] = useState(false);
  const [showWizard, setShowWizard] = useState(false);
  const [showFirstExperience, setShowFirstExperience] = useState(false);

  // Prefer AF once flags resolve (or optimistic Preview/dev defaults).
  // Never render legacy home while flags are still loading.
  const automationFirstHome = flags.automation_first_home_enabled === true;

  const reloadAutomations = useCallback(() => {
    void fetchAutomations()
      .then((items) => {
        setAutomations(normalizeAutomations(items));
        setAutomationsError(false);
      })
      .catch((error) => {
        console.error("[ProjectsDashboard] Failed to load automations:", error);
        setAutomations([]);
        setAutomationsError(true);
      });
  }, []);

  const refreshExperienceState = useCallback(() => {
    const forceWelcome = searchParams.get("welcome") === "1";
    const forceExperience = searchParams.get("experience") === "1";
    setShowWizard(forceWelcome || shouldShowWelcomeWizard());
    setShowFirstExperience(
      !forceWelcome && (forceExperience || shouldShowFirstExperience()),
    );
  }, [searchParams]);

  useEffect(() => {
    void Promise.resolve().then(() => {
      refreshExperienceState();
    });
  }, [refreshExperienceState]);

  const handleWizardComplete = useCallback(() => {
    setShowWizard(false);
    // オンボーディング完了後は説明のみ。ダミー業務・架空体験は自動表示しない。
    setShowFirstExperience(false);
  }, []);

  const handleFirstExperienceComplete = useCallback(() => {
    setShowFirstExperience(false);
  }, []);

  const handleFirstExperienceDefer = useCallback(() => {
    setShowFirstExperience(false);
  }, []);

  useEffect(() => {
    return scheduleMountWork(() => {
      void reloadAutomations();
    });
  }, [reloadAutomations]);

  if (!isReady || flagsLoading) {
    return <LoadingState message={ui.secretaryProgress.preparing} />;
  }

  // Flag fetch failed and AF is not optimistically on → retry, never flash legacy.
  if (flagsError && !automationFirstHome) {
    return (
      <div className="home-dashboard space-y-6 pb-2 sm:pb-4">
        <HomeWorkLoadError
          onRetry={() => {
            reloadFlags();
          }}
        />
      </div>
    );
  }

  return (
    <HomeDashboardErrorBoundary>
      {showWizard && <WelcomeWizard onComplete={handleWizardComplete} />}
      {showFirstExperience && !showWizard && (
        <FirstSuccessExperience
          onComplete={handleFirstExperienceComplete}
          onDefer={handleFirstExperienceDefer}
        />
      )}

      {automationsError ? (
        <div className="home-dashboard space-y-6 pb-2 sm:pb-4">
          <HomeWorkLoadError
            onRetry={() => {
              setAutomationsError(false);
              reloadAutomations();
            }}
          />
        </div>
      ) : automationFirstHome ? (
        <AutomationFirstHome automations={automations} projects={projects} />
      ) : (
        <SecretaryHomeDashboard automations={automations} projects={projects} />
      )}
    </HomeDashboardErrorBoundary>
  );
}
