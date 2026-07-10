"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

import { fetchAutomations } from "@/lib/automations/client";
import type { Automation } from "@/lib/automations/types";
import { normalizeAutomations, normalizeProjects } from "@/lib/compatibility";
import { shouldShowFirstExperience, shouldShowFirstExperienceCard } from "@/lib/first-experience";
import { shouldShowWelcomeWizard } from "@/lib/onboarding";
import { useProjects } from "@/lib/projects/use-projects";
import type { Project } from "@/lib/projects/types";
import { ui } from "@/lib/i18n";
import { LoadingState } from "@/components/ui/loading-state";
import {
  HomeDashboardErrorBoundary,
  HomeWorkLoadError,
} from "@/components/home/home-dashboard-error-boundary";
import { HomeCollapsibleSection } from "@/components/home/home-collapsible-section";
import {
  HomeBriefRecommendationsSection,
  HomeEmployeesSection,
  HomeLearningSection,
  HomeYesterdaySection,
} from "@/components/home/home-daily-brief-sections";
import { HomeFirstExperienceCard } from "@/components/home/home-first-experience-card";
import { MorningBrief } from "@/components/home/morning-brief";
import { HomeInProgressPanel } from "@/components/home/home-in-progress-panel";
import { HomeMonthlyAchievements } from "@/components/home/home-monthly-achievements";
import { HomeNotificationsBadge } from "@/components/home/home-notifications-badge";
import { HomeNotificationsPreview } from "@/components/home/home-notifications-preview";
import { HomeRecentHistoryPanel } from "@/components/home/home-recent-history-panel";
import { HomeRecommendedPanel } from "@/components/home/home-recommended-panel";
import { HomeTodayWorkPanel } from "@/components/home/home-today-work-panel";
import { ProactiveSuggestionsPanel } from "@/components/home/proactive-suggestions-panel";
import { FirstSuccessExperience } from "@/components/onboarding/first-success-experience";
import { WelcomeWizard } from "@/components/onboarding/welcome-wizard";

type DashboardDataProps = {
  automations: Automation[];
  projects: Project[];
  profileVersion: number;
  onStartFirstExperience: () => void;
  showExperienceCard: boolean;
  onAutomationRun: () => void;
};

function HomeDashboardContent({
  automations,
  projects,
  profileVersion,
  onStartFirstExperience,
  showExperienceCard,
  onAutomationRun,
}: DashboardDataProps) {
  const briefProps = { automations, projects, profileVersion };

  return (
    <div className="home-dashboard space-y-6 pb-2 sm:pb-4 animate-fade-up">
      <MorningBrief
        {...briefProps}
        onAutomationRun={onAutomationRun}
      />

      <HomeTodayWorkPanel automations={automations} />

      <HomeInProgressPanel automations={automations} projects={projects} />

      <HomeRecentHistoryPanel />

      {showExperienceCard && (
        <HomeFirstExperienceCard onStart={onStartFirstExperience} />
      )}

      <HomeCollapsibleSection
        id="yesterday"
        title={ui.homeUx.collapseYesterday}
        subtitle={ui.dailyBrief.yesterdayTitle}
      >
        <HomeYesterdaySection {...briefProps} />
      </HomeCollapsibleSection>

      <HomeCollapsibleSection
        id="employees"
        title={ui.homeUx.collapseEmployees}
        subtitle={ui.dailyBrief.employeesTitle}
      >
        <HomeEmployeesSection {...briefProps} />
      </HomeCollapsibleSection>

      <HomeCollapsibleSection
        id="recommendations"
        title={ui.homeUx.collapseRecommendations}
        subtitle={ui.dailyBrief.recommendationsTitle}
      >
        <div className="space-y-6">
          <HomeBriefRecommendationsSection {...briefProps} />
          <ProactiveSuggestionsPanel automations={automations} embedded />
        </div>
      </HomeCollapsibleSection>

      <HomeCollapsibleSection
        id="learning"
        title={ui.homeUx.collapseLearning}
        subtitle={ui.dailyBrief.learningLabel}
      >
        <HomeLearningSection {...briefProps} />
      </HomeCollapsibleSection>

      <HomeCollapsibleSection
        id="notifications"
        title={ui.homeUx.collapseNotifications}
        badge={<HomeNotificationsBadge />}
      >
        <HomeNotificationsPreview />
      </HomeCollapsibleSection>

      <HomeCollapsibleSection
        id="integrations"
        title={ui.homeUx.collapseIntegrations}
      >
        <HomeRecommendedPanel key={profileVersion} variant="integrations" />
      </HomeCollapsibleSection>

      <HomeCollapsibleSection id="stats" title={ui.homeUx.collapseStats}>
        <HomeMonthlyAchievements
          projects={projects}
          automations={automations}
          embedded
        />
      </HomeCollapsibleSection>
    </div>
  );
}

export function ProjectsDashboard() {
  const searchParams = useSearchParams();
  const { projects: rawProjects, isReady } = useProjects();
  const projects = normalizeProjects(rawProjects);
  const [automations, setAutomations] = useState<Automation[]>([]);
  const [automationsError, setAutomationsError] = useState(false);
  const [showWizard, setShowWizard] = useState(false);
  const [showFirstExperience, setShowFirstExperience] = useState(false);
  const [showExperienceCard, setShowExperienceCard] = useState(false);
  const [profileVersion, setProfileVersion] = useState(0);

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
      !forceWelcome &&
        (forceExperience || shouldShowFirstExperience()),
    );
    setShowExperienceCard(shouldShowFirstExperienceCard());
    setProfileVersion((value) => value + 1);
  }, [searchParams]);

  useEffect(() => {
    refreshExperienceState();
  }, [refreshExperienceState]);

  const handleWizardComplete = useCallback(() => {
    setShowWizard(false);
    if (shouldShowFirstExperience()) {
      setShowFirstExperience(true);
    }
    setShowExperienceCard(shouldShowFirstExperienceCard());
    setProfileVersion((value) => value + 1);
  }, []);

  const handleFirstExperienceComplete = useCallback(() => {
    setShowFirstExperience(false);
    setShowExperienceCard(false);
    setProfileVersion((value) => value + 1);
  }, []);

  const handleFirstExperienceDefer = useCallback(() => {
    setShowFirstExperience(false);
    setShowExperienceCard(true);
    setProfileVersion((value) => value + 1);
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
        <HomeDashboardContent
          automations={automations}
          projects={projects}
          profileVersion={profileVersion}
          showExperienceCard={showExperienceCard && !showFirstExperience}
          onStartFirstExperience={() => setShowFirstExperience(true)}
          onAutomationRun={reloadAutomations}
        />
      )}
    </HomeDashboardErrorBoundary>
  );
}
