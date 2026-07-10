"use client";

import { LANDING_AI_TEAM_CARDS } from "@/lib/landing/demo-data";
import { cn } from "@/lib/design-system/cn";

import { LandingReveal } from "./landing-reveal";

export function LandingAiTeamCards() {
  return (
    <section className="px-4 py-20 sm:px-8 sm:py-28">
      <div className="mx-auto max-w-6xl">
        <LandingReveal className="mx-auto max-w-2xl text-center">
          <h2 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
            あなたのAI秘書チーム
          </h2>
          <p className="mt-4 text-base text-[var(--foreground-muted)]">
            専門ごとに担当業務を分担。稼働状況と今日の件数がひと目でわかります。
          </p>
        </LandingReveal>

        <ul className="mt-12 grid gap-5 sm:grid-cols-2">
          {LANDING_AI_TEAM_CARDS.map((member, index) => (
            <LandingReveal key={member.id} delayMs={index * 80}>
              <li className="landing-glass group h-full rounded-[var(--radius-2xl)] border border-[var(--border-subtle)] p-6 transition-all duration-300 hover:-translate-y-1 hover:shadow-[var(--shadow-lg)] sm:p-8">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-4">
                    <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-[var(--radius-xl)] bg-[var(--accent-muted)] text-2xl transition-transform duration-300 group-hover:scale-105">
                      {member.icon}
                    </span>
                    <div>
                      <h3 className="text-lg font-semibold text-foreground">{member.role}</h3>
                      <p className="mt-1 text-sm text-[var(--foreground-muted)]">{member.subtitle}</p>
                    </div>
                  </div>
                  <span
                    className={cn(
                      "shrink-0 rounded-full px-2.5 py-1 text-[10px] font-medium sm:text-xs",
                      member.status === "active"
                        ? "bg-[var(--status-success-bg)] text-[var(--status-success)]"
                        : "bg-[var(--status-neutral-bg)] text-[var(--foreground-muted)]",
                    )}
                  >
                    {member.status === "active" ? "稼働中" : "待機中"}
                  </span>
                </div>

                <dl className="mt-6 grid grid-cols-2 gap-3 border-t border-[var(--border-subtle)] pt-5">
                  <div className="rounded-[var(--radius-lg)] bg-[var(--card)]/60 px-3 py-3">
                    <dt className="text-[10px] text-[var(--foreground-muted)] sm:text-xs">状態</dt>
                    <dd className="mt-1 text-sm font-semibold text-foreground">
                      {member.status === "active" ? "現在稼働中" : "待機中"}
                    </dd>
                  </div>
                  <div className="rounded-[var(--radius-lg)] bg-[var(--card)]/60 px-3 py-3">
                    <dt className="text-[10px] text-[var(--foreground-muted)] sm:text-xs">今日の担当</dt>
                    <dd className="mt-1 text-sm font-semibold text-accent">
                      {member.todayTasks}件
                    </dd>
                  </div>
                </dl>
              </li>
            </LandingReveal>
          ))}
        </ul>
      </div>
    </section>
  );
}
