/**
 * MINERVOT Design Tokens — Warm Minimal
 * Runtime values live in app/globals.css (`:root` / themes / `.minervot-lux`).
 * Prefer CSS variables in UI; keep these hex fallbacks in sync.
 */

export const COLORS = {
  background: "#fffaf6",
  surface: "#fffaf6",
  surfaceRaised: "#ffffff",
  surfaceMuted: "#f4eee8",
  card: "#ffffff",
  cardGlass: "rgba(255, 250, 246, 0.94)",

  textPrimary: "#2a211c",
  textSecondary: "#534840",
  textTertiary: "#6a5f57",
  textMuted: "#6a5f57",

  border: "rgba(42, 33, 28, 0.08)",
  borderStrong: "rgba(42, 33, 28, 0.16)",
  borderFocus: "rgba(181, 68, 56, 0.48)",

  primary: "#b54438",
  primaryHover: "#97392f",
  primaryPressed: "#7e3028",
  accent: "#b54438",
  accentHover: "#97392f",
  accentMuted: "rgba(181, 68, 56, 0.12)",
  accentGold: "#b0894a",

  brand: "#b54438",
  brandHover: "#97392f",
  brandMuted: "rgba(181, 68, 56, 0.12)",
  brandForeground: "#fffaf6",

  success: "#2f6a4d",
  successBg: "rgba(47, 106, 77, 0.1)",
  warning: "#9a6b1f",
  warningBg: "rgba(154, 107, 31, 0.12)",
  error: "#c4332e",
  errorBg: "rgba(196, 51, 46, 0.1)",
  info: "#3d5a73",
  infoBg: "rgba(61, 90, 115, 0.1)",

  focusRing: "rgba(181, 68, 56, 0.48)",
  overlay: "rgba(42, 33, 28, 0.36)",
  secondaryHover: "#efe8e2",
} as const;

export const TYPOGRAPHY = {
  display: "clamp(1.75rem, 2vw + 1rem, 2.25rem)",
  heading1: "1.5rem",
  heading2: "1.125rem",
  heading3: "1rem",
  pageTitle: "1.5rem",
  section: "1.125rem",
  cardTitle: "1rem",
  body: "0.9375rem",
  bodySmall: "0.875rem",
  label: "0.8125rem",
  caption: "0.75rem",
  number: "0.9375rem",
  meta: "0.75rem",
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
  background: "#1c1714",
  surface: "#1c1714",
  surfaceRaised: "#26201c",
  surfaceMuted: "#2c2622",
  card: "#26201c",
  cardGlass: "rgba(38, 32, 28, 0.9)",

  textPrimary: "#f7f1eb",
  textSecondary: "#c9bfb6",
  textTertiary: "#a89d94",
  textMuted: "#a89d94",

  border: "rgba(247, 241, 235, 0.1)",
  borderStrong: "rgba(247, 241, 235, 0.16)",
  borderFocus: "rgba(232, 154, 140, 0.5)",

  primary: "#e89a8c",
  accent: "#e89a8c",
  accentHover: "#f0b4a8",
  accentMuted: "rgba(232, 154, 140, 0.18)",

  success: "#7dba98",
  successBg: "rgba(125, 186, 152, 0.14)",
  warning: "#e2b56a",
  warningBg: "rgba(226, 181, 106, 0.14)",
  error: "#f08a84",
  errorBg: "rgba(240, 138, 132, 0.14)",

  secondaryHover: "#332c28",
} as const;

export const COLORS_LUX = {
  ...COLORS,
  surfaceElevated: COLORS.surfaceRaised,
  accentForeground: COLORS.brandForeground,
  accentRed: COLORS.primary,
  accentRedStrong: COLORS.primaryHover,
} as const;

export const COLORS_LUX_WARM = COLORS_LUX;

export const ATLAS_PHILOSOPHY = {
  accent: COLORS.accent,
  background: COLORS.background,
  surface: COLORS.surfaceMuted,
  text: COLORS.textPrimary,
  motionMs: { fast: 140, base: 200, slow: 280 },
} as const;

export const MOTION = {
  instant: "80ms",
  fast: "140ms cubic-bezier(0.25, 0.1, 0.25, 1)",
  normal: "200ms cubic-bezier(0.25, 0.1, 0.25, 1)",
  slow: "280ms cubic-bezier(0.25, 0.1, 0.25, 1)",
  easingStandard: "cubic-bezier(0.25, 0.1, 0.25, 1)",
  easingEmphasized: "cubic-bezier(0.32, 0.72, 0, 1)",
  springSoft: "280ms cubic-bezier(0.22, 1, 0.36, 1)",
  springSnappy: "180ms cubic-bezier(0.22, 1, 0.36, 1)",
  base: "200ms cubic-bezier(0.25, 0.1, 0.25, 1)",
} as const;

export const RADIUS = {
  small: "8px",
  medium: "12px",
  large: "16px",
  card: "20px",
  modal: "24px",
  full: "9999px",
  sm: "8px",
  md: "12px",
  lg: "16px",
  xl: "20px",
  "2xl": "24px",
} as const;

export const SHADOW = {
  subtle: "0 1px 2px rgba(42, 33, 28, 0.04)",
  floating: "0 8px 24px rgba(42, 33, 28, 0.06)",
  modal: "0 16px 40px rgba(42, 33, 28, 0.1)",
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
