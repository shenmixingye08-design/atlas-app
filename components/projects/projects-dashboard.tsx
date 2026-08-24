"use client";
import { scheduleMountWork } from "@/lib/react/schedule-mount-work";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

import { AutomationFirstHome } from "@/components/automation-first/automation-first-home";
import {
  AutomationsClientError,
  fetchAutomations,
} from "@/lib/automations/client";
import type { Automation } from "@/lib/automations/types";
import { normalizeAutomations, normalizeProjects } from "@/lib/compatibility";
import { getOnboardingState, shouldShowWelcomeWizard } from "@/lib/onboarding";
import {
  fetchActivationView,
  patchActivationProgress,
} from "@/lib/activation/client";
import { ActivationOnboarding } from "@/components/onboarding/activation-onboarding";
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
        // [] is a valid empty home — never map it to load error.
        setAutomations(normalizeAutomations(items));
        setAutomationsError(false);
      })
      .catch((error) => {
        if (
          error instanceof AutomationsClientError &&
          error.status === 401
        ) {
          console.error("[ProjectsDashboard] automations unauthorized", {
            code: error.code,
            requestId: error.requestId,
          });
          window.location.assign("/sign-in?redirect_url=/projects");
          return;
        }
        console.error("[ProjectsDashboard] Failed to load automations:", {
          message: error instanceof Error ? error.message : "unknown",
          code: error instanceof AutomationsClientError ? error.code : null,
          requestId:
            error instanceof AutomationsClientError ? error.requestId : null,
          status: error instanceof AutomationsClientError ? error.status : null,
        });
        setAutomations([]);
        setAutomationsError(true);
      });
  }, []);

  const refreshExperienceState = useCallback(() => {
    const forceWelcome =
      searchParams.get("welcome") === "1" ||
      searchParams.get("onboarding") === "1";
    const forceExperience = searchParams.get("experience") === "1";
    const localOnboarding = getOnboardingState();
    const localExisting =
      localOnboarding.completedOnboarding ||
      (!localOnboarding.showOnboarding && !shouldShowWelcomeWizard());

    void fetchActivationView()
      .then((view) => {
        if (view.progress.legacyUser || view.progress.phase === "completed") {
          setShowWizard(forceWelcome);
          setShowFirstExperience(forceExperience);
          return;
        }
        if (localExisting && view.shouldShowOnboarding) {
          void patchActivationProgress({
            phase: "completed",
            checklistHidden: true,
          });
          setShowWizard(forceWelcome);
          setShowFirstExperience(forceExperience);
          return;
        }
        setShowWizard(forceWelcome || view.shouldShowOnboarding);
        setShowFirstExperience(forceExperience);
      })
      .catch(() => {
        setShowWizard(forceWelcome || (!localExisting && shouldShowWelcomeWizard()));
        setShowFirstExperience(forceExperience);
      });
  }, [searchParams]);

  useEffect(() => {
    void Promise.resolve().then(() => {
      refreshExperienceState();
    });
  }, [refreshExperienceState]);

  const handleWizardComplete = useCallback(() => {
    setShowWizard(false);
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
      {showWizard && (
        <ActivationOnboarding
          onComplete={handleWizardComplete}
          onSkip={handleFirstExperienceDefer}
        />
      )}
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
