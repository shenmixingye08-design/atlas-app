"use client";

import { LANDING_DASHBOARD_STATS } from "@/lib/landing/demo-data";

import { LandingReveal } from "./landing-reveal";

export function LandingResultsDashboard() {
  return (
    <section className="border-t border-[var(--border-subtle)] bg-[var(--background-subtle)]/50 px-4 py-20 sm:px-8 sm:py-28">
      <div className="mx-auto max-w-6xl">
        <LandingReveal className="mx-auto max-w-2xl text-center">
          <h2 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
            実績・成果
          </h2>
          <p className="mt-4 text-base text-[var(--foreground-muted)]">
            ATLASのダッシュボードで、今日の仕事の進み具合をリアルタイムに確認できます。
          </p>
        </LandingReveal>

        <div className="landing-glass mt-12 overflow-hidden rounded-[var(--radius-2xl)] border border-[var(--border-subtle)] p-4 shadow-[var(--shadow-md)] sm:p-6">
          <div className="mb-4 flex items-center justify-between border-b border-[var(--border-subtle)] pb-4">
            <p className="text-sm font-semibold text-foreground">今日のダッシュボード</p>
            <span className="rounded-full bg-[var(--accent-muted)] px-2.5 py-0.5 text-xs font-medium text-accent">
              ライブ
            </span>
          </div>
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {LANDING_DASHBOARD_STATS.map((stat, index) => (
              <LandingReveal key={stat.id} delayMs={index * 60}>
                <li className="rounded-[var(--radius-xl)] border border-[var(--border-subtle)] bg-white/70 px-4 py-5 transition-shadow hover:shadow-[var(--shadow-sm)] sm:px-5">
                  <p className="text-xs text-[var(--foreground-muted)]">{stat.label}</p>
                  <div className="mt-2 flex items-baseline gap-1">
                    <span className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
                      {stat.value}
                    </span>
                    {stat.unit && (
                      <span className="text-sm text-[var(--foreground-muted)]">{stat.unit}</span>
                    )}
                  </div>
                  {stat.trend && (
                    <p className="mt-2 text-xs font-medium text-accent">{stat.trend}</p>
                  )}
                </li>
              </LandingReveal>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
