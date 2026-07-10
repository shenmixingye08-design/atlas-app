"use client";

import { useTheme } from "@/components/theme/theme-provider";
import { cn } from "@/lib/design-system/cn";
import { ui } from "@/lib/i18n";

type ThemeToggleProps = {
  className?: string;
};

/** Quick light/dark toggle near the profile control. */
export function ThemeToggle({ className }: ThemeToggleProps) {
  const { resolved, toggleLightDark } = useTheme();
  const isDark = resolved === "dark";

  return (
    <button
      type="button"
      onClick={toggleLightDark}
      className={cn(
        "touch-target flex h-10 w-10 items-center justify-center rounded-full text-base transition-colors duration-[var(--motion-base)] hover:bg-[var(--surface-muted)] focus-ring",
        className,
      )}
      aria-label={isDark ? ui.theme.switchToLight : ui.theme.switchToDark}
      title={isDark ? ui.theme.switchToLight : ui.theme.switchToDark}
    >
      <span aria-hidden>{isDark ? "☀" : "🌙"}</span>
    </button>
  );
}
