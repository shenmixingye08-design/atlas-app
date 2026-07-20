"use client";

import { HERO_MOCKUP } from "@/lib/landing/demo-data";
import { cn } from "@/lib/design-system/cn";

import { LandingReveal } from "./landing-reveal";

function StatusPill({
  active,
  label,
}: {
  active: boolean;
  label: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-semibold",
        active
          ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-700"
          : "border-[#74172A]/8 bg-[#74172A]/[0.03] text-[#817478]",
      )}
    >
      <span
        className={cn(
          "h-1.5 w-1.5 rounded-full",
          active
            ? "animate-soft-pulse bg-emerald-500"
            : "bg-[#A69A9D]",
        )}
      />

      {label}
    </span>
  );
}

export function LandingHeroMockup() {
  return (
    <LandingReveal
      className="mx-auto w-full max-w-[720px]"
      delayMs={200}
    >
      <div className="animate-landing-float overflow-hidden rounded-[28px] border border-[#74172A]/10 bg-white/80 shadow-[0_35px_100px_rgba(74,18,31,0.16)] backdrop-blur-2xl">
        {/* Browser header */}
        <div className="flex items-center justify-between border-b border-[#74172A]/10 bg-white/75 px-4 py-3 backdrop-blur-xl sm:px-5">
          <div className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-[#FF5F57]" />
            <span className="h-2.5 w-2.5 rounded-full bg-[#FEBC2E]" />
            <span className="h-2.5 w-2.5 rounded-full bg-[#28C840]" />
          </div>

          <div className="hidden rounded-full border border-[#74172A]/10 bg-white/85 px-5 py-1.5 text-[10px] font-medium text-[#8B7D80] shadow-sm sm:block">
            minervot.app / executive dashboard
          </div>

          <div className="flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 animate-soft-pulse rounded-full bg-emerald-500" />

            <span className="text-[9px] font-bold tracking-[0.16em] text-emerald-700">
              AI ONLINE
            </span>
          </div>
        </div>

        <div className="relative p-4 sm:p-6">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute right-[-90px] top-[-100px] h-64 w-64 rounded-full bg-[#74172A]/10 blur-3xl"
          />

          <div
            aria-hidden="true"
            className="pointer-events-none absolute bottom-[-100px] left-[-80px] h-64 w-64 rounded-full bg-[#B58B4F]/10 blur-3xl"
          />

          {/* Dashboard header */}
          <div className="relative mb-5 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#A17B42]">
                Executive dashboard
              </p>

              <p className="mt-2 text-sm text-[#827579]">
                {HERO_MOCKUP.greeting}
              </p>

              <h2 className="mt-1 text-lg font-semibold tracking-[-0.03em] text-[#2C1C20] sm:text-xl">
                {HERO_MOCKUP.headline}
              </h2>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-2xl border border-[#74172A]/10 bg-white/80 px-4 py-3 shadow-sm">
                <p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-[#9A8D90]">
                  Today saved
                </p>

                <p className="mt-1 text-lg font-semibold text-[#74172A]">
                  4h 28m
                </p>
              </div>

              <div className="rounded-2xl border border-[#B58B4F]/20 bg-[#FFFAF1] px-4 py-3 shadow-sm">
                <p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-[#9A8D90]">
                  Confidence
                </p>

                <p className="mt-1 text-lg font-semibold text-[#9A7137]">
                  98%
                </p>
              </div>
            </div>
          </div>
          <div className="relative grid gap-4 sm:grid-cols-12">
            {/* Left column */}
            <div className="space-y-4 sm:col-span-7">
              <div className="rounded-[22px] border border-[#74172A]/10 bg-white/80 p-4 shadow-[0_16px_45px_rgba(72,25,35,0.06)] backdrop-blur-xl">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-semibold text-[#38262B]">
                      本日の業務
                    </p>

                    <p className="mt-1 text-[10px] text-[#94878A]">
                      MINERVOTが自動で処理します
                    </p>
                  </div>

                  <span className="rounded-full bg-[#74172A]/8 px-2.5 py-1 text-[9px] font-semibold text-[#74172A]">
                    {HERO_MOCKUP.todayJobs.length} TASKS
                  </span>
                </div>

                <ul className="mt-4 space-y-2">
                  {HERO_MOCKUP.todayJobs.map((job, index) => (
                    <li
                      key={job.id}
                      className="group flex items-center justify-between gap-3 rounded-2xl border border-transparent bg-[#FAF7F6] px-3 py-3 transition-all duration-300 hover:-translate-y-0.5 hover:border-[#74172A]/10 hover:bg-white hover:shadow-sm"
                    >
                      <span className="flex min-w-0 items-center gap-3">
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-white text-sm shadow-sm">
                          {job.icon}
                        </span>

                        <span className="min-w-0">
                          <span className="block truncate text-xs font-semibold text-[#403034] sm:text-sm">
                            {job.title}
                          </span>

                          <span className="mt-0.5 block text-[9px] text-[#A09497]">
                            自動処理 #{String(index + 1).padStart(2, "0")}
                          </span>
                        </span>
                      </span>

                      <span className="shrink-0 rounded-full border border-[#74172A]/10 bg-white px-2.5 py-1 text-[9px] font-medium text-[#76676B]">
                        {job.status}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="rounded-[22px] border border-[#74172A]/10 bg-white/80 p-4 shadow-[0_16px_45px_rgba(72,25,35,0.05)] backdrop-blur-xl">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold text-[#38262B]">
                    進行中
                  </p>

                  <span className="flex items-center gap-1.5 text-[9px] font-semibold text-[#91713D]">
                    <span className="h-1.5 w-1.5 animate-soft-pulse rounded-full bg-[#B58B4F]" />
                    PROCESSING
                  </span>
                </div>

                <ul className="mt-4 space-y-4">
                  {HERO_MOCKUP.inProgress.map((job) => (
                    <li key={job.id}>
                      <div className="flex items-center justify-between gap-3">
                        <span className="flex min-w-0 items-center gap-2 text-xs font-medium text-[#4A393E] sm:text-sm">
                          <span aria-hidden>{job.icon}</span>
                          <span className="truncate">{job.label}</span>
                        </span>

                        <span className="text-[10px] font-semibold text-[#8A777C]">
                          {job.progress}%
                        </span>
                      </div>

                      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[#EFE7E8]">
                        <div
                          className="h-full rounded-full bg-[linear-gradient(90deg,#74172A,#B58B4F)] transition-all duration-1000"
                          style={{ width: `${job.progress}%` }}
                        />
                      </div>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="rounded-[22px] border border-emerald-500/10 bg-emerald-500/[0.035] p-4">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold text-[#38262B]">
                    本日完了
                  </p>

                  <span className="text-[9px] font-semibold text-emerald-700">
                    ALL SECURE
                  </span>
                </div>

                                <ul className="mt-3 grid gap-2 sm:grid-cols-2">
                  {HERO_MOCKUP.completed.map((job) => (
                    <li
                      key={job.id}
                      className="flex items-center gap-2 rounded-xl bg-[#FAF7F6] px-3 py-2 text-[11px] font-medium text-[#4D3C40]"
                    >
                      <span className="flex h-4 w-4 items-center justify-center rounded-full bg-emerald-500 text-[9px] text-white">
                        ✓
                      </span>

                      <span aria-hidden>{job.icon}</span>
                      <span className="truncate">{job.title}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            {/* Right column */}
            <div className="space-y-4 sm:col-span-5">
              <div className="rounded-[22px] border border-[#74172A]/10 bg-[linear-gradient(145deg,#74172A,#460D1A)] p-4 text-white shadow-[0_18px_55px_rgba(116,23,42,0.24)]">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-[9px] font-semibold uppercase tracking-[0.18em] text-white/55">
                      Minervot intelligence
                    </p>

                    <p className="mt-1 text-sm font-semibold">
                      AI秘書の稼働状況
                    </p>
                  </div>

                  <StatusPill active label="AI ONLINE" />
                </div>

                <ul className="mt-4 space-y-2">
                  {HERO_MOCKUP.aiEmployees.map((emp) => (
                    <li
                      key={emp.id}
                      className="flex items-center justify-between gap-2 rounded-2xl border border-white/15 bg-white/10 px-3 py-3 backdrop-blur"
                    >
                      <span className="flex min-w-0 items-center gap-2.5">
                        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-white/10 text-sm">
                          {emp.icon}
                        </span>

                        <span className="truncate text-xs font-medium text-white">
                          {emp.role}
                        </span>
                      </span>

                      <StatusPill
                        active={emp.status === "active"}
                        label={emp.status === "active" ? "稼働中" : "待機中"}
                      />
                    </li>
                  ))}
                </ul>
              </div>

              <div className="rounded-[22px] border border-[#74172A]/10 bg-white/80 p-4 shadow-[0_16px_45px_rgba(72,25,35,0.05)] backdrop-blur-xl">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold text-[#38262B]">
                    接続サービス
                  </p>

                  <span className="text-[9px] font-semibold text-emerald-700">
                    SECURE
                  </span>
                </div>

                            <ul className="mt-3 grid grid-cols-2 gap-2">
                  {HERO_MOCKUP.connections.map((conn) => (
                    <li
                      key={conn.id}
                      className="flex items-center gap-2 rounded-xl border border-[#74172A]/8 bg-[#FAF7F6] px-3 py-2.5 text-[10px] font-semibold text-[#544348]"
                    >
                      <span
                        className={cn(
                          "h-1.5 w-1.5 shrink-0 rounded-full",
                          conn.connected
                            ? "bg-emerald-500"
                            : "bg-[#B8ADB0]",
                        )}
                      />

                      <span className="truncate">{conn.name}</span>
                    </li>
                  ))}

                  <li className="flex items-center gap-2 rounded-xl border border-[#74172A]/8 bg-[#FAF7F6] px-3 py-2.5 text-[10px] font-semibold text-[#544348]">
                    <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" />
                    Supabase
                  </li>
                </ul>
              </div>

              <div className="rounded-[22px] border border-[#B58B4F]/20 bg-[linear-gradient(145deg,#FFFAF2,#FFFFFF)] p-4 shadow-[0_18px_55px_rgba(100,67,24,0.08)]">
                <div className="flex items-center gap-2">
                  <span className="flex h-7 w-7 items-center justify-center rounded-xl bg-[#74172A] text-[10px] font-bold text-white">
                    M
                  </span>

                  <div>
                    <p className="text-xs font-semibold text-[#38262B]">
                      MINERVOT
                    </p>

                    <p className="text-[9px] text-[#9A8D90]">
                      Personal AI Secretary
                    </p>
                  </div>
                </div>

                <div className="mt-4 rounded-2xl rounded-tr-md bg-[#74172A] px-3 py-3 text-[11px] leading-5 text-white shadow-sm">
                  営業資料を作成して、明日の午前9時までに準備して。
                </div>

                <div className="mt-3 rounded-2xl rounded-tl-md border border-[#74172A]/8 bg-white px-3 py-3 shadow-sm">
                  <p className="text-[11px] leading-5 text-[#544348]">
                    かしこまりました。
                    <br />
                    過去の資料を参考に作成し、明日の予定に登録します。
                  </p>

                  <div className="mt-3 flex items-center justify-between">
                    <span className="flex items-center gap-1.5 text-[9px] font-semibold text-emerald-700">
                      <span className="h-1.5 w-1.5 animate-soft-pulse rounded-full bg-emerald-500" />
                      実行を開始しました
                    </span>

                    <span className="text-[9px] text-[#A09497]">
                      約2分
                    </span>
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap gap-2">
                  <span className="rounded-full bg-[#74172A] px-3 py-1.5 text-[9px] font-semibold text-white">
                    仕事を依頼
                  </span>

                  <span className="rounded-full border border-[#B58B4F]/25 bg-white/75 px-3 py-1.5 text-[9px] font-semibold text-[#806235]">
                    習慣に登録
                  </span>

                  <span className="rounded-full border border-[#74172A]/10 bg-white/75 px-3 py-1.5 text-[9px] font-semibold text-[#74666A]">
                    状況を確認
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </LandingReveal>
  );
}
