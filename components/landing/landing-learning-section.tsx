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
          <h2 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
            ATLASは、あなたの仕事を学びます。
          </h2>
          <p className="mt-6 text-base leading-relaxed text-[var(--foreground-muted)] sm:mt-8 sm:text-lg sm:leading-relaxed">
            ATLASは、会話を覚えるAIではありません。
            <br className="hidden sm:inline" />
            <span className="mt-2 block sm:mt-0 sm:inline">
              ご提供いただいた資料や仕事の進め方を学習し、
              <br className="hidden sm:inline" />
              次回以降のご依頼へ反映します。
            </span>
          </p>
          <p className="mt-4 text-base leading-relaxed text-[var(--foreground-muted)] sm:text-lg sm:leading-relaxed">
            使うほど、お客様専用のAI秘書として成長します。
          </p>
        </LandingReveal>

        <ul className="mt-14 grid grid-cols-1 gap-4 sm:mt-16 sm:grid-cols-2 sm:gap-5 lg:grid-cols-4 lg:gap-6">
          {LANDING_LEARNING_CARDS.map((item, index) => (
            <LandingReveal key={item.id} delayMs={index * 60}>
              <li className="flex h-full flex-col rounded-[var(--radius-2xl)] border border-[var(--border-subtle)] bg-[var(--card)] p-6 shadow-[var(--shadow-sm)] sm:p-7">
                <span className="text-3xl" aria-hidden>
                  {item.icon}
                </span>
                <h3 className="mt-4 text-lg font-semibold tracking-tight text-foreground">
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
            <p className="text-sm leading-relaxed text-[var(--foreground-muted)] sm:text-base sm:leading-relaxed">
              ご提供いただいた資料は、お客様専用の学習データとして利用します。
              <br className="hidden sm:inline" />
              他のお客様へ利用することはありません。
            </p>
          </div>
        </LandingReveal>
      </div>
    </section>
  );
}
