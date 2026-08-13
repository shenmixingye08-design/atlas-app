import { describe, expect, it } from "vitest";

import {
  atlasClerkAppearance,
  clerkAppearanceMixesThemeCssVars,
  getAtlasClerkAppearance,
} from "@/lib/clerk/appearance";

const REQUIRED_ELEMENTS = [
  "headerTitle",
  "headerSubtitle",
  "socialButtonsBlockButton",
  "socialButtonsBlockButtonText",
  "dividerLine",
  "dividerText",
  "formFieldLabel",
  "formFieldInput",
  "formButtonPrimary",
  "footer",
  "footerActionLink",
  "footerActionText",
] as const;

function hexToRgb(hex: string): [number, number, number] {
  const raw = hex.replace("#", "");
  const normalized =
    raw.length === 3
      ? raw
          .split("")
          .map((char) => `${char}${char}`)
          .join("")
      : raw;
  const value = Number.parseInt(normalized, 16);
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

describe("getAtlasClerkAppearance", () => {
  it("uses a self-contained light palette by default and for light-warm", () => {
    const light = getAtlasClerkAppearance("light");
    const warm = getAtlasClerkAppearance("light-warm");
    expect(light).toBe(atlasClerkAppearance);
    expect(warm).toBe(light);
    expect(clerkAppearanceMixesThemeCssVars(light)).toBe(false);
  });

  it("uses a self-contained dark palette", () => {
    const dark = getAtlasClerkAppearance("dark");
    expect(dark).not.toBe(getAtlasClerkAppearance("light"));
    expect(clerkAppearanceMixesThemeCssVars(dark)).toBe(false);
  });

  it("covers SignIn / SignUp visibility targets in both themes", () => {
    for (const theme of ["light", "dark"] as const) {
      const appearance = getAtlasClerkAppearance(theme);
      for (const key of REQUIRED_ELEMENTS) {
        expect(appearance.elements[key]).toBeTruthy();
      }
    }
  });

  it("keeps light mode bright with dark readable text", () => {
    const light = getAtlasClerkAppearance("light");
    const { colorBackground, colorText, colorInputBackground, colorInputText } =
      light.variables;

    expect(relativeLuminance(colorBackground)).toBeGreaterThan(0.8);
    expect(relativeLuminance(colorText)).toBeLessThan(0.2);
    expect(contrastRatio(colorText, colorBackground)).toBeGreaterThan(7);
    expect(contrastRatio(colorInputText, colorInputBackground)).toBeGreaterThan(
      7,
    );
    expect(light.elements.socialButtonsBlockButton).toContain("bg-[#faf6f5]");
    expect(light.elements.socialButtonsBlockButtonText).toContain(
      "text-[#281a1e]",
    );
    expect(light.elements.formButtonPrimary).toContain("bg-[#74172a]");
    expect(light.elements.formButtonPrimary).toContain("text-[#ffffff]");
  });

  it("keeps dark mode dark with light readable text, inputs, and Google button", () => {
    const dark = getAtlasClerkAppearance("dark");
    const { colorBackground, colorText, colorInputBackground, colorInputText } =
      dark.variables;

    expect(relativeLuminance(colorBackground)).toBeLessThan(0.15);
    expect(relativeLuminance(colorText)).toBeGreaterThan(0.8);
    expect(contrastRatio(colorText, colorBackground)).toBeGreaterThan(7);
    expect(relativeLuminance(colorInputBackground)).toBeLessThan(0.15);
    expect(contrastRatio(colorInputText, colorInputBackground)).toBeGreaterThan(
      7,
    );
    expect(dark.elements.card).toContain("bg-[#171a21]");
    expect(dark.elements.headerTitle).toContain("text-[#ffffff]");
    expect(dark.elements.socialButtonsBlockButton).toContain("bg-[#1c2028]");
    expect(dark.elements.socialButtonsBlockButtonText).toContain(
      "text-[#ffffff]",
    );
    expect(dark.elements.formFieldInput).toContain("bg-[#1c2028]");
    expect(dark.elements.formFieldInput).toContain("text-[#ffffff]");
    expect(dark.elements.formButtonPrimary).toContain("bg-[#c48a96]");
  });

  it("does not mix Clerk variables with MINERVOT CSS variables in elements", () => {
    const lightBlob = JSON.stringify(getAtlasClerkAppearance("light"));
    const darkBlob = JSON.stringify(getAtlasClerkAppearance("dark"));
    expect(lightBlob).not.toMatch(/var\(--/);
    expect(darkBlob).not.toMatch(/var\(--/);
    expect(lightBlob).not.toContain("--text-primary");
    expect(darkBlob).not.toContain("--surface-muted");
  });
});
