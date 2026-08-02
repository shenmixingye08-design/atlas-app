"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { WeeklyReportActivation } from "@/components/activation/weekly-report-activation";
import { AutomationFirstHome } from "@/components/automation-first/automation-first-home";
import { FirstDeliverableSurvey } from "@/components/retention/first-deliverable-survey";
import { fetchAutomations } from "@/lib/automations/client";
import type { Automation } from "@/lib/automations/types";
import { normalizeAutomations, normalizeProjects } from "@/lib/compatibility";
import {
  isActivationCompleted,
  isActivationWeeklyReportEnabled,
  shouldAutoOpenActivation,
} from "@/lib/activation";
import { shouldShowWelcomeWizard } from "@/lib/onboarding";
import {
  loadRetentionState,
  recordRetentionActivity,
  shouldShowRetentionSurvey,
} from "@/lib/retention";
import { useProjects } from "@/lib/projects/use-projects";
import { ui } from "@/lib/i18n";
import { useFeatureAvailability } from "@/lib/feature-flags";
import { LoadingState } from "@/components/ui/loading-state";
import {
  HomeDashboardErrorBoundary,
  HomeWorkLoadError,
} from "@/components/home/home-dashboard-error-boundary";
import { SecretaryHomeDashboard } from "@/components/home/secretary-home-dashboard";
import { WelcomeWizard } from "@/components/onboarding/welcome-wizard";

export function ProjectsDashboard() {
  const router = useRouter();
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
  const [showActivation, setShowActivation] = useState(false);
  const [showSurvey, setShowSurvey] = useState(false);

  const automationFirstHome = flags.automation_first_home_enabled === true;
  const activationEnabled = isActivationWeeklyReportEnabled();

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
    const forceActivation =
      searchParams.get("activation") === "1" ||
      searchParams.get("experience") === "1";
    const forceSurvey = searchParams.get("survey") === "1";
    setShowWizard(forceWelcome || shouldShowWelcomeWizard());
    setShowActivation(
      activationEnabled &&
        !forceWelcome &&
        (forceActivation || shouldAutoOpenActivation()),
    );
    recordRetentionActivity();
    setShowSurvey(
      forceSurvey ||
        shouldShowRetentionSurvey(loadRetentionState(), isActivationCompleted()),
    );
  }, [activationEnabled, searchParams]);

  useEffect(() => {
    void Promise.resolve().then(() => {
      refreshExperienceState();
    });
  }, [refreshExperienceState]);

  const handleWizardComplete = useCallback(
    (options?: { startActivation?: boolean; activationHref?: string }) => {
      setShowWizard(false);
      if (activationEnabled && options?.startActivation !== false) {
        // Prefer dedicated route for mobile full-screen + deep-linkable flow.
        router.push(options?.activationHref ?? "/activation/weekly-report");
        return;
      }
      // Forbidden: settings-only ending. Soft-fallback still opens Quick Win.
      if (activationEnabled) {
        router.push("/activation/weekly-report");
        return;
      }
      setShowActivation(false);
    },
    [activationEnabled, router],
  );

  const handleActivationComplete = useCallback(() => {
    setShowActivation(false);
    reloadAutomations();
    setShowSurvey(
      shouldShowRetentionSurvey(loadRetentionState(), isActivationCompleted()),
    );
    router.replace("/projects");
  }, [reloadAutomations, router]);

  const handleActivationSkip = useCallback(() => {
    // Soft skip on overlay only — home still shows bootstrap + Quick Win CTA.
    setShowActivation(false);
  }, []);

  useEffect(() => {
    reloadAutomations();
  }, [reloadAutomations]);

  if (!isReady || flagsLoading) {
    return <LoadingState message={ui.secretaryProgress.preparing} />;
  }

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
      {showActivation && !showWizard && activationEnabled ? (
        <WeeklyReportActivation
          onComplete={handleActivationComplete}
          onSkip={handleActivationSkip}
        />
      ) : null}
      {showSurvey && !showWizard && !showActivation ? (
        <FirstDeliverableSurvey
          onClose={() => {
            setShowSurvey(false);
            router.replace("/projects");
          }}
        />
      ) : null}

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
