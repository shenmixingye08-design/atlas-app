import Link from "next/link";

import { LANDING_TRUST_ITEMS } from "@/lib/landing/content";

import { LandingReveal } from "./landing-reveal";

export function LandingTrustSection() {
  return (
    <section
      id="trust"
      className="border-t border-[#74172A]/8 bg-[#FAF6F5] px-4 py-20 sm:px-8 sm:py-28 lg:py-32"
    >
      <div className="mx-auto max-w-6xl">
        <LandingReveal className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-semibold tracking-[0.18em] text-[#74172A]">
            SECURITY & PRIVACY
          </p>

          <h2 className="mt-4 text-3xl font-semibold tracking-[-0.04em] text-[#281A1E] sm:text-4xl">
            安心してご利用いただくために
          </h2>

          <p className="mt-6 text-base leading-8 text-[#75686B] sm:mt-8 sm:text-lg">
            MINERVOTは、お客様の資料や業務データを
            <br className="hidden sm:inline" />
            安全かつ適切に取り扱うことを最優先に設計されています。
          </p>

          <p className="mt-5 text-base leading-8 text-[#75686B] sm:text-lg">
            保存・学習・利用範囲を明確にし、
            <br className="hidden sm:inline" />
            お客様自身で管理できる安心のAI秘書です。
          </p>
        </LandingReveal>

        <ul className="mt-14 grid grid-cols-1 gap-4 sm:mt-16 sm:grid-cols-2 sm:gap-5 lg:grid-cols-4 lg:gap-6">
          {LANDING_TRUST_ITEMS.map((item, index) => (
            <LandingReveal key={item.id} delayMs={index * 60}>
              <li className="group flex h-full flex-col rounded-[26px] border border-[#74172A]/8 bg-white p-6 shadow-[0_16px_45px_rgba(70,20,31,0.05)] transition-all duration-300 hover:-translate-y-1 hover:border-[#B58B4F]/40 hover:shadow-[0_22px_60px_rgba(70,20,31,0.10)] sm:p-7">
                <span
                  className="flex h-12 w-12 items-center justify-center rounded-2xl border border-[#B58B4F]/20 bg-[#FFF8EB] text-3xl transition-transform duration-300 group-hover:scale-105"
                  aria-hidden
                >
                  {item.icon}
                </span>

                <h3 className="mt-5 text-lg font-semibold tracking-tight text-[#302125]">
                  {item.title}
                </h3>

                <p className="mt-3 flex-1 text-sm leading-7 text-[#75686B]">
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
          <div className="rounded-[30px] border border-[#B58B4F]/20 bg-gradient-to-br from-[#FFF8EF] via-white to-[#FFF3DE] px-6 py-8 shadow-[0_20px_60px_rgba(70,20,31,0.06)] sm:px-10 sm:py-10">
            <h3 className="text-xl font-semibold text-[#281A1E]">
              お客様の情報を第一に考えています
            </h3>

            <p className="mt-4 text-sm leading-7 text-[#75686B] sm:text-base">
              パスワード・APIキー・カード番号などの重要な機密情報は、
              学習データとして保存しません。
            </p>

            <p className="mt-4 text-sm leading-7 text-[#75686B] sm:text-base">
              データの取り扱いについて詳しくは、
              プライバシーポリシーをご確認ください。
            </p>

            <div className="mt-8">
              <Link
                href="/privacy"
                className="inline-flex items-center rounded-full bg-[#74172A] px-7 py-3 text-sm font-semibold text-white shadow-[0_12px_30px_rgba(116,23,42,0.22)] transition-all duration-300 hover:-translate-y-0.5 hover:bg-[#5F1222] hover:shadow-[0_18px_40px_rgba(116,23,42,0.30)]"
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
