"use client";

import { useTheme } from "@/components/theme/theme-provider";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/design-system/cn";
import { ui } from "@/lib/i18n";
import type { ThemePreference } from "@/lib/theme/types";

const OPTIONS: { value: ThemePreference; label: string; hint: string }[] = [
  {
    value: "light",
    label: ui.theme.light,
    hint: ui.theme.lightHint,
  },
  {
    value: "dark",
    label: ui.theme.dark,
    hint: ui.theme.darkHint,
  },
  {
    value: "system",
    label: ui.theme.system,
    hint: ui.theme.systemHint,
  },
];

export function ThemeSettings() {
  const { preference, setPreference } = useTheme();

  return (
    <Card padding="lg" className="space-y-5">
      <div className="space-y-1">
        <h2 className="text-title text-foreground">{ui.theme.title}</h2>
        <p className="text-body text-[var(--text-secondary)]">{ui.theme.subtitle}</p>
      </div>

      <div className="space-y-2" role="radiogroup" aria-label={ui.theme.title}>
        {OPTIONS.map((option) => {
          const selected = preference === option.value;
          return (
            <label
              key={option.value}
              className={cn(
                "flex cursor-pointer items-start gap-3 rounded-[var(--radius-xl)] px-4 py-3 transition-colors",
                selected
                  ? "bg-[var(--accent-muted)]"
                  : "hover:bg-[var(--surface-muted)]",
              )}
            >
              <input
                type="radio"
                name="atlas-theme"
                value={option.value}
                checked={selected}
                onChange={() => setPreference(option.value)}
                className="mt-1 h-4 w-4 accent-[var(--accent)]"
              />
              <span>
                <span className="block text-base font-medium text-foreground">
                  {option.label}
                </span>
                <span className="mt-0.5 block text-sm text-[var(--text-secondary)]">
                  {option.hint}
                </span>
              </span>
            </label>
          );
        })}
      </div>
    </Card>
  );
}
