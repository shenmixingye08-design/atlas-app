import type { ResolvedTheme } from "@/lib/theme/types";

type ClerkAppearance = {
  variables: Record<string, string>;
  elements: Record<string, string>;
};

const LIGHT: ClerkAppearance = {
  variables: {
    colorBackground: "#FFFFFF",
    colorText: "#111111",
    colorTextSecondary: "#3a3a3c",
    colorPrimary: "#0071e3",
    colorDanger: "#c40014",
    colorSuccess: "#1d7a34",
    colorInputBackground: "#f5f5f7",
    colorInputText: "#111111",
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
  return resolved === "dark" ? DARK : LIGHT;
}
