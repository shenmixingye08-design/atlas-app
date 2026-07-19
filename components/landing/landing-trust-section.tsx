import Link from "next/link";

import { LANDING_TRUST_ITEMS } from "@/lib/landing/content";

import { LandingReveal } from "./landing-reveal";

export function LandingTrustSection() {
  return (
    <section
      id="trust"
      className="border-t border-[var(--border-subtle)] bg-[var(--card)] px-4 py-20 sm:px-8 sm:py-28 lg:py-32"
    >
      <div className="mx-auto max-w-6xl">
        <LandingReveal className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-semibold tracking-[0.18em] text-[#74172A]">
            SECURITY & PRIVACY
          </p>

          <h2 className="mt-4 text-2xl font-semibold tracking-tight text-foreground sm:text-3xl lg:text-4xl">
            安心してご利用いただくために
          </h2>

          <p className="mt-6 text-base leading-relaxed text-[var(--foreground-muted)] sm:mt-8 sm:text-lg sm:leading-relaxed">
            MINERVOTは、お客様の資料や業務データを
            <br className="hidden sm:inline" />
            安全かつ適切に取り扱うことを最優先に設計されています。
          </p>

          <p className="mt-5 text-base leading-relaxed text-[var(--foreground-muted)] sm:text-lg">
            保存・学習・利用範囲を明確にし、
            お客様自身で管理できる安心のAI秘書です。
          </p>
        </LandingReveal>

        <ul className="mt-14 grid grid-cols-1 gap-4 sm:mt-16 sm:grid-cols-2 sm:gap-5 lg:grid-cols-4 lg:gap-6">
          {LANDING_TRUST_ITEMS.map((item, index) => (
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
              お客様の情報を第一に考えています
            </h3>

            <p className="mt-4 text-sm leading-relaxed text-[var(--foreground-muted)] sm:text-base">
              パスワード・APIキー・カード番号などの重要な機密情報は、
              学習データとして保存しません。
            </p>

            <p className="mt-4 text-sm leading-relaxed text-[var(--foreground-muted)] sm:text-base">
              データの取り扱いについて詳しくは、
              プライバシーポリシーをご確認ください。
            </p>

            <p className="mt-7">
              <Link
                href="/privacy"
                className="inline-flex items-center rounded-full bg-[#74172A] px-6 py-3 text-sm font-semibold text-white transition-all duration-300 hover:scale-105 hover:bg-[#5f1222]"
              >
                プライバシーポリシーを見る
              </Link>
            </p>
          </div>
        </LandingReveal>
      </div>
    </section>
  );
}
