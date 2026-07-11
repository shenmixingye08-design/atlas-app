"use client";

import { useRouter } from "next/navigation";
import { useMemo } from "react";

import {
  HOME_FREQUENT_WORK_ICONS,
} from "@/lib/home/frequent-work-presets";
import { sortFrequentWorkPresets } from "@/lib/onboarding";
import { loadUserWorkProfile } from "@/lib/user-profile";
import { ui } from "@/lib/i18n";

type HomeFrequentWorkGridProps = {
  profileVersion?: number;
};

export function HomeFrequentWorkGrid({ profileVersion = 0 }: HomeFrequentWorkGridProps) {
  const router = useRouter();

  const presets = useMemo(() => {
    void profileVersion;
    return sortFrequentWorkPresets(loadUserWorkProfile());
  }, [profileVersion]);

  const handleSelect = (preset: (typeof presets)[number]) => {
    if (preset.href) {
      router.push(preset.href);
      return;
    }
    router.push(`/commander?assignment=${encodeURIComponent(preset.prompt)}`);
  };

  return (
    <section aria-labelledby="frequent-work-heading" className="space-y-5">
      <div>
        <h2 id="frequent-work-heading" className="text-xl font-semibold text-foreground">
          {ui.todayDashboard.frequentWorkTitle}
        </h2>
        <p className="mt-1 text-sm text-[var(--foreground-muted)]">
          {ui.todayDashboard.frequentWorkHint}
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {presets.map((preset) => (
          <button
            key={preset.id}
            type="button"
            onClick={() => handleSelect(preset)}
            className="touch-target min-h-[72px] rounded-[var(--radius-2xl)] border border-[var(--border-subtle)] bg-[var(--card)] px-4 py-4 text-left shadow-[var(--shadow-sm)] transition-colors hover:bg-[var(--background-subtle)] focus:outline-none focus:ring-2 focus:ring-accent/25 sm:px-5 sm:py-5"
          >
            <span className="text-2xl" aria-hidden>
              {HOME_FREQUENT_WORK_ICONS[preset.id] ?? "📋"}
            </span>
            <p className="mt-3 text-base font-medium text-foreground">{preset.label}</p>
          </button>
        ))}
      </div>
    </section>
  );
}
