import Link from "next/link";

import { LANDING_TRUST_ITEMS } from "@/lib/landing/content";

import { LandingReveal } from "./landing-reveal";

export function LandingTrustSection() {
  return (
    <section
      id="trust"
      className="border-t border-[var(--border-subtle)] bg-white px-4 py-20 sm:px-8 sm:py-28 lg:py-32"
    >
      <div className="mx-auto max-w-6xl">
        <LandingReveal className="mx-auto max-w-2xl text-center">
          <h2 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
            安心してご利用いただくために
          </h2>
          <p className="mt-6 text-base leading-relaxed text-[var(--foreground-muted)] sm:mt-8 sm:text-lg sm:leading-relaxed">
            ATLASは、お客様の資料や仕事の記憶を大切に扱います。
            <br className="hidden sm:inline" />
            <span className="mt-2 block sm:mt-0 sm:inline">
              保存・学習・利用の範囲を分かりやすくし、
              <br className="hidden sm:inline" />
              お客様自身で管理できる設計にしています。
            </span>
          </p>
        </LandingReveal>

        <ul className="mt-14 grid grid-cols-1 gap-4 sm:mt-16 sm:grid-cols-2 sm:gap-5 lg:grid-cols-4 lg:gap-6">
          {LANDING_TRUST_ITEMS.map((item, index) => (
            <LandingReveal key={item.id} delayMs={index * 60}>
              <li className="flex h-full flex-col rounded-[var(--radius-2xl)] border border-[var(--border-subtle)] bg-white p-6 shadow-[var(--shadow-sm)] sm:p-7">
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
              パスワード、APIキー、カード番号などの重要な機密情報は、
              <br className="hidden sm:inline" />
              仕事の記憶として保存しません。
            </p>
            <p className="mt-4 text-sm leading-relaxed text-[var(--foreground-muted)] sm:text-base sm:leading-relaxed">
              詳しい取り扱いについては、
              <br className="hidden sm:inline" />
              プライバシーポリシーをご確認ください。
            </p>
            <p className="mt-6">
              <Link
                href="/privacy"
                className="text-sm font-medium text-accent transition-colors hover:underline"
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
