"use client";

import { LANDING_DASHBOARD_STATS } from "@/lib/landing/demo-data";

import { LandingReveal } from "./landing-reveal";

export function LandingResultsDashboard() {
  return (
    <section className="border-t border-[var(--border-subtle)] bg-[var(--background-subtle)]/50 px-4 py-20 sm:px-8 sm:py-28">
      <div className="mx-auto max-w-6xl">
        <LandingReveal className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-semibold tracking-[0.18em] text-[#74172A]">
            LIVE DASHBOARD
          </p>

          <h2 className="mt-4 text-2xl font-semibold tracking-tight text-foreground sm:text-3xl lg:text-4xl">
            あなたのAI秘書は、
            <br className="sm:hidden" />
            今日も仕事を進めています。
          </h2>

          <p className="mt-6 text-base leading-relaxed text-[var(--foreground-muted)] sm:text-lg">
            MINERVOTのダッシュボードでは、
            完了した業務・自動化された作業・節約できた時間を
            リアルタイムで確認できます。
          </p>
        </LandingReveal>

        <div className="mt-14 overflow-hidden rounded-[var(--radius-2xl)] border border-[#B58B4F]/20 bg-white shadow-xl backdrop-blur-sm">
          <div className="flex items-center justify-between border-b border-[var(--border-subtle)] px-6 py-5">
            <div>
              <p className="text-lg font-semibold text-foreground">
                MINERVOT Dashboard
              </p>
              <p className="mt-1 text-sm text-[var(--foreground-muted)]">
                リアルタイム業務レポート
              </p>
            </div>

            <span className="rounded-full bg-[#74172A]/10 px-4 py-1 text-xs font-semibold text-[#74172A]">
              ● LIVE
            </span>
          </div>

          <ul className="grid gap-4 p-6 sm:grid-cols-2 lg:grid-cols-3">
            {LANDING_DASHBOARD_STATS.map((stat, index) => (
              <LandingReveal key={stat.id} delayMs={index * 70}>
                <li className="rounded-2xl border border-[var(--border-subtle)] bg-gradient-to-br from-white via-white to-[#74172A]/5 p-5 transition-all duration-300 hover:-translate-y-1 hover:border-[#74172A]/20 hover:shadow-lg">
                  <p className="text-xs font-medium uppercase tracking-[0.12em] text-[var(--foreground-muted)]">
                    {stat.label}
                  </p>

                  <div className="mt-3 flex items-end gap-2">
                    <span className="text-3xl font-bold tracking-tight text-foreground">
                      {stat.value}
                    </span>

                    {stat.unit && (
                      <span className="pb-1 text-sm text-[var(--foreground-muted)]">
                        {stat.unit}
                      </span>
                    )}
                  </div>

                  {stat.trend && (
                    <p className="mt-3 text-sm font-semibold text-[#74172A]">
                      {stat.trend}
                    </p>
                  )}
                </li>
              </LandingReveal>
            ))}
          </ul>

          <div className="border-t border-[var(--border-subtle)] bg-gradient-to-r from-[#74172A]/5 via-transparent to-[#B58B4F]/10 px-6 py-6">
            <p className="text-center text-sm leading-relaxed text-[var(--foreground-muted)] sm:text-base">
              あなたが本当に集中したい仕事に時間を使えるように。
              <br className="hidden sm:inline" />
              MINERVOTは、毎日の業務を裏側で支え続けます。
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
