import { describe, expect, it, vi, beforeEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import React from "react";

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/projects",
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
}));
vi.mock("next/link", () => ({
  default: ({
    children,
    href,
  }: {
    children: React.ReactNode;
    href: string;
  }) => React.createElement("a", { href }, children),
}));
vi.mock("@/lib/projects/use-projects", () => ({
  useProjects: () => ({ projects: [], isReady: true }),
}));
vi.mock("@/lib/automations/client", () => ({
  fetchAutomations: vi.fn(async () => []),
}));
vi.mock("@/lib/feature-flags", () => ({
  useFeatureAvailability: vi.fn(),
}));
vi.mock("@/components/automation-first/automation-first-home", () => ({
  AutomationFirstHome: () =>
    React.createElement(
      "div",
      { "data-testid": "automation-first-home" },
      "AF Home",
    ),
}));
vi.mock("@/components/home/secretary-home-dashboard", () => ({
  SecretaryHomeDashboard: () =>
    React.createElement(
      "div",
      { "data-testid": "secretary-home" },
      "Legacy Home",
    ),
}));
vi.mock("@/components/ui/loading-state", () => ({
  LoadingState: ({ message }: { message?: string }) =>
    React.createElement(
      "div",
      { "data-testid": "loading" },
      message ?? "loading",
    ),
}));
vi.mock("@/components/home/home-dashboard-error-boundary", () => ({
  HomeDashboardErrorBoundary: ({
    children,
  }: {
    children: React.ReactNode;
  }) => React.createElement(React.Fragment, null, children),
  HomeWorkLoadError: ({ onRetry }: { onRetry: () => void }) =>
    React.createElement(
      "button",
      { "data-testid": "flags-error", onClick: onRetry },
      "retry",
    ),
}));
vi.mock("@/components/onboarding/welcome-wizard", () => ({
  WelcomeWizard: () => null,
}));
vi.mock("@/components/onboarding/first-success-experience", () => ({
  FirstSuccessExperience: () => null,
}));

import { useFeatureAvailability } from "@/lib/feature-flags";
import { ProjectsDashboard } from "@/components/projects/projects-dashboard";
import { ATLAS_APP_HOME_PATH } from "@/lib/auth/public-routes";

describe("formal Automation First home on /projects", () => {
  beforeEach(() => {
    vi.mocked(useFeatureAvailability).mockReset();
  });

  it("uses /projects as the formal post-login home path", () => {
    expect(ATLAS_APP_HOME_PATH).toBe("/projects");
  });

  it("shows loading while flags load — never legacy home", () => {
    vi.mocked(useFeatureAvailability).mockReturnValue({
      flags: { automation_first_home_enabled: false } as never,
      loading: true,
      error: null,
      reload: vi.fn(),
      isAvailable: () => false,
    });
    const html = renderToStaticMarkup(
      React.createElement(ProjectsDashboard),
    );
    expect(html).toContain('data-testid="loading"');
    expect(html).not.toContain("secretary-home");
    expect(html).not.toContain("automation-first-home");
  });

  it("renders Automation First home when flag is on", () => {
    vi.mocked(useFeatureAvailability).mockReturnValue({
      flags: { automation_first_home_enabled: true } as never,
      loading: false,
      error: null,
      reload: vi.fn(),
      isAvailable: () => true,
    });
    const html = renderToStaticMarkup(
      React.createElement(ProjectsDashboard),
    );
    expect(html).toContain("automation-first-home");
    expect(html).not.toContain("secretary-home");
  });

  it("falls back to legacy home only when flag is explicitly off", () => {
    vi.mocked(useFeatureAvailability).mockReturnValue({
      flags: { automation_first_home_enabled: false } as never,
      loading: false,
      error: null,
      reload: vi.fn(),
      isAvailable: () => false,
    });
    const html = renderToStaticMarkup(
      React.createElement(ProjectsDashboard),
    );
    expect(html).toContain("secretary-home");
    expect(html).not.toContain("automation-first-home");
  });

  it("does not show legacy home when flag fetch failed without AF", () => {
    vi.mocked(useFeatureAvailability).mockReturnValue({
      flags: { automation_first_home_enabled: false } as never,
      loading: false,
      error: "network",
      reload: vi.fn(),
      isAvailable: () => false,
    });
    const html = renderToStaticMarkup(
      React.createElement(ProjectsDashboard),
    );
    expect(html).toContain("flags-error");
    expect(html).not.toContain("secretary-home");
  });
});
