import { LANDING_LEARNING_CARDS } from "@/lib/landing/content";

import { LandingReveal } from "./landing-reveal";

export function LandingLearningSection() {
  return (
    <section
      id="learning"
      className="border-t border-[var(--primary)]/8 bg-white px-4 py-20 sm:px-8 sm:py-28 lg:py-32"
    >
      <div className="mx-auto max-w-6xl">
        <LandingReveal className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-semibold tracking-[0.18em] text-[var(--primary)]">
            SMART LEARNING
          </p>

          <h2 className="mt-4 text-3xl font-semibold tracking-[-0.04em] text-[var(--text-primary)] sm:text-4xl">
            MINERVOTは、あなたの仕事を学びます。
          </h2>

          <p className="mt-6 text-base leading-8 text-[var(--text-secondary)] sm:mt-8 sm:text-lg">
            MINERVOTは、単に会話を記憶するAIではありません。
            <br className="hidden sm:inline" />
            ご提供いただいた資料や仕事の進め方を学習し、
            <br className="hidden sm:inline" />
            次回以降のご依頼を、よりスムーズに実行します。
          </p>

          <p className="mt-5 text-base leading-8 text-[var(--text-secondary)] sm:text-lg">
            使うほど、あなた専属のAI秘書として成長し、
            <br className="hidden sm:inline" />
            日々の業務をさらに効率化します。
          </p>
        </LandingReveal>

        <ul className="mt-14 grid grid-cols-1 gap-4 sm:mt-16 sm:grid-cols-2 sm:gap-5 lg:grid-cols-4 lg:gap-6">
          {LANDING_LEARNING_CARDS.map((item, index) => (
            <LandingReveal key={item.id} delayMs={index * 60}>
              <li className="group flex h-full flex-col rounded-[24px] border border-[var(--primary)]/8 bg-white p-6 shadow-[var(--shadow-subtle)] transition-[transform,opacity,border-color,box-shadow] duration-[var(--motion-normal)] [@media(hover:hover)]:hover:-translate-y-px hover:border-[var(--accent-gold)]/40 hover:shadow-[var(--shadow-floating)] sm:p-7">
                <span
                  className="flex h-12 w-12 items-center justify-center rounded-2xl border border-[var(--accent-gold)]/20 bg-[var(--surface-muted)] text-3xl transition-transform duration-300 [@media(hover:hover)]:group-hover:scale-[1.02]"
                  aria-hidden
                >
                  {item.icon}
                </span>

                <h3 className="mt-5 text-lg font-semibold tracking-tight text-[var(--text-primary)]">
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
          <div className="rounded-[30px] border border-[var(--accent-gold)]/20 bg-[var(--surface-muted)] px-6 py-8 shadow-[var(--shadow-subtle)] sm:px-10 sm:py-10">
            <h3 className="text-xl font-semibold text-[var(--text-primary)]">
              学習データはあなただけのもの
            </h3>

            <p className="mt-4 text-sm leading-7 text-[var(--text-secondary)] sm:text-base">
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
