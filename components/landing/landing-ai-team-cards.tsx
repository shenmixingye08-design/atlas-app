"use client";

import { LANDING_AI_TEAM_CARDS } from "@/lib/landing/demo-data";
import { cn } from "@/lib/design-system/cn";

import { LandingReveal } from "./landing-reveal";

export function LandingAiTeamCards() {
  return (
    <section className="border-t border-[#74172A]/8 bg-[#FAF6F5] px-4 py-20 sm:px-8 sm:py-28">
      <div className="mx-auto max-w-6xl">
        <LandingReveal className="mx-auto max-w-2xl text-center">
          <p className="text-[10px] font-semibold uppercase tracking-[0.25em] text-[#91703D]">
            AI SECRETARY TEAM
          </p>

          <h2 className="mt-4 text-3xl font-semibold tracking-[-0.04em] text-[#281A1E] sm:text-4xl">
            あなたのAI秘書チーム
          </h2>

          <p className="mt-5 text-sm leading-7 text-[#75686B] sm:text-base">
            専門ごとに担当業務を分担し、
            <br className="hidden sm:block" />
            稼働状況と今日の件数をひと目で確認できます。
          </p>
        </LandingReveal>

        <ul className="mt-12 grid gap-5 sm:grid-cols-2">
          {LANDING_AI_TEAM_CARDS.map((member, index) => (
            <LandingReveal key={member.id} delayMs={index * 80}>
              <li className="group h-full rounded-[24px] border border-[#74172A]/8 bg-white p-6 shadow-[0_16px_50px_rgba(70,20,31,0.05)] transition-all duration-300 hover:-translate-y-1 hover:border-[#B58B4F]/35 hover:shadow-[0_24px_65px_rgba(70,20,31,0.1)] sm:p-8">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-4">
                    <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-[#B58B4F]/20 bg-[#FFF8EB] text-2xl shadow-sm transition-transform duration-300 group-hover:scale-105">
                      {member.icon}
                    </span>

                    <div>
                      <h3 className="text-lg font-semibold text-[#302125]">
                        {member.role}
                      </h3>

                      <p className="mt-1 text-sm leading-6 text-[#75686B]">
                        {member.subtitle}
                      </p>
                    </div>
                  </div>

                  <span
                    className={cn(
                      "shrink-0 rounded-full border px-2.5 py-1 text-[10px] font-semibold sm:text-xs",
                      member.status === "active"
                        ? "border-emerald-500/15 bg-emerald-500/10 text-emerald-700"
                        : "border-[#74172A]/8 bg-[#74172A]/[0.03] text-[#817478]",
                    )}
                  >
                    {member.status === "active" ? "稼働中" : "待機中"}
                  </span>
                </div>

                <dl className="mt-6 grid grid-cols-2 gap-3 border-t border-[#74172A]/8 pt-5">
                  <div className="rounded-2xl bg-[#FAF7F6] px-3 py-3">
                    <dt className="text-[10px] text-[#8B7E81] sm:text-xs">
                      状態
                    </dt>

                    <dd className="mt-1 text-sm font-semibold text-[#38262B]">
                      {member.status === "active" ? "現在稼働中" : "待機中"}
                    </dd>
                  </div>

                  <div className="rounded-2xl border border-[#B58B4F]/15 bg-[#FFF9EF] px-3 py-3">
                    <dt className="text-[10px] text-[#8B7E81] sm:text-xs">
                      今日の担当
                    </dt>

                    <dd className="mt-1 text-sm font-semibold text-[#9A7137]">
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
