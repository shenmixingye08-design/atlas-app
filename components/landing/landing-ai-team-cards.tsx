"use client";

import { LANDING_AI_TEAM_CARDS } from "@/lib/landing/demo-data";
import { cn } from "@/lib/design-system/cn";

import { LandingReveal } from "./landing-reveal";

export function LandingAiTeamCards() {
  return (
    <section className="border-t border-[var(--primary)]/8 bg-[var(--surface-muted)] px-4 py-20 sm:px-8 sm:py-28">
      <div className="mx-auto max-w-6xl">
        <LandingReveal className="mx-auto max-w-2xl text-center">
          <p className="text-[10px] font-semibold uppercase tracking-[0.25em] text-[var(--accent-gold)]">
            AI SECRETARY TEAM
          </p>

          <h2 className="mt-4 text-3xl font-semibold tracking-[-0.04em] text-[var(--text-primary)] sm:text-4xl">
            あなたのAI秘書チーム
          </h2>

          <p className="mt-5 text-sm leading-7 text-[var(--text-secondary)] sm:text-base">
            専門ごとに担当業務を分担し、
            <br className="hidden sm:block" />
            稼働状況と今日の件数をひと目で確認できます。
          </p>
        </LandingReveal>

        <ul className="mt-12 grid gap-5 sm:grid-cols-2">
          {LANDING_AI_TEAM_CARDS.map((member, index) => (
            <LandingReveal key={member.id} delayMs={index * 80}>
              <li className="group h-full rounded-[24px] border border-[var(--primary)]/8 bg-white p-6 shadow-[var(--shadow-subtle)] transition-[transform,opacity,border-color,box-shadow] duration-[var(--motion-normal)] [@media(hover:hover)]:hover:-translate-y-px hover:border-[var(--accent-gold)]/35 hover:shadow-[var(--shadow-floating)] sm:p-8">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-4">
                    <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-[var(--accent-gold)]/20 bg-[var(--surface-muted)] text-2xl shadow-sm transition-transform duration-300 [@media(hover:hover)]:group-hover:scale-[1.02]">
                      {member.icon}
                    </span>

                    <div>
                      <h3 className="text-lg font-semibold text-[var(--text-primary)]">
                        {member.role}
                      </h3>

                      <p className="mt-1 text-sm leading-6 text-[var(--text-secondary)]">
                        {member.subtitle}
                      </p>
                    </div>
                  </div>

                  <span
                    className={cn(
                      "shrink-0 rounded-full border px-2.5 py-1 text-[10px] font-semibold sm:text-xs",
                      member.status === "active"
                        ? "border-emerald-500/15 bg-emerald-500/10 text-emerald-700"
                        : "border-[var(--primary)]/8 bg-[var(--primary)]/[0.03] text-[var(--text-tertiary)]",
                    )}
                  >
                    {member.status === "active" ? "稼働中" : "待機中"}
                  </span>
                </div>

                <dl className="mt-6 grid grid-cols-2 gap-3 border-t border-[var(--primary)]/8 pt-5">
                  <div className="rounded-2xl bg-[var(--surface-muted)] px-3 py-3">
                    <dt className="text-[10px] text-[var(--text-tertiary)] sm:text-xs">
                      状態
                    </dt>

                    <dd className="mt-1 text-sm font-semibold text-[var(--text-primary)]">
                      {member.status === "active" ? "現在稼働中" : "待機中"}
                    </dd>
                  </div>

                  <div className="rounded-2xl border border-[var(--accent-gold)]/15 bg-[var(--surface-muted)] px-3 py-3">
                    <dt className="text-[10px] text-[var(--text-tertiary)] sm:text-xs">
                      今日の担当
                    </dt>

                    <dd className="mt-1 text-sm font-semibold text-[var(--accent-gold)]">
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
