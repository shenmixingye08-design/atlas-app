import { LANDING_REASONS } from "@/lib/landing/content";

import { LandingReveal } from "./landing-reveal";

export function LandingReasonsSection() {
  return (
    <section
      id="reasons"
      className="border-t border-[var(--primary)]/8 bg-[var(--surface-muted)] px-4 py-20 sm:px-8 sm:py-28 lg:py-32"
    >
      <div className="mx-auto max-w-6xl">
        <LandingReveal className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-semibold tracking-[0.18em] text-[var(--primary)]">
            WHY MINERVOT
          </p>

          <h2 className="mt-4 text-3xl font-semibold tracking-[-0.04em] text-[var(--text-primary)] sm:text-4xl">
            MINERVOTが選ばれる理由
          </h2>

          <p className="mt-6 text-base leading-8 text-[var(--text-secondary)] sm:mt-8 sm:text-lg">
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
              <li className="group flex h-full flex-col rounded-[24px] border border-[var(--primary)]/8 bg-white p-6 shadow-[var(--shadow-subtle)] transition-[transform,opacity,border-color,box-shadow] duration-[var(--motion-normal)] [@media(hover:hover)]:hover:-translate-y-px hover:border-[var(--accent-gold)]/40 hover:shadow-[var(--shadow-floating)] sm:p-7">
                <span
                  className="flex h-12 w-12 items-center justify-center rounded-2xl border border-[var(--accent-gold)]/20 bg-[var(--surface-muted)] text-3xl transition-transform duration-300 [@media(hover:hover)]:group-hover:scale-[1.02]"
                  aria-hidden
                >
                  {item.icon}
                </span>

                <h3 className="mt-5 text-base font-semibold tracking-tight text-[var(--text-primary)] sm:text-lg">
                  {item.title}
                </h3>

                <p className="mt-3 flex-1 text-sm leading-7 text-[var(--text-secondary)]">
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
          <div className="rounded-[30px] border border-[var(--accent-gold)]/20 bg-[var(--surface-muted)] px-6 py-9 shadow-[var(--shadow-subtle)] sm:px-10 sm:py-11">
            <p className="text-sm font-semibold tracking-[0.16em] text-[var(--primary)]">
              OUR PURPOSE
            </p>

            <p className="mt-4 text-lg font-semibold leading-8 text-[var(--text-primary)] sm:text-xl">
              MINERVOTは、
              <br className="sm:hidden" />
              AIを使うためのサービスではありません。
            </p>

            <p className="mt-3 text-lg font-semibold leading-8 text-[var(--text-primary)] sm:text-xl">
              あなたの仕事を代わりに終わらせ、
              <br className="sm:hidden" />
              時間を生み出すためのサービスです。
            </p>

            <p className="mx-auto mt-5 max-w-xl text-sm leading-7 text-[var(--text-secondary)] sm:text-base">
              面倒な作業を任せ、本当に集中したい仕事へ。
              MINERVOTが、毎日の働き方を少しずつ変えていきます。
            </p>
          </div>
        </LandingReveal>
      </div>
    </section>
  );
}
