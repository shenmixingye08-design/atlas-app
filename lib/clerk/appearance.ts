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
  colorText: "#2a211c",
  colorTextSecondary: "#534840",
  colorTextOnPrimaryBackground: "#ffffff",
  colorPrimary: "#b54438",
  colorDanger: "#c4332e",
  colorSuccess: "#2f6a4d",
  colorWarning: "#9a6b1f",
  colorNeutral: "#6a5f57",
  colorInputBackground: "#f4eee8",
  colorInputText: "#2a211c",
  colorShimmer: "#efe8e2",
  borderRadius: "12px",
} as const;

const DARK_VARS = {
  colorBackground: "#171a21",
  colorText: "#ffffff",
  colorTextSecondary: "#c7c7cc",
  colorTextOnPrimaryBackground: "#1a0e12",
  colorPrimary: "#e89a8c",
  colorDanger: "#ff453a",
  colorSuccess: "#7dba98",
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
  card: "w-full border-0 bg-[#ffffff] text-[#2a211c] shadow-none",
  headerTitle: "text-[#2a211c]",
  headerSubtitle: "text-[#534840]",
  socialButtonsBlockButton:
    "border border-[rgba(42,33,28,0.08)] bg-[#f4eee8] text-[#2a211c] hover:bg-[#efe8e2]",
  socialButtonsBlockButtonText: "text-[#2a211c]",
  dividerLine: "bg-[rgba(42,33,28,0.08)]",
  dividerText: "text-[#534840]",
  formFieldLabel: "text-[#2a211c]",
  formFieldHintText: "text-[#534840]",
  formFieldInput:
    "border-[rgba(42,33,28,0.08)] bg-[#f4eee8] text-[#2a211c] placeholder:text-[#6a5f57] focus:border-[#b54438]",
  formButtonPrimary: "bg-[#b54438] text-[#ffffff] hover:bg-[#97392f]",
  footer: "text-[#534840]",
  footerActionText: "text-[#534840]",
  footerActionLink: "text-[#b54438] hover:text-[#97392f]",
  footerPages: "text-[#534840]",
  footerPagesLink: "text-[#534840] hover:text-[#b54438]",
  identityPreviewText: "text-[#2a211c]",
  identityPreviewEditButton: "text-[#b54438]",
  userButtonPopoverCard:
    "border border-[rgba(42,33,28,0.08)] bg-[#ffffff] text-[#2a211c] shadow-lg",
  userButtonPopoverActionButton: "text-[#2a211c] hover:bg-[#f4eee8]",
  userButtonPopoverActionButtonText: "text-[#2a211c]",
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
    "border-[rgba(255,255,255,0.1)] bg-[#1c2028] text-[#ffffff] placeholder:text-[#8e8e93] focus:border-[#e89a8c]",
  formButtonPrimary: "bg-[#e89a8c] text-[#1a0e12] hover:bg-[#f0b4a8]",
  footer: "text-[#c7c7cc]",
  footerActionText: "text-[#c7c7cc]",
  footerActionLink: "text-[#e89a8c] hover:text-[#f0b4a8]",
  footerPages: "text-[#c7c7cc]",
  footerPagesLink: "text-[#c7c7cc] hover:text-[#e89a8c]",
  identityPreviewText: "text-[#ffffff]",
  identityPreviewEditButton: "text-[#e89a8c]",
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
