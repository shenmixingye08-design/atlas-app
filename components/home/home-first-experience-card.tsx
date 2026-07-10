"use client";

import { ui } from "@/lib/i18n";

type HomeFirstExperienceCardProps = {
  onStart: () => void;
};

export function HomeFirstExperienceCard({ onStart }: HomeFirstExperienceCardProps) {
  return (
    <section aria-labelledby="first-experience-card-heading">
      <button
        type="button"
        onClick={onStart}
        className="landing-glass w-full rounded-[var(--radius-2xl)] border border-accent/25 bg-gradient-to-br from-accent/[0.06] to-white px-5 py-6 text-left transition-all hover:-translate-y-0.5 hover:shadow-[var(--shadow-md)] focus:outline-none focus:ring-2 focus:ring-accent/25 sm:px-8 sm:py-8"
      >
        <p className="text-xs font-medium text-accent">{ui.firstExperience.cardBadge}</p>
        <h2
          id="first-experience-card-heading"
          className="mt-2 text-xl font-semibold text-foreground"
        >
          {ui.firstExperience.cardTitle}
        </h2>
        <p className="mt-2 text-sm text-[var(--foreground-muted)]">
          {ui.firstExperience.cardHint}
        </p>
        <span className="mt-4 inline-flex rounded-full bg-accent px-4 py-2 text-sm font-medium text-white">
          {ui.firstExperience.cardCta}
        </span>
      </button>
    </section>
  );
}
