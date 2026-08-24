import Link from "next/link";

import { LANDING_AUDIENCE } from "@/lib/landing/content";

import { LandingReveal } from "./landing-reveal";

export function LandingAudienceSection() {
  return (
    <section
      id="audience"
      className="border-t border-[var(--primary)]/8 bg-[var(--surface-muted)] px-4 py-20 sm:px-8 sm:py-28 lg:py-32"
    >
      <div className="mx-auto max-w-6xl">
        <LandingReveal className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-semibold tracking-[0.18em] text-[var(--primary)]">
            FOR EVERY WORKSTYLE
          </p>

          <h2 className="mt-4 text-3xl font-semibold tracking-[-0.04em] text-[var(--text-primary)] sm:text-4xl">
            こんな方におすすめです
          </h2>

          <p className="mt-6 text-base leading-8 text-[var(--text-secondary)] sm:mt-8 sm:text-lg">
            MINERVOTは、業種や働き方を問いません。
            <br />
            毎日の繰り返し作業を覚え、実行し、
            <br className="hidden sm:inline" />
            あなたの時間を生み出す専属AI秘書です。
          </p>
        </LandingReveal>

        <ul className="mt-14 grid grid-cols-2 gap-3 sm:mt-16 sm:gap-5 lg:grid-cols-4 lg:gap-6">
          {LANDING_AUDIENCE.map((item, index) => (
            <LandingReveal key={item.id} delayMs={index * 50}>
              <li className="h-full">
                <Link
                  href={item.href}
                  className="group flex h-full flex-col rounded-[24px] border border-[var(--primary)]/8 bg-white p-5 shadow-[var(--shadow-subtle)] transition-[transform,opacity,border-color,box-shadow] duration-[var(--motion-normal)] [@media(hover:hover)]:hover:-translate-y-px hover:border-[var(--accent-gold)]/40 hover:shadow-[var(--shadow-floating)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]/20 sm:p-7"
                >
                  <span
                    className="flex h-11 w-11 items-center justify-center rounded-2xl border border-[var(--accent-gold)]/20 bg-[var(--surface-muted)] text-2xl transition-transform duration-300 [@media(hover:hover)]:group-hover:scale-[1.02] sm:h-12 sm:w-12 sm:text-3xl"
                    aria-hidden
                  >
                    {item.icon}
                  </span>

                  <h3 className="mt-4 text-sm font-semibold tracking-tight text-[var(--text-primary)] transition-colors group-hover:text-[var(--primary)] sm:mt-5 sm:text-lg">
                    {item.title}
                  </h3>

                  <p className="mt-2 flex-1 text-xs leading-6 text-[var(--text-secondary)] sm:mt-3 sm:text-sm">
                    {item.description}
                  </p>
                </Link>
              </li>
            </LandingReveal>
          ))}
        </ul>

        <LandingReveal
          delayMs={180}
          className="mx-auto mt-14 max-w-3xl rounded-[28px] border border-[var(--accent-gold)]/20 bg-[var(--surface-muted)] px-6 py-8 text-center shadow-[var(--shadow-subtle)] sm:mt-16 sm:px-10 sm:py-10"
        >
          <p className="text-sm leading-7 text-[var(--text-secondary)] sm:text-base">
            個人の仕事から、チームや会社の業務まで。
            <br className="hidden sm:inline" />
            MINERVOTは、あなたの仕事の進め方に合わせて成長します。
          </p>
        </LandingReveal>
      </div>
    </section>
  );
}
