import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

function readWorkspaceFile(relativePath: string): string {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

function themeToggleCount(source: string): number {
  return (source.match(/<ThemeToggle/g) ?? []).length;
}

describe("ThemeToggle placement (existing Theme SoT)", () => {
  it("reuses the existing ThemeToggle and ThemeProvider", () => {
    const toggle = readWorkspaceFile("components/theme/theme-toggle.tsx");
    expect(toggle).toContain('from "@/components/theme/theme-provider"');
    expect(toggle).toContain("useTheme");
    expect(toggle).toContain("toggleLightDark");
    expect(toggle).toContain("ui.theme.switchToLight");
    expect(toggle).toContain("ui.theme.switchToDark");
    expect(toggle).toContain("min-h-[44px]");
    expect(toggle).toContain("min-w-[44px]");
    expect(toggle).toContain("aria-label");

    const provider = readWorkspaceFile("components/theme/theme-provider.tsx");
    expect(provider).toContain("readStoredThemePreference");
    expect(provider).toContain("writeStoredThemePreference");
    expect(provider).toContain("resolveTheme");

    const root = readWorkspaceFile("app/layout.tsx");
    expect(root).toContain("THEME_BOOT_SCRIPT");
    expect(root).toContain("AppProviders");

    const providers = readWorkspaceFile("components/providers/app-providers.tsx");
    expect(providers).toContain("<ThemeProvider>");
    expect(providers).not.toMatch(/createContext|localStorage\.setItem/);
  });

  it("shows ThemeToggle once on the public landing header", () => {
    const landing = readWorkspaceFile("components/landing/landing-page.tsx");
    expect(landing).toContain('from "@/components/theme/theme-toggle"');
    expect(themeToggleCount(landing)).toBe(1);
    expect(landing).toContain("<ThemeToggle />");
    expect(landing).toContain("<AtlasLandingAuth />");
  });

  it("keeps a single ThemeToggle on sign-in / sign-up via AuthShell", () => {
    const shell = readWorkspaceFile("components/auth/auth-shell.tsx");
    expect(themeToggleCount(shell)).toBe(1);

    const signIn = readWorkspaceFile("components/auth/sign-in-page-client.tsx");
    const signUp = readWorkspaceFile("components/auth/sign-up-page-client.tsx");
    const signUpPage = readWorkspaceFile("app/sign-up/[[...sign-up]]/page.tsx");
    expect(signIn).not.toContain("ThemeToggle");
    expect(signUp).not.toContain("ThemeToggle");
    expect(signUpPage).not.toContain("ThemeToggle");
    expect(signIn).toContain("AuthShell");
    expect(signUpPage).toContain("AuthShell");
    expect(signUp).toContain("<SignUp");
  });

  it("renders ThemeToggle once from the shared logged-in chrome", () => {
    const actions = readWorkspaceFile("components/layout/atlas-top-actions.tsx");
    expect(actions).toContain('from "@/components/theme/theme-toggle"');
    expect(themeToggleCount(actions)).toBe(1);
    expect(actions.indexOf("<ThemeToggle")).toBeLessThan(
      actions.indexOf("<NotificationBell"),
    );
    expect(actions.indexOf("<NotificationBell")).toBeLessThan(
      actions.indexOf("<AtlasHeaderAuth"),
    );

    const shell = readWorkspaceFile("components/layout/atlas-app-shell.tsx");
    expect(shell).toContain("<AtlasTopActions />");
    expect(shell).not.toContain("ThemeToggle");

    const sidebar = readWorkspaceFile("components/layout/atlas-sidebar.tsx");
    expect(sidebar).toContain("<AtlasTopActions />");
    expect(sidebar).not.toContain("ThemeToggle");
  });

  it("does not add a second theme store or per-page ThemeToggle on major app pages", () => {
    const pages = [
      "app/today/page.tsx",
      "app/automations/page.tsx",
      "app/workspace/page.tsx",
      "app/settings/page.tsx",
      "app/history/page.tsx",
      "app/projects/page.tsx",
    ];
    for (const page of pages) {
      const src = readWorkspaceFile(page);
      expect(src).toContain("AtlasAppShell");
      expect(src).not.toContain("ThemeToggle");
      expect(src).not.toContain("ThemeProvider");
    }
  });
});
