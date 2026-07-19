import { LANDING_LEARNING_CARDS } from "@/lib/landing/content";

import { LandingReveal } from "./landing-reveal";

export function LandingLearningSection() {
  return (
    <section
      id="learning"
      className="border-t border-[var(--border-subtle)] bg-[var(--card)] px-4 py-20 sm:px-8 sm:py-28 lg:py-32"
    >
      <div className="mx-auto max-w-6xl">
        <LandingReveal className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-semibold tracking-[0.18em] text-[#74172A]">
            SMART LEARNING
          </p>

          <h2 className="mt-4 text-2xl font-semibold tracking-tight text-foreground sm:text-3xl lg:text-4xl">
            MINERVOTは、あなたの仕事を学びます。
          </h2>

          <p className="mt-6 text-base leading-relaxed text-[var(--foreground-muted)] sm:mt-8 sm:text-lg sm:leading-relaxed">
            MINERVOTは、単に会話を記憶するAIではありません。
            <br className="hidden sm:inline" />
            ご提供いただいた資料や仕事の進め方を学習し、
            <br className="hidden sm:inline" />
            次回以降のご依頼を、よりスムーズに実行します。
          </p>

          <p className="mt-5 text-base leading-relaxed text-[var(--foreground-muted)] sm:text-lg">
            使うほど、あなた専属のAI秘書として成長し、
            日々の業務をさらに効率化します。
          </p>
        </LandingReveal>

        <ul className="mt-14 grid grid-cols-1 gap-4 sm:mt-16 sm:grid-cols-2 sm:gap-5 lg:grid-cols-4 lg:gap-6">
          {LANDING_LEARNING_CARDS.map((item, index) => (
            <LandingReveal key={item.id} delayMs={index * 60}>
              <li className="group flex h-full flex-col rounded-[var(--radius-2xl)] border border-[var(--border-subtle)] bg-[var(--card)] p-6 shadow-[var(--shadow-sm)] transition-all duration-300 hover:-translate-y-1 hover:border-[#74172A]/30 hover:shadow-[var(--shadow-md)] sm:p-7">
                <span
                  className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#74172A]/8 text-3xl transition-transform duration-300 group-hover:scale-105"
                  aria-hidden
                >
                  {item.icon}
                </span>

                <h3 className="mt-5 text-lg font-semibold tracking-tight text-foreground">
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
          <div className="rounded-[var(--radius-2xl)] border border-[#B58B4F]/25 bg-gradient-to-br from-[#74172A]/5 via-transparent to-[#B58B4F]/10 px-6 py-8 sm:px-10 sm:py-10">
            <h3 className="text-lg font-semibold text-foreground">
              学習データはあなただけのもの
            </h3>

            <p className="mt-4 text-sm leading-relaxed text-[var(--foreground-muted)] sm:text-base">
              ご提供いただいた資料・履歴・仕事の進め方は、
              お客様専用の学習データとして利用します。
              <br className="hidden sm:inline" />
              他のお客様へ共有・再利用されることはありません。
            </p>
          </div>
        </LandingReveal>
      </div>
    </section>
  );
}
