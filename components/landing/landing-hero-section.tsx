"use client";

import Link from "next/link";
import { Show } from "@clerk/nextjs";

import { Button } from "@/components/ui/button";
import { ATLAS_APP_HOME_PATH } from "@/lib/auth/public-routes";

import { LandingChatgptContrast } from "./landing-chatgpt-contrast";
import { LandingHeroMockup } from "./landing-hero-mockup";

/**
 * Conversion hero — copy/structure only.
 * Must answer in 5 seconds: what / who / what finishes / price / vs chat AI.
 * No new design system, no new animations, no new features.
 */
export function LandingHeroSection() {
  return (
    <section className="relative isolate overflow-hidden bg-[#FFFDFB] px-4 pb-16 pt-14 sm:px-8 sm:pb-24 sm:pt-20 lg:min-h-[780px] lg:pb-28 lg:pt-24">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-30 bg-[linear-gradient(180deg,#FFFDFB_0%,#FAF6F5_52%,#FFFFFF_100%)]"
      />

      <div
        aria-hidden="true"
        className="pointer-events-none absolute left-[-15%] top-[-20%] -z-20 h-[620px] w-[620px] rounded-full bg-[radial-gradient(circle,rgba(116,23,42,0.12)_0%,rgba(116,23,42,0.04)_42%,transparent_72%)] blur-3xl"
      />

      <div
        aria-hidden="true"
        className="pointer-events-none absolute right-[-10%] top-[5%] -z-20 h-[760px] w-[760px] rounded-full bg-[radial-gradient(circle,rgba(181,139,79,0.10)_0%,rgba(116,23,42,0.05)_36%,transparent_70%)] blur-3xl"
      />

      <div className="mx-auto grid max-w-[1240px] items-center gap-12 lg:grid-cols-[0.92fr_1.08fr] lg:gap-16 xl:gap-20">
        <div className="relative z-10 text-center lg:text-left">
          <h1 className="text-[clamp(3.2rem,7vw,6.5rem)] font-semibold leading-[0.9] tracking-[-0.065em] text-[#74172A]">
            MINERVOT
          </h1>

          <div className="mt-7">
            <p className="text-[clamp(1.85rem,4vw,3.4rem)] font-medium leading-[1.12] tracking-[-0.04em] text-[#281A1E]">
              あなたの仕事を
              <br />
              代わりに終わらせます
            </p>
          </div>

          <p className="mx-auto mt-5 max-w-[520px] text-sm leading-7 text-[#75686B] sm:text-base sm:leading-8 lg:mx-0">
            個人事業主・忙しい会社員向け。
            <br className="hidden sm:block" />
            SNS投稿・メール・資料が、選んで依頼するだけで完成します。
          </p>

          <p className="mx-auto mt-4 max-w-[520px] text-sm font-medium leading-7 text-[#74172A] sm:text-base lg:mx-0">
            ChatGPT・Claude・Geminiは答えて終わる。MINERVOTは仕事を終わらせる。
          </p>

          <p className="mx-auto mt-3 max-w-[520px] text-sm leading-7 text-[#75686B] lg:mx-0">
            無料で始めて、月980円から。クレジットカード不要。
          </p>

          <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row lg:justify-start">
            <Show when="signed-out">
              <Link href="/sign-up" className="w-full sm:w-auto">
                <Button
                  size="lg"
                  className="min-h-13 w-full min-w-[240px] rounded-full border border-[#74172A] bg-[#74172A] px-7 text-sm font-semibold text-white shadow-[0_18px_45px_rgba(116,23,42,0.22)] sm:w-auto"
                >
                  無料で最初の仕事を終わらせる
                </Button>
              </Link>
            </Show>

            <Show when="signed-in">
              <Link href={ATLAS_APP_HOME_PATH} className="w-full sm:w-auto">
                <Button
                  size="lg"
                  className="min-h-13 w-full min-w-[240px] rounded-full border border-[#74172A] bg-[#74172A] px-7 text-sm font-semibold text-white shadow-[0_18px_45px_rgba(116,23,42,0.22)] sm:w-auto"
                >
                  仕事を終わらせる
                </Button>
              </Link>
            </Show>
          </div>

          <p className="mx-auto mt-3 text-xs text-[#9A8D90] lg:mx-0">
            <a href="#pricing" className="underline-offset-2 hover:underline">
              月980円で何が終わるか見る
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
