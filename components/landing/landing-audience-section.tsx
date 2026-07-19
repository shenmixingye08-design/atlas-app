import Link from "next/link";

import { LANDING_AUDIENCE } from "@/lib/landing/content";

import { LandingReveal } from "./landing-reveal";

export function LandingAudienceSection() {
  return (
    <section
      id="audience"
      className="border-t border-[var(--border-subtle)] bg-[var(--card)] px-4 py-20 sm:px-8 sm:py-28 lg:py-32"
    >
      <div className="mx-auto max-w-6xl">
        <LandingReveal className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-semibold tracking-[0.18em] text-[#74172A]">
            FOR EVERY WORKSTYLE
          </p>

          <h2 className="mt-4 text-2xl font-semibold tracking-tight text-foreground sm:text-3xl lg:text-4xl">
            こんな方におすすめです
          </h2>

          <p className="mt-6 text-base leading-relaxed text-[var(--foreground-muted)] sm:mt-8 sm:text-lg sm:leading-relaxed">
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
                  className="group flex h-full flex-col rounded-[var(--radius-2xl)] border border-[var(--border-subtle)] bg-[var(--card)] p-4 shadow-[var(--shadow-sm)] transition-all duration-300 hover:-translate-y-1 hover:border-[#74172A]/30 hover:shadow-[var(--shadow-md)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#74172A]/30 sm:p-7"
                >
                  <span
                    className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#74172A]/8 text-2xl transition-transform duration-300 group-hover:scale-105 sm:h-12 sm:w-12 sm:text-3xl"
                    aria-hidden
                  >
                    {item.icon}
                  </span>

                  <h3 className="mt-4 text-sm font-semibold tracking-tight text-foreground transition-colors group-hover:text-[#74172A] sm:mt-5 sm:text-lg">
                    {item.title}
                  </h3>

                  <p className="mt-2 flex-1 text-xs leading-relaxed text-[var(--foreground-muted)] sm:mt-3 sm:text-sm">
                    {item.description}
                  </p>
                </Link>
              </li>
            </LandingReveal>
          ))}
        </ul>

        <LandingReveal
          delayMs={180}
          className="mx-auto mt-14 max-w-3xl rounded-[var(--radius-2xl)] border border-[#B58B4F]/25 bg-gradient-to-br from-[#74172A]/5 via-transparent to-[#B58B4F]/10 px-6 py-7 text-center sm:mt-16 sm:px-10 sm:py-9"
        >
          <p className="text-sm leading-relaxed text-[var(--foreground-muted)] sm:text-base">
            個人の仕事から、チームや会社の業務まで。
            <br className="hidden sm:inline" />
            MINERVOTは、あなたの仕事の進め方に合わせて成長します。
          </p>
        </LandingReveal>
      </div>
    </section>
  );
}
