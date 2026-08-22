"use client";

import Link from "next/link";
import { Show } from "@clerk/nextjs";

import { Button } from "@/components/ui/button";
import { ATLAS_APP_HOME_PATH } from "@/lib/auth/public-routes";
import { lightPlanYenLabel } from "@/lib/landing/pay-reason";

import { LandingChatgptContrast } from "./landing-chatgpt-contrast";
import { LandingHeroMockup } from "./landing-hero-mockup";

/**
 * Decision hero — not "what is it", but "why pay / why now".
 */
export function LandingHeroSection() {
  return (
    <section className="relative isolate overflow-hidden bg-[#FFFDFB] px-4 pb-16 pt-14 sm:px-8 sm:pb-24 sm:pt-20 lg:min-h-[780px] lg:pb-28 lg:pt-24">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-30 bg-[linear-gradient(180deg,#FFFDFB_0%,#FAF6F5_52%,#FFFFFF_100%)]"
      />

      <div className="mx-auto grid max-w-[1240px] items-center gap-12 lg:grid-cols-[0.92fr_1.08fr] lg:gap-16 xl:gap-20">
        <div className="relative z-10 text-center lg:text-left">
          <h1 className="text-[clamp(3.2rem,7vw,6.5rem)] font-semibold leading-[0.9] tracking-[-0.065em] text-[#74172A]">
            MINERVOT
          </h1>

          <p className="mt-5 text-xs font-semibold tracking-[0.16em] text-[#9A7137] sm:text-sm">
            あなた専属のAI秘書
          </p>

          <div className="mt-4">
            <p className="text-[clamp(1.85rem,4vw,3.4rem)] font-medium leading-[1.12] tracking-[-0.04em] text-[#281A1E]">
              毎日のX投稿を、
              <br />
              一度頼めばあとは確認するだけ。
            </p>
          </div>

          <p className="mx-auto mt-5 max-w-[520px] text-sm leading-7 text-[#75686B] sm:text-base sm:leading-8 lg:mx-0">
            「毎朝10時に投稿して」と一度頼む。
            あとは原稿作成からXへの投稿まで、MINERVOTが自動で実行します。
          </p>

          <p className="mx-auto mt-4 max-w-[520px] text-sm font-medium leading-7 text-[#74172A] sm:text-base lg:mx-0">
            一度頼んだ仕事を、次から自動で終わらせるAI秘書です。
          </p>

          <p className="mx-auto mt-3 max-w-[520px] text-sm leading-7 text-[#75686B] lg:mx-0">
            仕事を頼むたびにAIを開く必要はありません。対応業務では、仕事そのものが残ります。
          </p>

          <p className="mx-auto mt-3 max-w-[520px] text-sm leading-7 text-[#75686B] lg:mx-0">
            終わったら通知します。自分は確認するだけ。合えば月{lightPlanYenLabel()}。
          </p>

          <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row lg:justify-start">
            <Show when="signed-out">
              <Link href="/sign-up" className="w-full sm:w-auto">
                <Button
                  size="lg"
                  className="min-h-13 w-full min-w-[260px] rounded-full border border-[#74172A] bg-[#74172A] px-7 text-sm font-semibold text-white shadow-[0_18px_45px_rgba(116,23,42,0.22)] sm:w-auto"
                >
                  今すぐ1件終わらせる
                </Button>
              </Link>
            </Show>

            <Show when="signed-in">
              <Link href={ATLAS_APP_HOME_PATH} className="w-full sm:w-auto">
                <Button
                  size="lg"
                  className="min-h-13 w-full min-w-[260px] rounded-full border border-[#74172A] bg-[#74172A] px-7 text-sm font-semibold text-white shadow-[0_18px_45px_rgba(116,23,42,0.22)] sm:w-auto"
                >
                  今すぐ仕事を終わらせる
                </Button>
              </Link>
            </Show>
          </div>

          <p className="mx-auto mt-3 text-xs text-[#9A8D90] lg:mx-0">
            クレジットカード不要 ·{" "}
            <a href="#finish-story" className="underline-offset-2 hover:underline">
              終わる瞬間を見る
            </a>
            {" · "}
            <a href="#price-value" className="underline-offset-2 hover:underline">
              {lightPlanYenLabel()}の比較を見る
            </a>
          </p>

          <LandingChatgptContrast />
        </div>

        <div className="relative mx-auto w-full max-w-[720px] overflow-hidden lg:mx-0">
          <LandingHeroMockup />
        </div>
      </div>
    </section>
  );
}
