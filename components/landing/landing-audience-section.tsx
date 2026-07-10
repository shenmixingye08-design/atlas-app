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
          <h2 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
            こんな方におすすめです
          </h2>
          <p className="mt-6 text-base leading-relaxed text-[var(--foreground-muted)] sm:mt-8 sm:text-lg sm:leading-relaxed">
            ATLASは業種を問いません。
            <br />
            仕事や生活の中で繰り返し発生する作業を覚え、
            <br className="hidden sm:inline" />
            時間を生み出すAI秘書です。
          </p>
        </LandingReveal>

        <ul className="mt-14 grid grid-cols-2 gap-3 sm:mt-16 sm:gap-5 lg:grid-cols-4 lg:gap-6">
          {LANDING_AUDIENCE.map((item, index) => (
            <LandingReveal key={item.id} delayMs={index * 50}>
              <li className="h-full">
                <Link
                  href={item.href}
                  className="group flex h-full flex-col rounded-[var(--radius-2xl)] border border-[var(--border-subtle)] bg-[var(--card)] p-4 shadow-[var(--shadow-sm)] transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[var(--shadow-md)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/30 sm:p-7"
                >
                  <span className="text-2xl sm:text-3xl" aria-hidden>
                    {item.icon}
                  </span>
                  <h3 className="mt-3 text-sm font-semibold tracking-tight text-foreground transition-colors group-hover:text-accent sm:mt-4 sm:text-lg">
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
      </div>
    </section>
  );
}
