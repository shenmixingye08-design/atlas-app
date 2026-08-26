"use client";

import Link from "next/link";

import type { Automation } from "@/lib/automations/types";
import type { Project } from "@/lib/projects/types";
import { ui } from "@/lib/i18n";

import { RevealStagger } from "@/components/motion/reveal-stagger";
import { MOTION_PLAY_KEYS } from "@/lib/motion/tokens";

import { HomeChatBar } from "./home-chat-bar";
import { HomeGreetingHeader } from "./home-greeting-header";

type SecretaryHomeDashboardProps = {
  automations: Automation[];
  projects: Project[];
};

/**
 * Post-login home — 迷いゼロの第一画面。
 * Lead with work completion, not "AI秘書です".
 * Dashboard / analytics / recommendations stay out of the first path.
 */
export function SecretaryHomeDashboard({
  automations,
  projects,
}: SecretaryHomeDashboardProps) {
  return (
    <RevealStagger
      playKey={MOTION_PLAY_KEYS.homeIntro}
      className="home-dashboard mx-auto flex min-h-[60vh] w-full max-w-2xl flex-col justify-center space-y-6 pb-10 pt-6 sm:space-y-8 sm:pb-14 sm:pt-10"
    >
      <header className="space-y-2 text-center sm:space-y-3">
        <p className="text-[length:var(--text-label)] font-semibold tracking-[0.1em] text-[var(--brand)]">
          MINERVOT
        </p>
        <p className="text-sm font-medium tracking-wide text-[var(--brand)]">
          {ui.secretaryHome.brandTagline}
        </p>
        <HomeGreetingHeader automations={automations} projects={projects} />
        <p className="mx-auto max-w-md text-sm text-[var(--foreground-muted)] sm:text-base">
          {ui.secretaryHome.zeroFrictionHint}
        </p>
      </header>

      <div>
        <HomeChatBar />
      </div>

      <SecretaryRecentWork projects={projects} />
    </RevealStagger>
  );
}

function SecretaryRecentWork({ projects }: { projects: Project[] }) {
  const recent = [...projects]
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, 3);
  if (recent.length === 0) return null;

  return (
    <section className="space-y-3" aria-labelledby="secretary-recent-work">
      <h2
        id="secretary-recent-work"
        className="text-title text-foreground"
      >
        {ui.activityHistory.recentTitle}
      </h2>
      <ul className="space-y-2">
        {recent.map((project) => (
          <li key={project.id}>
            <Link
              href={`/projects/${project.id}`}
              className="motion-press-card block rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-[var(--card)] px-4 py-3 text-left"
            >
              <p className="truncate text-sm font-medium text-foreground">
                {project.title || project.workRequest}
              </p>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
