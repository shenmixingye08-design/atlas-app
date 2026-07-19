import { LANDING_REASONS } from "@/lib/landing/content";

import { LandingReveal } from "./landing-reveal";

export function LandingReasonsSection() {
  return (
    <section
      id="reasons"
      className="border-t border-[var(--border-subtle)] bg-[var(--card)] px-4 py-20 sm:px-8 sm:py-28 lg:py-32"
    >
      <div className="mx-auto max-w-6xl">
        <LandingReveal className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-semibold tracking-[0.18em] text-[#74172A]">
            WHY MINERVOT
          </p>

          <h2 className="mt-4 text-2xl font-semibold tracking-tight text-foreground sm:text-3xl lg:text-4xl">
            MINERVOTが選ばれる理由
          </h2>

          <p className="mt-6 text-base leading-relaxed text-[var(--foreground-muted)] sm:mt-8 sm:text-lg sm:leading-relaxed">
            MINERVOTは、目の前の仕事を終わらせるだけではありません。
            <br className="hidden sm:inline" />
            あなたの進め方を学び、繰り返し作業を減らし、
            <br className="hidden sm:inline" />
            次の仕事をより早く、よりスムーズに進めます。
          </p>
        </LandingReveal>

        <ul className="mt-14 grid grid-cols-1 gap-4 sm:mt-16 sm:grid-cols-2 sm:gap-5 md:grid-cols-3 lg:grid-cols-5 lg:gap-5">
          {LANDING_REASONS.map((item, index) => (
            <LandingReveal key={item.id} delayMs={index * 50}>
              <li className="group flex h-full flex-col rounded-[var(--radius-2xl)] border border-[var(--border-subtle)] bg-[var(--card)] p-6 shadow-[var(--shadow-sm)] transition-all duration-300 hover:-translate-y-1 hover:border-[#74172A]/30 hover:shadow-[var(--shadow-md)] sm:p-7">
                <span
                  className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#74172A]/8 text-3xl transition-transform duration-300 group-hover:scale-105"
                  aria-hidden
                >
                  {item.icon}
                </span>

                <h3 className="mt-5 text-base font-semibold tracking-tight text-foreground sm:text-lg">
                  {item.title}
                </h3>

                <p className="mt-3 flex-1 text-sm leading-relaxed text-[var(--foreground-muted)]">
                  {item.description}
                </p>
              </li>
            </LandingReveal>
          ))}
        </ul>

        <LandingReveal
          className="mx-auto mt-14 max-w-3xl text-center sm:mt-16"
          delayMs={200}
        >
          <div className="rounded-[var(--radius-2xl)] border border-[#B58B4F]/25 bg-gradient-to-br from-[#74172A]/5 via-transparent to-[#B58B4F]/10 px-6 py-9 sm:px-10 sm:py-11">
            <p className="text-sm font-semibold tracking-[0.16em] text-[#74172A]">
              OUR PURPOSE
            </p>

            <p className="mt-4 text-lg font-semibold leading-relaxed text-foreground sm:text-xl">
              MINERVOTは、
              <br className="sm:hidden" />
              AIを使うためのサービスではありません。
            </p>

            <p className="mt-3 text-lg font-semibold leading-relaxed text-foreground sm:text-xl">
              あなたの時間を生み出すための、
              <br className="sm:hidden" />
              専属AI秘書です。
            </p>

            <p className="mx-auto mt-5 max-w-xl text-sm leading-relaxed text-[var(--foreground-muted)] sm:text-base">
              面倒な作業を任せ、本当に集中したい仕事へ。
              MINERVOTが、毎日の働き方を少しずつ変えていきます。
            </p>
          </div>
        </LandingReveal>
      </div>
    </section>
  );
}
