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
          ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
          : "border-black/5 bg-black/[0.03] text-[#817478] dark:border-white/10 dark:bg-white/[0.04] dark:text-[#a99ca0]",
      )}
    >
      <span
        className={cn(
          "h-1.5 w-1.5 rounded-full",
          active
            ? "animate-soft-pulse bg-emerald-500"
            : "bg-[#a69a9d]",
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
      <div className="animate-landing-float overflow-hidden rounded-[28px] border border-[#7d1a2d]/10 bg-white/75 shadow-[0_35px_100px_rgba(74,18,31,0.16)] backdrop-blur-2xl dark:border-white/10 dark:bg-[#160d10]/80">
        {/* Browser header */}
        <div className="flex items-center justify-between border-b border-[#7d1a2d]/10 bg-white/70 px-4 py-3 backdrop-blur-xl dark:border-white/10 dark:bg-white/[0.03] sm:px-5">
          <div className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-[#ff5f57]" />
            <span className="h-2.5 w-2.5 rounded-full bg-[#febc2e]" />
            <span className="h-2.5 w-2.5 rounded-full bg-[#28c840]" />
          </div>

          <div className="hidden rounded-full border border-[#7d1a2d]/10 bg-white/80 px-5 py-1.5 text-[10px] font-medium text-[#8b7d80] shadow-sm sm:block dark:border-white/10 dark:bg-white/[0.04] dark:text-[#b9adb0]">
            minervot.app / executive dashboard
          </div>

          <div className="flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 animate-soft-pulse rounded-full bg-emerald-500" />
            <span className="text-[9px] font-bold tracking-[0.16em] text-emerald-700 dark:text-emerald-300">
              AI ONLINE
            </span>
          </div>
        </div>

        <div className="relative p-4 sm:p-6">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute right-[-90px] top-[-100px] h-64 w-64 rounded-full bg-[#7d1a2d]/10 blur-3xl"
          />

          <div
            aria-hidden="true"
            className="pointer-events-none absolute bottom-[-100px] left-[-80px] h-64 w-64 rounded-full bg-[#b58b4f]/10 blur-3xl"
          />

          {/* Dashboard header */}
          <div className="relative mb-5 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#a17b42]">
                Executive dashboard
              </p>

              <p className="mt-2 text-sm text-[#827579] dark:text-[#b9adb0]">
                {HERO_MOCKUP.greeting}
              </p>

              <h2 className="mt-1 text-lg font-semibold tracking-[-0.03em] text-[#2c1c20] dark:text-white sm:text-xl">
                {HERO_MOCKUP.headline}
              </h2>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-2xl border border-[#7d1a2d]/10 bg-white/75 px-4 py-3 shadow-sm dark:border-white/10 dark:bg-white/[0.04]">
                <p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-[#9a8d90]">
                  Today saved
                </p>
                <p className="mt-1 text-lg font-semibold text-[#74172a] dark:text-[#edc2cb]">
                  4h 28m
                </p>
              </div>

              <div className="rounded-2xl border border-[#b58b4f]/20 bg-[#fffaf1] px-4 py-3 shadow-sm dark:bg-[#b58b4f]/[0.07]">
                <p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-[#9a8d90]">
                  Confidence
                </p>
                <p className="mt-1 text-lg font-semibold text-[#9a7137] dark:text-[#dfbb7d]">
                  98%
                </p>
              </div>
            </div>
          </div>

          <div className="relative grid gap-4 sm:grid-cols-12">
            {/* Left column */}
            <div className="space-y-4 sm:col-span-7">
              <div className="rounded-[22px] border border-[#7d1a2d]/10 bg-white/72 p-4 shadow-[0_16px_45px_rgba(72,25,35,0.06)] backdrop-blur-xl dark:border-white/10 dark:bg-white/[0.035]">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-semibold text-[#38262b] dark:text-white">
                      本日の業務
                    </p>
                    <p className="mt-1 text-[10px] text-[#94878a]">
                      MINERVOTが自動で処理します
                    </p>
                  </div>

                  <span className="rounded-full bg-[#74172a]/8 px-2.5 py-1 text-[9px] font-semibold text-[#74172a] dark:bg-[#edc2cb]/10 dark:text-[#edc2cb]">
                    {HERO_MOCKUP.todayJobs.length} TASKS
                  </span>
                </div>

                <ul className="mt-4 space-y-2">
                  {HERO_MOCKUP.todayJobs.map((job, index) => (
                    <li
                      key={job.id}
                      className="group flex items-center justify-between gap-3 rounded-2xl border border-transparent bg-[#faf7f6] px-3 py-3 transition-all duration-300 hover:-translate-y-0.5 hover:border-[#7d1a2d]/10 hover:bg-white hover:shadow-sm dark:bg-white/[0.035] dark:hover:bg-white/[0.055]"
                    >
                      <span className="flex min-w-0 items-center gap-3">
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-white text-sm shadow-sm dark:bg-white/[0.06]">
                          {job.icon}
                        </span>

                        <span className="min-w-0">
                          <span className="block truncate text-xs font-semibold text-[#403034] dark:text-white sm:text-sm">
                            {job.title}
                          </span>
                          <span className="mt-0.5 block text-[9px] text-[#a09497]">
                            自動処理 #{String(index + 1).padStart(2, "0")}
                          </span>
                        </span>
                      </span>

                      <span className="shrink-0 rounded-full border border-[#7d1a2d]/10 bg-white px-2.5 py-1 text-[9px] font-medium text-[#76676b] dark:border-white/10 dark:bg-white/[0.04] dark:text-[#b9adb0]">
                        {job.status}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="rounded-[22px] border border-[#7d1a2d]/10 bg-white/72 p-4 shadow-[0_16px_45px_rgba(72,25,35,0.05)] backdrop-blur-xl dark:border-white/10 dark:bg-white/[0.035]">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold text-[#38262b] dark:text-white">
                    進行中
                  </p>

                  <span className="flex items-center gap-1.5 text-[9px] font-semibold text-[#91713d]">
                    <span className="h-1.5 w-1.5 animate-soft-pulse rounded-full bg-[#b58b4f]" />
                    PROCESSING
                  </span>
                </div>

                <ul className="mt-4 space-y-4">
                  {HERO_MOCKUP.inProgress.map((job) => (
                    <li key={job.id}>
                      <div className="flex items-center justify-between gap-3">
                        <span className="flex min-w-0 items-center gap-2 text-xs font-medium text-[#4a393e] dark:text-white sm:text-sm">
                          <span aria-hidden>{job.icon}</span>
                          <span className="truncate">{job.label}</span>
                        </span>

                        <span className="text-[10px] font-semibold text-[#8a777c]">
                          {job.progress}%
                        </span>
                      </div>

                      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[#efe7e8] dark:bg-white/[0.07]">
                        <div
                          className="h-full rounded-full bg-[linear-gradient(90deg,#74172a,#b58b4f)] transition-all duration-1000"
                          style={{ width: `${job.progress}%` }}
                        />
                      </div>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="rounded-[22px] border border-emerald-500/10 bg-emerald-500/[0.035] p-4 dark:bg-emerald-500/[0.04]">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold text-[#38262b] dark:text-white">
                    本日完了
                  </p>

                  <span className="text-[9px] font-semibold text-emerald-700 dark:text-emerald-300">
                    ALL SECURE
                  </span>
                </div>

                <ul className="mt-3 grid gap-2 sm:grid-cols-2">
                  {HERO_MOCKUP.completed.map((job) => (
                    <li
                      key={job.id}
                      className="flex items-center gap-2 rounded-xl bg-white/60 px-3 py-2 text-[11px] font-medium text-[#4d3c40] dark:bg-white/[0.035] dark:text-white"
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
              <div className="rounded-[22px] border border-[#7d1a2d]/10 bg-[linear-gradient(145deg,rgba(116,23,42,0.96),rgba(70,13,26,0.98))] p-4 text-white shadow-[0_18px_55px_rgba(116,23,42,0.24)]">
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
                      className="flex items-center justify-between gap-2 rounded-2xl border border-white/10 bg-white/[0.07] px-3 py-3 backdrop-blur"
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

              <div className="rounded-[22px] border border-[#7d1a2d]/10 bg-white/72 p-4 shadow-[0_16px_45px_rgba(72,25,35,0.05)] backdrop-blur-xl dark:border-white/10 dark:bg-white/[0.035]">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold text-[#38262b] dark:text-white">
                    接続サービス
                  </p>

                  <span className="text-[9px] font-semibold text-emerald-700 dark:text-emerald-300">
                    SECURE
                  </span>
                </div>

                <ul className="mt-3 grid grid-cols-2 gap-2">
                  {HERO_MOCKUP.connections.map((conn) => (
                    <li
                      key={conn.id}
                      className="flex items-center gap-2 rounded-xl border border-[#7d1a2d]/8 bg-[#faf7f6] px-3 py-2.5 text-[10px] font-semibold text-[#544348] dark:border-white/10 dark:bg-white/[0.035] dark:text-white"
                    >
                      <span
                        className={cn(
                          "h-1.5 w-1.5 shrink-0 rounded-full",
                          conn.connected
                            ? "bg-emerald-500"
                            : "bg-[#b8adb0]",
                        )}
                      />
                      <span className="truncate">{conn.name}</span>
                    </li>
                  ))}

                  <li className="flex items-center gap-2 rounded-xl border border-[#7d1a2d]/8 bg-[#faf7f6] px-3 py-2.5 text-[10px] font-semibold text-[#544348] dark:border-white/10 dark:bg-white/[0.035] dark:text-white">
                    <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" />
                    Supabase
                  </li>
                </ul>
              </div>

              <div className="rounded-[22px] border border-[#b58b4f]/20 bg-[linear-gradient(145deg,#fffaf2,#fff)] p-4 shadow-[0_18px_55px_rgba(100,67,24,0.08)] dark:bg-[linear-gradient(145deg,rgba(181,139,79,0.09),rgba(255,255,255,0.03))]">
                <div className="flex items-center gap-2">
                  <span className="flex h-7 w-7 items-center justify-center rounded-xl bg-[#74172a] text-[10px] font-bold text-white">
                    M
                  </span>

                  <div>
                    <p className="text-xs font-semibold text-[#38262b] dark:text-white">
                      MINERVOT
                    </p>
                    <p className="text-[9px] text-[#9a8d90]">
                      Personal AI Secretary
                    </p>
                  </div>
                </div>

                <div className="mt-4 rounded-2xl rounded-tr-md bg-[#74172a] px-3 py-3 text-[11px] leading-5 text-white shadow-sm">
                  営業資料を作成して、明日の午前9時までに準備して。
                </div>

                <div className="mt-3 rounded-2xl rounded-tl-md border border-[#7d1a2d]/8 bg-white px-3 py-3 shadow-sm dark:border-white/10 dark:bg-white/[0.05]">
                  <p className="text-[11px] leading-5 text-[#544348] dark:text-white">
                    かしこまりました。
                    <br />
                    過去の資料を参考に作成し、明日の予定に登録します。
                  </p>

                  <div className="mt-3 flex items-center justify-between">
                    <span className="flex items-center gap-1.5 text-[9px] font-semibold text-emerald-700 dark:text-emerald-300">
                      <span className="h-1.5 w-1.5 animate-soft-pulse rounded-full bg-emerald-500" />
                      実行を開始しました
                    </span>

                    <span className="text-[9px] text-[#a09497]">
                      約2分
                    </span>
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap gap-2">
                  <span className="rounded-full bg-[#74172a] px-3 py-1.5 text-[9px] font-semibold text-white">
                    仕事を依頼
                  </span>

                  <span className="rounded-full border border-[#b58b4f]/25 bg-white/70 px-3 py-1.5 text-[9px] font-semibold text-[#806235] dark:bg-white/[0.04] dark:text-[#dfbb7d]">
                    習慣に登録
                  </span>

                  <span className="rounded-full border border-[#7d1a2d]/10 bg-white/70 px-3 py-1.5 text-[9px] font-semibold text-[#74666a] dark:bg-white/[0.04] dark:text-[#b9adb0]">
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
