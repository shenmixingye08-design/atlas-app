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
          <h2 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
            ATLASが選ばれる理由
          </h2>
          <p className="mt-6 text-base leading-relaxed text-[var(--foreground-muted)] sm:mt-8 sm:text-lg sm:leading-relaxed">
            ATLASは、仕事を終わらせるだけではありません。
            <br className="hidden sm:inline" />
            <span className="mt-2 block sm:mt-0 sm:inline">
              仕事を覚え、
              <br className="hidden sm:inline" />
              繰り返し作業を減らし、
              <br className="hidden sm:inline" />
              次回はさらに効率よく進められるよう支援します。
            </span>
          </p>
        </LandingReveal>

        <ul className="mt-14 grid grid-cols-1 gap-4 sm:mt-16 sm:grid-cols-2 sm:gap-5 md:grid-cols-3 lg:grid-cols-5 lg:gap-5">
          {LANDING_REASONS.map((item, index) => (
            <LandingReveal key={item.id} delayMs={index * 50}>
              <li className="flex h-full flex-col rounded-[var(--radius-2xl)] border border-[var(--border-subtle)] bg-[var(--card)] p-6 shadow-[var(--shadow-sm)] sm:p-7">
                <span className="text-3xl" aria-hidden>
                  {item.icon}
                </span>
                <h3 className="mt-4 text-base font-semibold tracking-tight text-foreground sm:text-lg">
                  {item.title}
                </h3>
                <p className="mt-3 flex-1 text-sm leading-relaxed text-[var(--foreground-muted)]">
                  {item.description}
                </p>
              </li>
            </LandingReveal>
          ))}
        </ul>

        <LandingReveal className="mx-auto mt-14 max-w-2xl text-center sm:mt-16" delayMs={200}>
          <div className="rounded-[var(--radius-2xl)] border border-[var(--border-subtle)] bg-[var(--background-subtle)]/60 px-6 py-8 sm:px-10 sm:py-10">
            <p className="text-base leading-relaxed text-foreground sm:text-lg sm:leading-relaxed">
              ATLASは、
              <br className="sm:hidden" />
              「AIを使うためのサービス」
              <br className="sm:hidden" />
              ではなく、
              <br />
              「時間を生み出すためのサービス」
              <br className="sm:hidden" />
              です。
            </p>
          </div>
        </LandingReveal>
      </div>
    </section>
  );
}
