"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

import { fetchAutomations } from "@/lib/automations/client";
import type { Automation } from "@/lib/automations/types";
import { normalizeAutomations, normalizeProjects } from "@/lib/compatibility";
import { shouldShowFirstExperience, shouldShowFirstExperienceCard } from "@/lib/first-experience";
import { shouldShowWelcomeWizard } from "@/lib/onboarding";
import { useProjects } from "@/lib/projects/use-projects";
import { LoadingState } from "@/components/ui/loading-state";
import {
  HomeDashboardErrorBoundary,
  HomeWorkLoadError,
} from "@/components/home/home-dashboard-error-boundary";
import { HomeFirstExperienceCard } from "@/components/home/home-first-experience-card";
import { SecretaryHomeDashboard } from "@/components/home/secretary-home-dashboard";
import { FirstSuccessExperience } from "@/components/onboarding/first-success-experience";
import { WelcomeWizard } from "@/components/onboarding/welcome-wizard";

export function ProjectsDashboard() {
  const searchParams = useSearchParams();
  const { projects: rawProjects, isReady } = useProjects();
  const projects = normalizeProjects(rawProjects);
  const [automations, setAutomations] = useState<Automation[]>([]);
  const [automationsError, setAutomationsError] = useState(false);
  const [showWizard, setShowWizard] = useState(false);
  const [showFirstExperience, setShowFirstExperience] = useState(false);
  const [showExperienceCard, setShowExperienceCard] = useState(false);

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
    setShowExperienceCard(shouldShowFirstExperienceCard());
  }, [searchParams]);

  useEffect(() => {
    refreshExperienceState();
  }, [refreshExperienceState]);

  const handleWizardComplete = useCallback(() => {
    setShowWizard(false);
    // オンボーディング完了後は説明のみ。ダミー業務・架空体験は自動表示しない。
    setShowFirstExperience(false);
    setShowExperienceCard(shouldShowFirstExperienceCard());
  }, []);

  const handleFirstExperienceComplete = useCallback(() => {
    setShowFirstExperience(false);
    setShowExperienceCard(false);
  }, []);

  const handleFirstExperienceDefer = useCallback(() => {
    setShowFirstExperience(false);
    setShowExperienceCard(true);
  }, []);

  useEffect(() => {
    reloadAutomations();
  }, [reloadAutomations]);

  if (!isReady) {
    return <LoadingState />;
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
          {showExperienceCard && (
            <HomeFirstExperienceCard onStart={() => setShowFirstExperience(true)} />
          )}
          <HomeWorkLoadError
            onRetry={() => {
              setAutomationsError(false);
              reloadAutomations();
            }}
          />
        </div>
      ) : (
        <div className="space-y-8">
          {showExperienceCard && !showFirstExperience && (
            <HomeFirstExperienceCard onStart={() => setShowFirstExperience(true)} />
          )}
          <SecretaryHomeDashboard automations={automations} projects={projects} />
        </div>
      )}
    </HomeDashboardErrorBoundary>
  );
}
