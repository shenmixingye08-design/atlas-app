import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  COLORS,
  COLORS_LUX,
  MOTION,
  RADIUS,
  SHADOW,
  SPACING,
  TYPOGRAPHY,
} from "@/lib/design-system/tokens";
import { clerkAppearanceMixesThemeCssVars, getAtlasClerkAppearance } from "@/lib/clerk/appearance";

const ROOT = process.cwd();

function src(relative: string): string {
  return readFileSync(join(ROOT, relative), "utf8");
}

function hexToRgb(hex: string): [number, number, number] {
  const raw = hex.replace("#", "");
  const value = Number.parseInt(raw, 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

function relativeLuminance(hex: string): number {
  const channels = hexToRgb(hex).map((channel) => {
    const srgb = channel / 255;
    return srgb <= 0.03928 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function contrastRatio(foreground: string, background: string): number {
  const a = relativeLuminance(foreground);
  const b = relativeLuminance(background);
  const [hi, lo] = a > b ? [a, b] : [b, a];
  return (hi + 0.05) / (lo + 0.05);
}

describe("Warm Minimal design tokens", () => {
  it("defines the required semantic color keys", () => {
    for (const key of [
      "background",
      "surface",
      "surfaceRaised",
      "surfaceMuted",
      "textPrimary",
      "textSecondary",
      "textTertiary",
      "border",
      "borderStrong",
      "primary",
      "primaryHover",
      "primaryPressed",
      "accentGold",
      "success",
      "warning",
      "error",
      "info",
      "focusRing",
      "overlay",
    ] as const) {
      expect(COLORS[key]).toMatch(/^#|^rgba/);
    }
  });

  it("keeps success semantic green, not brand wine", () => {
    expect(COLORS.success.toLowerCase()).not.toBe("#74172a");
    expect(COLORS.success.toLowerCase()).not.toBe("#5f1222");
    expect(COLORS.primary.toLowerCase()).toBe("#b54438");
    expect(COLORS_LUX.primary).toBe(COLORS.primary);
    expect(COLORS.success).toBe("#2f6a4d");
  });

  it("keeps ink text readable on the warm off-white background", () => {
    expect(contrastRatio(COLORS.textPrimary, COLORS.background)).toBeGreaterThan(
      7,
    );
    expect(
      contrastRatio(COLORS.textSecondary, COLORS.background),
    ).toBeGreaterThan(4.5);
    expect(contrastRatio("#ffffff", COLORS.primary)).toBeGreaterThan(4.5);
  });

  it("uses a 4px spacing scale and hierarchical radius/shadow/type", () => {
    expect(SPACING[1]).toBe(4);
    expect(SPACING[2]).toBe(8);
    expect(RADIUS.small).toBe("8px");
    expect(RADIUS.card).toBe("20px");
    expect(RADIUS.modal).toBe("24px");
    expect(SHADOW.subtle).toContain("0.04");
    expect(TYPOGRAPHY.heading1).toBe("1.5rem");
    expect(TYPOGRAPHY.body).toBe("0.9375rem");
    expect(MOTION.fast).toContain("140ms");
    expect(MOTION.normal).toContain("200ms");
  });

  it("mirrors the same token names in globals.css", () => {
    const css = src("app/globals.css");
    for (const token of [
      "--background",
      "--surface",
      "--surface-raised",
      "--surface-muted",
      "--text-primary",
      "--text-secondary",
      "--text-tertiary",
      "--border-subtle",
      "--border-strong",
      "--primary",
      "--primary-hover",
      "--primary-pressed",
      "--accent-gold",
      "--success",
      "--warning",
      "--danger",
      "--info",
      "--focus-ring",
      "--overlay",
      "--radius-small",
      "--radius-card",
      "--shadow-subtle",
      "--motion-fast",
      "--easing-standard",
      "--spring-soft",
    ]) {
      expect(css).toContain(`${token}:`);
    }
    expect(css).toContain("oklch(");
    expect(css).toContain("prefers-reduced-motion");
    expect(css).toContain("prefers-reduced-transparency");
    expect(css).toContain("--touch-target: 44px");
    expect(css).toContain("--safe-area-bottom");
    expect(css).not.toMatch(/#74172a/i);
    expect(css).not.toMatch(/#5f1222/i);
  });
});

describe("Warm Minimal UI contracts", () => {
  it("keeps Clerk appearance self-contained with coral hex, not CSS vars", () => {
    const light = getAtlasClerkAppearance("light");
    const dark = getAtlasClerkAppearance("dark");
    expect(clerkAppearanceMixesThemeCssVars(light)).toBe(false);
    expect(clerkAppearanceMixesThemeCssVars(dark)).toBe(false);
    expect(light.variables.colorPrimary).toBe("#b54438");
    expect(light.variables.colorSuccess).toBe("#2f6a4d");
    expect(JSON.stringify(light)).not.toMatch(/var\(--/);
    expect(JSON.stringify(dark)).not.toMatch(/var\(--/);
  });

  it("associates input errors and keeps 44px tap targets on shared controls", () => {
    const input = src("components/ui/input.tsx");
    const button = src("components/ui/button.tsx");
    const bottomNav = src("components/layout/atlas-bottom-nav.tsx");
    const afNav = src("components/automation-first/automation-first-bottom-nav.tsx");
    expect(input).toContain("aria-describedby");
    expect(input).toContain('role="alert"');
    expect(button).toContain("min-h-[44px]");
    expect(bottomNav).toContain("min-h-[56px]");
    expect(bottomNav).toContain("safe-area-inset-bottom");
    expect(afNav).toContain("--safe-area-bottom");
    expect(afNav).not.toContain("backdrop-blur-xl");
  });

  it("does not change navigation destinations while modernizing chrome", () => {
    const bottomNav = src("components/layout/atlas-bottom-nav.tsx");
    const homeActions = src("components/automation-first/home-primary-actions.tsx");
    const request = src("components/workspace/work-request-form.tsx");
    expect(bottomNav).toContain('href: "/projects"');
    expect(bottomNav).toContain('href: "/history"');
    expect(bottomNav).toContain('href: "/workspace"');
    expect(bottomNav).toContain('href: "/automations"');
    expect(bottomNav).toContain('href: "/settings"');
    expect(homeActions).toContain("HOME_X_AUTOMATION_HREF");
    expect(homeActions).toContain("HOME_OTHER_WORK_HREF");
    expect(request).toContain("buildWorkRequestSubmitPayload");
    expect(request).toContain("rounded-[var(--radius-large)]");
  });

  it("removes Heisei wine/gold chrome from landing and shared chrome", () => {
    const landingPage = src("components/landing/landing-page.tsx");
    const hero = src("components/landing/landing-hero-section.tsx");
    expect(landingPage).not.toMatch(/#74172a|#B58B4F|#5F1222/i);
    expect(hero).not.toMatch(/#74172a|#B58B4F|#5F1222/i);
    expect(hero).toContain('href="/sign-up"');
    expect(landingPage).not.toContain("backdrop-blur-2xl");
  });
});
