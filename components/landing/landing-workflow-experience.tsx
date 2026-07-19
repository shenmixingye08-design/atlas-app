import { LANDING_WORKFLOW_STEPS } from "@/lib/landing/content";

import { LandingReveal } from "./landing-reveal";

export function LandingWorkflowExperience() {
  return (
    <section
      id="workflow"
      className="border-t border-[var(--border-subtle)] bg-[var(--card)] px-4 py-20 sm:px-8 sm:py-28 lg:py-32"
    >
      <div className="mx-auto max-w-6xl">
        <LandingReveal className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-semibold tracking-[0.18em] text-[#74172A]">
            SIMPLE WORKFLOW
          </p>

          <h2 className="mt-4 text-2xl font-semibold tracking-tight text-foreground sm:text-3xl lg:text-4xl">
            MINERVOTの使い方
          </h2>

          <p className="mt-6 text-base leading-relaxed text-[var(--foreground-muted)] sm:mt-8 sm:text-lg sm:leading-relaxed">
            複雑な設定や、専門的なプロンプトは必要ありません。
            <br className="hidden sm:inline" />
            ご依頼内容と必要な資料を送るだけで、
            <br className="hidden sm:inline" />
            MINERVOTが仕事を整理し、実行まで進めます。
          </p>
        </LandingReveal>

        <ol className="mt-14 grid grid-cols-1 gap-4 sm:mt-16 sm:grid-cols-2 sm:gap-5 lg:grid-cols-4 lg:gap-6">
          {LANDING_WORKFLOW_STEPS.map((step, index) => (
            <LandingReveal key={step.id} delayMs={index * 60}>
              <li className="relative h-full">
                {index < LANDING_WORKFLOW_STEPS.length - 1 && (
                  <span
                    className="pointer-events-none absolute -right-3 top-10 z-10 hidden text-sm text-[#B58B4F]/70 lg:block"
                    aria-hidden
                  >
                    →
                  </span>
                )}

                <div className="group flex h-full flex-col rounded-[var(--radius-2xl)] border border-[var(--border-subtle)] bg-[var(--card)] p-6 shadow-[var(--shadow-sm)] transition-all duration-300 hover:-translate-y-1 hover:border-[#74172A]/30 hover:shadow-[var(--shadow-md)] sm:p-7">
                  <div className="flex items-center gap-3">
                    <span
                      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[var(--radius-xl)] bg-[#74172A]/8 text-xl transition-transform duration-300 group-hover:scale-105"
                      aria-hidden
                    >
                      {step.icon}
                    </span>

                    <p className="text-xs font-semibold tracking-[0.12em] text-[#74172A]">
                      STEP {index + 1}
                    </p>
                  </div>

                  <h3 className="mt-5 text-lg font-semibold tracking-tight text-foreground">
                    {step.label}
                  </h3>

                  <p className="mt-3 flex-1 text-sm leading-relaxed text-[var(--foreground-muted)]">
                    {step.detail}
                  </p>
                </div>
              </li>
            </LandingReveal>
          ))}
        </ol>

        <LandingReveal
          className="mx-auto mt-14 max-w-3xl text-center sm:mt-16"
          delayMs={200}
        >
          <div className="rounded-[var(--radius-2xl)] border border-[#B58B4F]/25 bg-gradient-to-br from-[#74172A]/5 via-transparent to-[#B58B4F]/10 px-6 py-8 sm:px-10 sm:py-10">
            <p className="text-base font-semibold leading-relaxed text-foreground sm:text-lg">
              毎回、細かい指示を入力する必要はありません。
            </p>

            <p className="mt-4 text-sm leading-relaxed text-[var(--foreground-muted)] sm:text-base">
              MINERVOTは、あなたの仕事の進め方や習慣を学習し、
              <br className="hidden sm:inline" />
              使うほど、あなた専属のAI秘書として成長します。
            </p>
          </div>
        </LandingReveal>
      </div>
    </section>
  );
}
