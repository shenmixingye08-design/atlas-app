import Link from "next/link";

import { LANDING_TRUST_ITEMS } from "@/lib/landing/content";

import { LandingReveal } from "./landing-reveal";

export function LandingTrustSection() {
  return (
    <section
      id="trust"
      className="border-t border-[var(--primary)]/8 bg-[var(--surface-muted)] px-4 py-20 sm:px-8 sm:py-28 lg:py-32"
    >
      <div className="mx-auto max-w-6xl">
        <LandingReveal className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-semibold tracking-[0.18em] text-[var(--primary)]">
            SECURITY & PRIVACY
          </p>

          <h2 className="mt-4 text-3xl font-semibold tracking-[-0.04em] text-[var(--text-primary)] sm:text-4xl">
            安心してご利用いただくために
          </h2>

          <p className="mt-6 text-base leading-8 text-[var(--text-secondary)] sm:mt-8 sm:text-lg">
            MINERVOTは、お客様の資料や業務データを
            <br className="hidden sm:inline" />
            安全かつ適切に取り扱うことを最優先に設計されています。
          </p>

          <p className="mt-5 text-base leading-8 text-[var(--text-secondary)] sm:text-lg">
            保存・学習・利用範囲を明確にし、
            <br className="hidden sm:inline" />
            お客様自身で管理できる安心のAI秘書です。
          </p>
        </LandingReveal>

        <ul className="mt-14 grid grid-cols-1 gap-4 sm:mt-16 sm:grid-cols-2 sm:gap-5 lg:grid-cols-4 lg:gap-6">
          {LANDING_TRUST_ITEMS.map((item, index) => (
            <LandingReveal key={item.id} delayMs={index * 60}>
              <li className="group flex h-full flex-col rounded-[26px] border border-[var(--primary)]/8 bg-white p-6 shadow-[var(--shadow-subtle)] transition-[transform,opacity,border-color,box-shadow] duration-[var(--motion-normal)] [@media(hover:hover)]:hover:-translate-y-px hover:border-[var(--accent-gold)]/40 hover:shadow-[var(--shadow-floating)] sm:p-7">
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
              お客様の情報を第一に考えています
            </h3>

            <p className="mt-4 text-sm leading-7 text-[var(--text-secondary)] sm:text-base">
              パスワード・APIキー・カード番号などの重要な機密情報は、
              学習データとして保存しません。
            </p>

            <p className="mt-4 text-sm leading-7 text-[var(--text-secondary)] sm:text-base">
              データの取り扱いについて詳しくは、
              プライバシーポリシーをご確認ください。
            </p>

            <div className="mt-8">
              <Link
                href="/privacy"
                className="inline-flex items-center rounded-[var(--radius-large)] bg-[var(--primary)] px-7 py-3 text-sm font-semibold text-white shadow-[var(--shadow-subtle)] transition-[transform,opacity,border-color,box-shadow] duration-[var(--motion-normal)] [@media(hover:hover)]:hover:-translate-y-px hover:bg-[var(--primary-hover)] "
              >
                プライバシーポリシーを見る
              </Link>
            </div>
          </div>
        </LandingReveal>
      </div>
    </section>
  );
}
