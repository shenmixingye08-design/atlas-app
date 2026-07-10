/**
 * ATLAS Design Tokens — "Less, but Better."
 * Runtime values live in app/globals.css; keep these in sync.
 * All text colors meet WCAG AA (4.5:1+) on white backgrounds.
 */

export const COLORS = {
  background: "#ffffff",
  surface: "#ffffff",
  surfaceMuted: "#f5f5f7",
  card: "#ffffff",
  cardGlass: "rgba(255, 255, 255, 0.94)",

  textPrimary: "#1d1d1f",
  textSecondary: "#3a3a3c",
  textMuted: "#515154",

  border: "rgba(0, 0, 0, 0.08)",
  borderStrong: "rgba(0, 0, 0, 0.12)",
  borderFocus: "rgba(0, 113, 227, 0.5)",

  accent: "#0071e3",
  accentHover: "#0077ed",
  accentMuted: "rgba(0, 113, 227, 0.1)",

  success: "#1d7a34",
  successBg: "rgba(29, 122, 52, 0.08)",
  warning: "#b35000",
  warningBg: "rgba(179, 80, 0, 0.08)",
  error: "#c40014",
  errorBg: "rgba(196, 0, 20, 0.06)",

  secondaryHover: "#e8e8ed",
} as const;

/** @deprecated Use COLORS — kept for backward compatibility */
export const ATLAS_PHILOSOPHY = {
  accent: COLORS.accent,
  background: COLORS.background,
  surface: COLORS.surfaceMuted,
  text: COLORS.textPrimary,
  motionMs: { fast: 150, base: 200, slow: 250 },
} as const;

export const MOTION = {
  fast: "150ms cubic-bezier(0.25, 0.1, 0.25, 1)",
  base: "200ms cubic-bezier(0.25, 0.1, 0.25, 1)",
  slow: "250ms cubic-bezier(0.25, 0.1, 0.25, 1)",
} as const;

export const RADIUS = {
  sm: "8px",
  md: "12px",
  lg: "16px",
  xl: "20px",
  "2xl": "24px",
  full: "9999px",
} as const;

export const SPACING = {
  0: 0,
  1: 4,
  2: 8,
  3: 12,
  4: 16,
  5: 20,
  6: 24,
  8: 32,
  10: 40,
  12: 48,
  16: 64,
} as const;

export const WORKFLOW_STAGES = [
  { id: "research", icon: "○", title: "調査", description: "情報を集める" },
  { id: "planning", icon: "○", title: "企画", description: "計画を立てる" },
  { id: "working", icon: "○", title: "制作", description: "仕事を進める" },
  { id: "review", icon: "○", title: "確認", description: "品質を見る" },
  { id: "completed", icon: "○", title: "完了", description: "仕上げ" },
] as const;
