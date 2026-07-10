"use client";

import Link from "next/link";

import {
  getTopFrequentJobs,
  hasLearnedPreferences,
  getAllSuggestions,
} from "@/lib/user-profile";
import { useWorkProfile } from "@/lib/user-profile/use-work-profile";
import { ui } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export function LearnedPreferencesPanel() {
  const { profile } = useWorkProfile();

  if (!hasLearnedPreferences(profile)) {
    return (
      <section aria-labelledby="learned-preferences-heading" className="space-y-4">
        <div>
          <h2 id="learned-preferences-heading" className="text-title text-foreground">
            {ui.workProfile.homeTitle}
          </h2>
          <p className="mt-1 text-caption text-[var(--foreground-muted)]">
            {ui.workProfile.homeEmptyHint}
          </p>
        </div>
      </section>
    );
  }

  const frequent = getTopFrequentJobs(profile, 3);
  const suggestions = getAllSuggestions(profile).slice(0, 4);

  return (
    <section aria-labelledby="learned-preferences-heading" className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 id="learned-preferences-heading" className="text-title text-foreground">
            {ui.workProfile.homeTitle}
          </h2>
          <p className="mt-1 text-caption text-[var(--foreground-muted)]">
            {ui.workProfile.homeHint}
          </p>
        </div>
        <Link href="/settings/memory">
          <Button variant="secondary" size="sm">
            {ui.workProfile.manageSettings}
          </Button>
        </Link>
      </div>

      <Card padding="lg" className="shadow-[var(--shadow-soft)]">
        {frequent.length > 0 && (
          <div className="mb-6">
            <p className="text-sm font-semibold text-foreground">
              {ui.workProfile.frequentJobsTitle}
            </p>
            <ul className="mt-3 flex flex-wrap gap-2">
              {frequent.map((job) => (
                <li
                  key={job.jobCategory}
                  className="rounded-full bg-accent/10 px-3 py-1.5 text-sm font-medium text-accent"
                >
                  {job.label}
                </li>
              ))}
            </ul>
          </div>
        )}

        {suggestions.length > 0 && (
          <div>
            <p className="text-sm font-semibold text-foreground">
              {ui.workProfile.usualSettingsTitle}
            </p>
            <ul className="mt-3 space-y-2">
              {suggestions.map((item) => (
                <li
                  key={item.jobCategory}
                  className="flex flex-col gap-1 rounded-[var(--radius-lg)] bg-[var(--background-subtle)] px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <span className="font-medium text-foreground">{item.label}</span>
                  <span className="text-sm text-[var(--foreground-muted)]">
                    {item.summary}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </Card>
    </section>
  );
}
