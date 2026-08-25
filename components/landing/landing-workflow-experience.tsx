import { LANDING_WORKFLOW_STEPS } from "@/lib/landing/content";

import { LandingReveal } from "./landing-reveal";

export function LandingWorkflowExperience() {
  return (
    <section
      id="workflow"
      className="border-t border-[var(--primary)]/8 bg-white px-4 py-20 sm:px-8 sm:py-28 lg:py-32"
    >
      <div className="mx-auto max-w-6xl">
        <LandingReveal className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-semibold tracking-[0.18em] text-[var(--primary)]">
            SIMPLE WORKFLOW
          </p>

          <h2 className="mt-4 text-3xl font-semibold tracking-[-0.04em] text-[var(--text-primary)] sm:text-4xl">
            MINERVOTの使い方
          </h2>

          <p className="mt-6 text-base leading-8 text-[var(--text-secondary)] sm:mt-8 sm:text-lg">
            複雑な設定や専門的なプロンプトは必要ありません。
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
                    className="pointer-events-none absolute -right-3 top-10 z-10 hidden text-lg font-semibold text-[var(--accent-gold)]/70 lg:block"
                    aria-hidden
                  >
                    →
                  </span>
                )}

                <div className="group flex h-full flex-col rounded-[26px] border border-[var(--primary)]/8 bg-white p-6 shadow-[var(--shadow-subtle)] transition-[transform,opacity,border-color,box-shadow] duration-[var(--motion-normal)] [@media(hover:hover)]:hover:-translate-y-px hover:border-[var(--accent-gold)]/40 hover:shadow-[var(--shadow-floating)] sm:p-7">
                  <div className="flex items-center gap-3">
                    <span
                      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-[var(--accent-gold)]/20 bg-[var(--surface-muted)] text-xl transition-transform duration-300 [@media(hover:hover)]:group-hover:scale-[1.02]"
                      aria-hidden
                    >
                      {step.icon}
                    </span>

                    <p className="text-xs font-semibold tracking-[0.12em] text-[var(--primary)]">
                      STEP {index + 1}
                    </p>
                  </div>

                  <h3 className="mt-5 text-lg font-semibold tracking-tight text-[var(--text-primary)]">
                    {step.label}
                  </h3>

                  <p className="mt-3 flex-1 text-sm leading-7 text-[var(--text-secondary)]">
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
          <div className="rounded-[30px] border border-[var(--accent-gold)]/20 bg-[var(--surface-muted)] px-6 py-8 shadow-[var(--shadow-subtle)] sm:px-10 sm:py-10">
            <p className="text-lg font-semibold leading-8 text-[var(--text-primary)]">
              毎回、細かい指示を入力する必要はありません。
            </p>

            <p className="mt-4 text-sm leading-7 text-[var(--text-secondary)] sm:text-base">
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
