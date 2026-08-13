import type { ResolvedTheme } from "@/lib/theme/types";

export type ClerkAppearance = {
  variables: Record<string, string>;
  elements: Record<string, string>;
};

/**
 * Hex copies of MINERVOT theme tokens for Clerk.
 *
 * Clerk `variables` must stay self-contained. Do not reference
 * `var(--text-primary)` (and similar) in `elements`, or LIGHT Clerk
 * variables mix with DARK document CSS variables and text becomes
 * unreadable.
 */
const LIGHT_VARS = {
  colorBackground: "#ffffff",
  colorText: "#281a1e",
  colorTextSecondary: "#75686b",
  colorTextOnPrimaryBackground: "#ffffff",
  colorPrimary: "#74172a",
  colorDanger: "#c40014",
  colorSuccess: "#5f1222",
  colorWarning: "#75686b",
  colorNeutral: "#75686b",
  colorInputBackground: "#faf6f5",
  colorInputText: "#281a1e",
  colorShimmer: "#f0ebea",
  borderRadius: "12px",
} as const;

const DARK_VARS = {
  colorBackground: "#171a21",
  colorText: "#ffffff",
  colorTextSecondary: "#c7c7cc",
  colorTextOnPrimaryBackground: "#1a0e12",
  colorPrimary: "#c48a96",
  colorDanger: "#ff453a",
  colorSuccess: "#c48a96",
  colorWarning: "#d4b07a",
  colorNeutral: "#c7c7cc",
  colorInputBackground: "#1c2028",
  colorInputText: "#ffffff",
  colorShimmer: "#262b33",
  borderRadius: "12px",
} as const;

/** Layout-only classes shared by both themes (no color tokens). */
const LAYOUT_ELEMENTS = {
  rootBox: "mx-auto w-full max-w-full",
  userButtonPopoverFooter: "hidden",
} as const;

/**
 * Light element colors are complete Tailwind class literals so the scanner
 * can emit them. Hex values match LIGHT_VARS / MINERVOT :root — not CSS vars.
 */
const LIGHT_ELEMENTS: Record<string, string> = {
  ...LAYOUT_ELEMENTS,
  card: "w-full border-0 bg-[#ffffff] text-[#281a1e] shadow-none",
  headerTitle: "text-[#281a1e]",
  headerSubtitle: "text-[#75686b]",
  socialButtonsBlockButton:
    "border border-[rgba(40,26,30,0.08)] bg-[#faf6f5] text-[#281a1e] hover:bg-[#f5f1f0]",
  socialButtonsBlockButtonText: "text-[#281a1e]",
  dividerLine: "bg-[rgba(40,26,30,0.08)]",
  dividerText: "text-[#75686b]",
  formFieldLabel: "text-[#281a1e]",
  formFieldHintText: "text-[#75686b]",
  formFieldInput:
    "border-[rgba(40,26,30,0.08)] bg-[#faf6f5] text-[#281a1e] placeholder:text-[#9a8d90] focus:border-[#74172a]",
  formButtonPrimary: "bg-[#74172a] text-[#ffffff] hover:bg-[#5d1020]",
  footer: "text-[#75686b]",
  footerActionText: "text-[#75686b]",
  footerActionLink: "text-[#74172a] hover:text-[#5d1020]",
  footerPages: "text-[#75686b]",
  footerPagesLink: "text-[#75686b] hover:text-[#74172a]",
  identityPreviewText: "text-[#281a1e]",
  identityPreviewEditButton: "text-[#74172a]",
  userButtonPopoverCard:
    "border border-[rgba(40,26,30,0.08)] bg-[#ffffff] text-[#281a1e] shadow-lg",
  userButtonPopoverActionButton: "text-[#281a1e] hover:bg-[#faf6f5]",
  userButtonPopoverActionButtonText: "text-[#281a1e]",
};

const DARK_ELEMENTS: Record<string, string> = {
  ...LAYOUT_ELEMENTS,
  card: "w-full border-0 bg-[#171a21] text-[#ffffff] shadow-none",
  headerTitle: "text-[#ffffff]",
  headerSubtitle: "text-[#c7c7cc]",
  socialButtonsBlockButton:
    "border border-[rgba(255,255,255,0.1)] bg-[#1c2028] text-[#ffffff] hover:bg-[#252a33]",
  socialButtonsBlockButtonText: "text-[#ffffff]",
  dividerLine: "bg-[rgba(255,255,255,0.1)]",
  dividerText: "text-[#c7c7cc]",
  formFieldLabel: "text-[#ffffff]",
  formFieldHintText: "text-[#c7c7cc]",
  formFieldInput:
    "border-[rgba(255,255,255,0.1)] bg-[#1c2028] text-[#ffffff] placeholder:text-[#8e8e93] focus:border-[#c48a96]",
  formButtonPrimary: "bg-[#c48a96] text-[#1a0e12] hover:bg-[#d4a3ad]",
  footer: "text-[#c7c7cc]",
  footerActionText: "text-[#c7c7cc]",
  footerActionLink: "text-[#c48a96] hover:text-[#d4a3ad]",
  footerPages: "text-[#c7c7cc]",
  footerPagesLink: "text-[#c7c7cc] hover:text-[#c48a96]",
  identityPreviewText: "text-[#ffffff]",
  identityPreviewEditButton: "text-[#c48a96]",
  userButtonPopoverCard:
    "border border-[rgba(255,255,255,0.1)] bg-[#171a21] text-[#ffffff] shadow-lg",
  userButtonPopoverActionButton: "text-[#ffffff] hover:bg-[#1c2028]",
  userButtonPopoverActionButtonText: "text-[#ffffff]",
};

const LIGHT: ClerkAppearance = {
  variables: { ...LIGHT_VARS },
  elements: LIGHT_ELEMENTS,
};

const DARK: ClerkAppearance = {
  variables: { ...DARK_VARS },
  elements: DARK_ELEMENTS,
};

/** SSR / first-paint fallback. Matches ThemeProvider's initial `resolved="light"`. */
export const atlasClerkAppearance = LIGHT;

export function getAtlasClerkAppearance(
  resolved: ResolvedTheme = "light",
): ClerkAppearance {
  if (resolved === "dark") return DARK;
  return LIGHT;
}

const THEME_CSS_VAR_RE = /var\(--[A-Za-z0-9-]+\)/;

/** True when Clerk appearance still references MINERVOT global CSS variables. */
export function clerkAppearanceMixesThemeCssVars(
  appearance: ClerkAppearance,
): boolean {
  return THEME_CSS_VAR_RE.test(JSON.stringify(appearance));
}
