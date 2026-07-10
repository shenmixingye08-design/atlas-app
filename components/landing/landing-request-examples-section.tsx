import {
  LANDING_EXAMPLE_STATUS_LABEL,
  LANDING_REQUEST_EXAMPLES,
  type LandingExampleStatus,
} from "@/lib/landing/content";
import { cn } from "@/lib/design-system/cn";

import { LandingReveal } from "./landing-reveal";

function statusClassName(status: LandingExampleStatus): string {
  switch (status) {
    case "available":
      return "bg-[var(--status-success-bg)] text-[var(--status-success)]";
    case "partial":
      return "bg-[var(--accent-muted)] text-accent";
    case "upcoming":
      return "bg-[var(--background-subtle)] text-[var(--foreground-subtle)]";
  }
}

export function LandingRequestExamplesSection() {
  return (
    <section
      id="examples"
      className="border-t border-[var(--border-subtle)] bg-white px-4 py-20 sm:px-8 sm:py-28 lg:py-32"
    >
      <div className="mx-auto max-w-6xl">
        <LandingReveal className="mx-auto max-w-2xl text-center">
          <h2 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
            このような仕事を、ATLASへ。
          </h2>
          <p className="mt-6 text-base leading-relaxed text-[var(--foreground-muted)] sm:mt-8 sm:text-lg sm:leading-relaxed">
            写真や資料と、ご依頼内容をご提供ください。
            <br className="hidden sm:inline" />
            <span className="mt-2 block sm:mt-0 sm:inline">
              ATLASが内容を理解し、
              <br className="hidden sm:inline" />
              整理・作成・記録・分析までをお手伝いします。
            </span>
          </p>
        </LandingReveal>

        <ul className="mt-14 grid grid-cols-1 gap-4 sm:mt-16 sm:grid-cols-2 sm:gap-5 lg:grid-cols-3 lg:gap-6">
          {LANDING_REQUEST_EXAMPLES.map((item, index) => (
            <LandingReveal key={item.id} delayMs={index * 50}>
              <li className="flex h-full flex-col rounded-[var(--radius-2xl)] border border-[var(--border-subtle)] bg-white p-6 shadow-[var(--shadow-sm)] sm:p-7">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <span className="text-2xl" aria-hidden>
                      {item.icon}
                    </span>
                    <h3 className="text-lg font-semibold tracking-tight text-foreground">
                      {item.title}
                    </h3>
                  </div>
                  <span
                    className={cn(
                      "shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-medium",
                      statusClassName(item.status),
                    )}
                  >
                    {LANDING_EXAMPLE_STATUS_LABEL[item.status]}
                  </span>
                </div>

                <div className="mt-6 space-y-0">
                  <div className="rounded-[var(--radius-xl)] bg-[var(--background-subtle)]/80 px-4 py-3">
                    <p className="text-[11px] font-medium tracking-wide text-[var(--foreground-subtle)]">
                      資料を送る
                    </p>
                    <p className="mt-1.5 text-sm leading-relaxed text-foreground">{item.input}</p>
                  </div>

                  <div className="flex justify-center py-1.5 text-[var(--border-strong)]" aria-hidden>
                    <span className="text-sm leading-none">↓</span>
                  </div>

                  <div className="rounded-[var(--radius-xl)] border border-[var(--border-subtle)] bg-white px-4 py-3">
                    <p className="text-[11px] font-medium tracking-wide text-[var(--foreground-subtle)]">
                      普段の言葉で依頼する
                    </p>
                    <p className="mt-1.5 text-sm leading-relaxed text-foreground">
                      「{item.request}」
                    </p>
                  </div>

                  <div className="flex justify-center py-1.5 text-[var(--border-strong)]" aria-hidden>
                    <span className="text-sm leading-none">↓</span>
                  </div>

                  <div className="rounded-[var(--radius-xl)] bg-[var(--accent-muted)]/50 px-4 py-3">
                    <p className="text-[11px] font-medium tracking-wide text-accent">
                      ATLASが仕事を進める
                    </p>
                    <p className="mt-1.5 text-sm leading-relaxed text-foreground">{item.result}</p>
                  </div>
                </div>
              </li>
            </LandingReveal>
          ))}
        </ul>
      </div>
    </section>
  );
}
