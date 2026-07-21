/**
 * ATLAS Design Tokens — "Less, but Better."
 * Runtime values live in app/globals.css (`:root` / `html[data-theme="dark"]`).
 * Prefer CSS variables in UI; keep these in sync for typed references.
 */

export const COLORS = {
  background: "#ffffff",
  surface: "#ffffff",
  surfaceMuted: "#f5f5f7",
  card: "#ffffff",
  cardGlass: "rgba(255, 255, 255, 0.86)",

  textPrimary: "#111111",
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

export const COLORS_DARK = {
  background: "#0f1115",
  surface: "#0f1115",
  surfaceMuted: "#1c2028",
  card: "#171a21",
  cardGlass: "rgba(23, 26, 33, 0.88)",

  textPrimary: "#ffffff",
  textSecondary: "#c7c7cc",
  textMuted: "#8e8e93",

  border: "rgba(255, 255, 255, 0.1)",
  borderStrong: "rgba(255, 255, 255, 0.16)",
  borderFocus: "rgba(0, 113, 227, 0.55)",

  accent: "#0071e3",
  accentHover: "#0077ed",
  accentMuted: "rgba(0, 113, 227, 0.18)",

  success: "#30d158",
  successBg: "rgba(48, 209, 88, 0.12)",
  warning: "#ff9f0a",
  warningBg: "rgba(255, 159, 10, 0.12)",
  error: "#ff453a",
  errorBg: "rgba(255, 69, 58, 0.12)",

  secondaryHover: "#252a33",
} as const;

/**
 * MINERVOT Luxury Shell — dark concierge palette.
 * Runtime values live in `.minervot-lux` (app/globals.css) and are scoped to
 * the post-login AtlasAppShell. Gold = primary/success, dark red = notice.
 * Keep in sync for typed references.
 */
export const COLORS_LUX = {
  background: "#0e0f13",
  surface: "#0e0f13",
  surfaceElevated: "#171a20",
  surfaceMuted: "#1b1f27",
  card: "#171a20",
  cardGlass: "rgba(14, 15, 19, 0.82)",

  textPrimary: "#f4f2ec",
  textSecondary: "#b9bec7",
  textMuted: "#868c96",

  border: "#2a2f38",
  borderStrong: "#3a414d",
  borderFocus: "rgba(212, 175, 55, 0.55)",

  accent: "#d4af37",
  accentHover: "#e6c458",
  accentMuted: "rgba(212, 175, 55, 0.12)",
  accentForeground: "#12130f",

  accentRed: "#7b1124",
  accentRedStrong: "#9a1c33",

  success: "#d4af37",
  successBg: "rgba(212, 175, 55, 0.12)",
  warning: "#c9a227",
  warningBg: "rgba(201, 162, 39, 0.12)",
  error: "#d24359",
  errorBg: "rgba(123, 17, 36, 0.22)",

  secondaryHover: "#232833",
} as const;

/** MINERVOT warm light shell — ライト（赤ゴールド） */
export const COLORS_LUX_WARM = {
  background: "#f7f2eb",
  surface: "#f7f2eb",
  surfaceElevated: "#fff7f0",
  surfaceMuted: "#efe6d8",
  card: "#fff7f0",
  cardGlass: "rgba(255, 247, 240, 0.92)",

  textPrimary: "#2a2a2a",
  textSecondary: "#5c4f42",
  textMuted: "#8a7b6a",

  border: "rgba(90, 70, 45, 0.14)",
  borderStrong: "rgba(90, 70, 45, 0.22)",
  borderFocus: "rgba(184, 134, 11, 0.55)",

  accent: "#b8860b",
  accentHover: "#c89a2b",
  accentMuted: "rgba(184, 134, 11, 0.14)",
  accentForeground: "#fffaf3",

  accentRed: "#9a1c33",
  accentRedStrong: "#7b1124",

  success: "#b8860b",
  successBg: "rgba(184, 134, 11, 0.12)",
  warning: "#c89a2b",
  warningBg: "rgba(200, 154, 43, 0.14)",
  error: "#9a1c33",
  errorBg: "rgba(154, 28, 51, 0.1)",

  secondaryHover: "#efe6d8",
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
