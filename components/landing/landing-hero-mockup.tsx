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
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[10px] font-medium sm:text-xs",
        active
          ? "bg-[var(--status-success-bg)] text-[var(--status-success)]"
          : "bg-[var(--status-neutral-bg)] text-[var(--foreground-muted)]",
      )}
    >
      <span
        className={cn(
          "h-1.5 w-1.5 rounded-full",
          active ? "bg-[var(--status-success)] animate-soft-pulse" : "bg-[var(--foreground-subtle)]",
        )}
      />
      {label}
    </span>
  );
}

export function LandingHeroMockup() {
  return (
    <LandingReveal className="mx-auto mt-14 w-full max-w-5xl sm:mt-16" delayMs={200}>
      <div className="landing-glass landing-hero-mockup animate-landing-float overflow-hidden rounded-[var(--radius-2xl)] shadow-[var(--shadow-lg)]">
        {/* Browser chrome */}
        <div className="flex items-center gap-2 border-b border-[var(--border-subtle)] bg-white/60 px-4 py-3">
          <span className="h-2.5 w-2.5 rounded-full bg-[#ff5f57]" />
          <span className="h-2.5 w-2.5 rounded-full bg-[#febc2e]" />
          <span className="h-2.5 w-2.5 rounded-full bg-[#28c840]" />
          <span className="ml-3 text-xs text-[var(--foreground-muted)]">atlas.app / ホーム</span>
        </div>

        <div className="grid gap-4 p-4 sm:grid-cols-12 sm:gap-5 sm:p-6">
          {/* Left column — today's work */}
          <div className="space-y-4 sm:col-span-7">
            <div>
              <p className="text-xs text-[var(--foreground-muted)]">{HERO_MOCKUP.greeting}</p>
              <p className="mt-1 text-sm font-semibold text-foreground sm:text-base">
                {HERO_MOCKUP.headline}
              </p>
            </div>

            <div className="rounded-[var(--radius-xl)] border border-[var(--border-subtle)] bg-white/80 p-4">
              <p className="text-xs font-semibold text-foreground">今日の仕事</p>
              <ul className="mt-3 space-y-2">
                {HERO_MOCKUP.todayJobs.map((job) => (
                  <li
                    key={job.id}
                    className="flex items-center justify-between gap-2 rounded-[var(--radius-lg)] bg-[var(--background-subtle)] px-3 py-2.5"
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <span aria-hidden>{job.icon}</span>
                      <span className="truncate text-xs font-medium text-foreground sm:text-sm">
                        {job.title}
                      </span>
                    </span>
                    <span className="shrink-0 rounded-full bg-white px-2 py-0.5 text-[10px] text-[var(--foreground-muted)]">
                      {job.status}
                    </span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="rounded-[var(--radius-xl)] border border-[var(--border-subtle)] bg-white/80 p-4">
              <p className="text-xs font-semibold text-foreground">進行中の仕事</p>
              <ul className="mt-3 space-y-3">
                {HERO_MOCKUP.inProgress.map((job) => (
                  <li key={job.id}>
                    <div className="flex items-center gap-2 text-xs text-foreground sm:text-sm">
                      <span aria-hidden>{job.icon}</span>
                      {job.label}
                    </div>
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[var(--background-subtle)]">
                      <div
                        className="h-full rounded-full bg-accent transition-all duration-1000"
                        style={{ width: `${job.progress}%` }}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            </div>

            <div className="rounded-[var(--radius-xl)] border border-[var(--border-subtle)] bg-white/80 p-4">
              <p className="text-xs font-semibold text-foreground">本日完了</p>
              <ul className="mt-2 space-y-1.5">
                {HERO_MOCKUP.completed.map((job) => (
                  <li key={job.id} className="flex items-center gap-2 text-xs text-foreground sm:text-sm">
                    <span className="text-[var(--status-success)]">✓</span>
                    <span aria-hidden>{job.icon}</span>
                    {job.title}
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* Right column — AI status + connections + chat */}
          <div className="space-y-4 sm:col-span-5">
            <div className="rounded-[var(--radius-xl)] border border-[var(--border-subtle)] bg-white/80 p-4">
              <p className="text-xs font-semibold text-foreground">AI秘書の稼働状況</p>
              <ul className="mt-3 space-y-2">
                {HERO_MOCKUP.aiEmployees.map((emp) => (
                  <li
                    key={emp.id}
                    className="flex items-center justify-between gap-2 rounded-[var(--radius-lg)] bg-[var(--background-subtle)] px-3 py-2"
                  >
                    <span className="flex items-center gap-2 text-xs sm:text-sm">
                      <span aria-hidden>{emp.icon}</span>
                      <span className="font-medium text-foreground">{emp.role}</span>
                    </span>
                    <StatusPill
                      active={emp.status === "active"}
                      label={emp.status === "active" ? "稼働中" : "待機中"}
                    />
                  </li>
                ))}
              </ul>
            </div>

            <div className="rounded-[var(--radius-xl)] border border-[var(--border-subtle)] bg-white/80 p-4">
              <p className="text-xs font-semibold text-foreground">接続状態</p>
              <ul className="mt-3 flex flex-wrap gap-2">
                {HERO_MOCKUP.connections.map((conn) => (
                  <li
                    key={conn.id}
                    className="flex items-center gap-1.5 rounded-full border border-[var(--border-subtle)] bg-white px-3 py-1.5 text-xs"
                  >
                    <span
                      className={cn(
                        "h-1.5 w-1.5 rounded-full",
                        conn.connected ? "bg-[var(--status-success)]" : "bg-[var(--foreground-subtle)]",
                      )}
                    />
                    {conn.name}
                  </li>
                ))}
              </ul>
            </div>

            <div className="rounded-[var(--radius-xl)] border border-[var(--border-subtle)] bg-white/80 p-4">
              <p className="text-xs font-semibold text-foreground">仕事の依頼</p>
              <div className="mt-3 rounded-[var(--radius-lg)] bg-[var(--background-subtle)] px-3 py-3 text-xs text-[var(--foreground-muted)]">
                {HERO_MOCKUP.chatPlaceholder}
              </div>
              <div className="mt-3 flex gap-2">
                <span className="rounded-full bg-accent px-3 py-1.5 text-[10px] font-medium text-white">
                  仕事を依頼
                </span>
                <span className="rounded-full border border-[var(--border-subtle)] bg-white px-3 py-1.5 text-[10px] text-[var(--foreground-muted)]">
                  習慣に登録
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </LandingReveal>
  );
}
