/**
 * MINERVOT Design Tokens — LP-aligned wine · off-white · light gray
 * Runtime values live in app/globals.css (`:root` / themes / `.minervot-lux`).
 * Prefer CSS variables in UI; keep these in sync for typed references.
 */

export const COLORS = {
  background: "#fffdfb",
  surface: "#fffdfb",
  surfaceMuted: "#faf6f5",
  card: "#ffffff",
  cardGlass: "rgba(255, 253, 251, 0.9)",

  textPrimary: "#281a1e",
  textSecondary: "#75686b",
  textMuted: "#9a8d90",

  border: "rgba(40, 26, 30, 0.08)",
  borderStrong: "rgba(40, 26, 30, 0.14)",
  borderFocus: "rgba(116, 23, 42, 0.45)",

  accent: "#74172a",
  accentHover: "#5d1020",
  accentMuted: "rgba(116, 23, 42, 0.1)",

  /** Brand — wine red (matches LP) */
  brand: "#74172a",
  brandHover: "#5d1020",
  brandMuted: "rgba(116, 23, 42, 0.1)",
  brandForeground: "#ffffff",

  success: "#5f1222",
  successBg: "rgba(116, 23, 42, 0.08)",
  warning: "#9a7137",
  warningBg: "rgba(154, 113, 55, 0.1)",
  error: "#c40014",
  errorBg: "rgba(196, 0, 20, 0.06)",
  info: "#74172a",
  infoBg: "rgba(116, 23, 42, 0.08)",

  secondaryHover: "#f5f1f0",
} as const;

export const TYPOGRAPHY = {
  display: "clamp(1.75rem, 2vw + 1rem, 2.25rem)",
  pageTitle: "1.5rem",
  section: "1.125rem",
  cardTitle: "1rem",
  body: "0.9375rem",
  label: "0.8125rem",
  caption: "0.75rem",
  meta: "0.6875rem",
  leadingBody: 1.65,
} as const;

export const LAYOUT = {
  contentNarrow: "48rem",
  contentDefault: "64rem",
  contentWide: "72rem",
  touchTarget: "44px",
  sidebarWidth: "15rem",
  bottomNavHeight: "4.25rem",
} as const;

export const Z_INDEX = {
  sticky: 40,
  nav: 50,
  modal: 70,
  toast: 80,
} as const;

export const COLORS_DARK = {
  background: "#141014",
  surface: "#141014",
  surfaceMuted: "#241e21",
  card: "#1c1719",
  cardGlass: "rgba(20, 16, 20, 0.9)",

  textPrimary: "#faf6f5",
  textSecondary: "#c9bdbf",
  textMuted: "#9a8d90",

  border: "rgba(255, 255, 255, 0.1)",
  borderStrong: "rgba(255, 255, 255, 0.16)",
  borderFocus: "rgba(196, 138, 150, 0.5)",

  accent: "#c48a96",
  accentHover: "#d4a3ad",
  accentMuted: "rgba(196, 138, 150, 0.18)",

  success: "#c48a96",
  successBg: "rgba(196, 138, 150, 0.14)",
  warning: "#d4b07a",
  warningBg: "rgba(212, 176, 122, 0.14)",
  error: "#ff6b7a",
  errorBg: "rgba(255, 107, 122, 0.12)",

  secondaryHover: "#2a2226",
} as const;

/**
 * MINERVOT App Shell — LP wine palette (post-login).
 * Runtime values live in `.minervot-lux` (app/globals.css).
 */
export const COLORS_LUX = {
  background: "#fffdfb",
  surface: "#fffdfb",
  surfaceElevated: "#ffffff",
  surfaceMuted: "#faf6f5",
  card: "#ffffff",
  cardGlass: "rgba(255, 253, 251, 0.92)",

  textPrimary: "#281a1e",
  textSecondary: "#75686b",
  textMuted: "#9a8d90",

  border: "rgba(40, 26, 30, 0.08)",
  borderStrong: "rgba(40, 26, 30, 0.14)",
  borderFocus: "rgba(116, 23, 42, 0.45)",

  accent: "#74172a",
  accentHover: "#5d1020",
  accentMuted: "rgba(116, 23, 42, 0.1)",
  accentForeground: "#ffffff",

  accentRed: "#74172a",
  accentRedStrong: "#5d1020",

  success: "#5f1222",
  successBg: "rgba(116, 23, 42, 0.08)",
  warning: "#9a7137",
  warningBg: "rgba(154, 113, 55, 0.1)",
  error: "#c40014",
  errorBg: "rgba(196, 0, 20, 0.06)",

  secondaryHover: "#f5f1f0",
} as const;

/** Alias — warm light is now the same LP wine shell */
export const COLORS_LUX_WARM = COLORS_LUX;

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
