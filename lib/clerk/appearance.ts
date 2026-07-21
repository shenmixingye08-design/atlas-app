import type { ResolvedTheme } from "@/lib/theme/types";

type ClerkAppearance = {
  variables: Record<string, string>;
  elements: Record<string, string>;
};

const LIGHT: ClerkAppearance = {
  variables: {
    colorBackground: "#FFF7F0",
    colorText: "#2B2118",
    colorTextSecondary: "#6B5A49",
    colorPrimary: "#B8860B",
    colorDanger: "#9A1C33",
    colorSuccess: "#8B6914",
    colorInputBackground: "#FFF9F2",
    colorInputText: "#2B2118",
    borderRadius: "12px",
  },
  elements: {
    rootBox: "mx-auto w-full",
    card: "bg-transparent shadow-none border-0",
    headerTitle: "text-[var(--text-primary)]",
    headerSubtitle: "text-[var(--text-secondary)]",
    socialButtonsBlockButton:
      "border border-[var(--border)] bg-[var(--surface-muted)] text-[var(--text-primary)] hover:bg-[var(--secondary-hover)]",
    formButtonPrimary: "bg-[var(--accent)] hover:bg-[var(--accent-hover)]",
    footerActionLink: "text-[var(--accent)] hover:text-[var(--accent-hover)]",
    formFieldInput:
      "border-[var(--border)] bg-[var(--surface-muted)] text-[var(--text-primary)] focus:border-[var(--accent)]",
    identityPreviewEditButton: "text-[var(--accent)]",
    userButtonPopoverCard:
      "border border-[var(--border)] bg-[var(--card)] shadow-lg",
    userButtonPopoverActionButton:
      "text-[var(--text-primary)] hover:bg-[var(--surface-muted)]",
    userButtonPopoverActionButtonText: "text-[var(--text-primary)]",
    userButtonPopoverFooter: "hidden",
  },
};

const DARK: ClerkAppearance = {
  variables: {
    colorBackground: "#171A21",
    colorText: "#FFFFFF",
    colorTextSecondary: "#A1A1AA",
    colorPrimary: "#0071e3",
    colorDanger: "#ff453a",
    colorSuccess: "#30d158",
    colorInputBackground: "#0F1115",
    colorInputText: "#FFFFFF",
    borderRadius: "12px",
  },
  elements: {
    rootBox: "mx-auto w-full",
    card: "bg-transparent shadow-none border-0",
    headerTitle: "text-[var(--text-primary)]",
    headerSubtitle: "text-[var(--text-secondary)]",
    socialButtonsBlockButton:
      "border border-[var(--border)] bg-[var(--surface-muted)] text-[var(--text-primary)] hover:bg-[var(--secondary-hover)]",
    formButtonPrimary: "bg-[var(--accent)] hover:bg-[var(--accent-hover)]",
    footerActionLink: "text-[var(--accent)] hover:text-[var(--accent-hover)]",
    formFieldInput:
      "border-[var(--border)] bg-[var(--surface-muted)] text-[var(--text-primary)] focus:border-[var(--accent)]",
    identityPreviewEditButton: "text-[var(--accent)]",
    userButtonPopoverCard:
      "border border-[var(--border)] bg-[var(--card)] shadow-lg",
    userButtonPopoverActionButton:
      "text-[var(--text-primary)] hover:bg-[var(--surface-muted)]",
    userButtonPopoverActionButtonText: "text-[var(--text-primary)]",
    userButtonPopoverFooter: "hidden",
  },
};

/** Default light appearance (SSR / static fallback). */
export const atlasClerkAppearance = LIGHT;

export function getAtlasClerkAppearance(
  resolved: ResolvedTheme = "light",
): ClerkAppearance {
  if (resolved === "dark") return DARK;
  return LIGHT;
}
