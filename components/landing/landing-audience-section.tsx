import Link from "next/link";

import { LANDING_AUDIENCE } from "@/lib/landing/content";

import { LandingReveal } from "./landing-reveal";

export function LandingAudienceSection() {
  return (
    <section
      id="audience"
      className="border-t border-[#74172A]/8 bg-[#FAF6F5] px-4 py-20 sm:px-8 sm:py-28 lg:py-32"
    >
      <div className="mx-auto max-w-6xl">
        <LandingReveal className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-semibold tracking-[0.18em] text-[#74172A]">
            FOR EVERY WORKSTYLE
          </p>

          <h2 className="mt-4 text-3xl font-semibold tracking-[-0.04em] text-[#281A1E] sm:text-4xl">
            こんな方におすすめです
          </h2>

          <p className="mt-6 text-base leading-8 text-[#75686B] sm:mt-8 sm:text-lg">
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
                  className="group flex h-full flex-col rounded-[24px] border border-[#74172A]/8 bg-white p-5 shadow-[0_16px_45px_rgba(70,20,31,0.05)] transition-all duration-300 hover:-translate-y-1 hover:border-[#B58B4F]/40 hover:shadow-[0_22px_60px_rgba(70,20,31,0.1)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#74172A]/20 sm:p-7"
                >
                  <span
                    className="flex h-11 w-11 items-center justify-center rounded-2xl border border-[#B58B4F]/20 bg-[#FFF8EB] text-2xl transition-transform duration-300 group-hover:scale-105 sm:h-12 sm:w-12 sm:text-3xl"
                    aria-hidden
                  >
                    {item.icon}
                  </span>

                  <h3 className="mt-4 text-sm font-semibold tracking-tight text-[#302125] transition-colors group-hover:text-[#74172A] sm:mt-5 sm:text-lg">
                    {item.title}
                  </h3>

                  <p className="mt-2 flex-1 text-xs leading-6 text-[#75686B] sm:mt-3 sm:text-sm">
                    {item.description}
                  </p>
                </Link>
              </li>
            </LandingReveal>
          ))}
        </ul>

        <LandingReveal
          delayMs={180}
          className="mx-auto mt-14 max-w-3xl rounded-[28px] border border-[#B58B4F]/20 bg-gradient-to-br from-[#FFF8EF] via-white to-[#FFF3DE] px-6 py-8 text-center shadow-[0_18px_50px_rgba(70,20,31,0.05)] sm:mt-16 sm:px-10 sm:py-10"
        >
          <p className="text-sm leading-7 text-[#75686B] sm:text-base">
            個人の仕事から、チームや会社の業務まで。
            <br className="hidden sm:inline" />
            MINERVOTは、あなたの仕事の進め方に合わせて成長します。
          </p>
        </LandingReveal>
      </div>
    </section>
  );
}
