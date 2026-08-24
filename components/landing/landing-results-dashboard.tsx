"use client";

import { LANDING_DASHBOARD_STATS } from "@/lib/landing/demo-data";

import { LandingReveal } from "./landing-reveal";

export function LandingResultsDashboard() {
  return (
    <section className="border-t border-[var(--primary)]/8 bg-white px-4 py-20 sm:px-8 sm:py-28 lg:py-32">
      <div className="mx-auto max-w-6xl">
        <LandingReveal className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-semibold tracking-[0.18em] text-[var(--primary)]">
            LIVE DASHBOARD
          </p>

          <h2 className="mt-4 text-3xl font-semibold tracking-[-0.04em] text-[var(--text-primary)] sm:text-4xl">
            あなたのAI秘書は、
            <br className="sm:hidden" />
            今日も仕事を進めています。
          </h2>

          <p className="mt-6 text-base leading-8 text-[var(--text-secondary)] sm:text-lg">
            MINERVOTのダッシュボードでは、
            <br className="hidden sm:inline" />
            完了した業務、自動化された作業、節約できた時間を
            <br className="hidden sm:inline" />
            リアルタイムで確認できます。
          </p>
        </LandingReveal>

        <LandingReveal
          delayMs={120}
          className="mt-14 overflow-hidden rounded-[var(--radius-modal)] border border-[var(--border-subtle)] bg-[var(--surface-raised)] shadow-[var(--shadow-subtle)]"
        >
          <div className="flex flex-col gap-4 border-b border-[var(--primary)]/8 bg-white px-5 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-8 sm:py-6">
            <div>
              <div className="flex items-center gap-3">
                <span
                  className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[var(--primary)] text-sm font-semibold text-white shadow-[var(--shadow-subtle)]"
                  aria-hidden
                >
                  M
                </span>

                <div>
                  <p className="text-base font-semibold tracking-tight text-[var(--text-primary)] sm:text-lg">
                    MINERVOT Dashboard
                  </p>

                  <p className="mt-0.5 text-xs text-[var(--text-tertiary)] sm:text-sm">
                    リアルタイム業務レポート
                  </p>
                </div>
              </div>
            </div>

            <span className="inline-flex w-fit items-center gap-2 rounded-full border border-emerald-500/15 bg-emerald-500/10 px-3 py-1.5 text-xs font-semibold text-emerald-700">
              <span className="relative flex h-2 w-2" aria-hidden>
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-40" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
              </span>
              LIVE
            </span>
          </div>

          <ul className="grid gap-4 bg-[var(--surface-muted)] p-5 sm:grid-cols-2 sm:p-7 lg:grid-cols-3 lg:p-8">
            {LANDING_DASHBOARD_STATS.map((stat, index) => (
              <LandingReveal key={stat.id} delayMs={index * 70}>
                <li className="group h-full rounded-[22px] border border-[var(--primary)]/8 bg-white p-5 shadow-[var(--shadow-subtle)] transition-[transform,opacity,border-color,box-shadow] duration-[var(--motion-normal)] [@media(hover:hover)]:hover:-translate-y-px hover:border-[var(--accent-gold)]/35 hover:shadow-[var(--shadow-floating)] sm:p-6">
                  <div className="flex items-start justify-between gap-4">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--text-tertiary)] sm:text-xs">
                      {stat.label}
                    </p>

                    <span
                      className="h-2 w-2 shrink-0 rounded-full bg-[var(--accent-gold)]"
                      aria-hidden
                    />
                  </div>

                  <div className="mt-5 flex items-end gap-2">
                    <span className="text-3xl font-semibold tracking-[-0.04em] text-[var(--text-primary)] sm:text-4xl">
                      {stat.value}
                    </span>

                    {stat.unit && (
                      <span className="pb-1 text-sm font-medium text-[var(--text-tertiary)]">
                        {stat.unit}
                      </span>
                    )}
                  </div>

                  {stat.trend && (
                    <p className="mt-4 inline-flex rounded-[var(--radius-large)] bg-[var(--primary)]/[0.06] px-3 py-1 text-xs font-semibold text-[var(--primary)]">
                      {stat.trend}
                    </p>
                  )}
                </li>
              </LandingReveal>
            ))}
          </ul>

          <div className="border-t border-[var(--primary)]/8 bg-[var(--surface-muted)] px-6 py-7 sm:px-10 sm:py-8">
            <p className="text-center text-sm leading-7 text-[var(--text-secondary)] sm:text-base">
              あなたが本当に集中したい仕事に時間を使えるように。
              <br className="hidden sm:inline" />
              MINERVOTは、毎日の業務を裏側で支え続けます。
            </p>
          </div>
        </LandingReveal>
      </div>
    </section>
  );
}
