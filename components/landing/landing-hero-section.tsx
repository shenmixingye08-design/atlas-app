"use client";

import Link from "next/link";
import { Show } from "@clerk/nextjs";

import { Button } from "@/components/ui/button";
import { ATLAS_APP_HOME_PATH } from "@/lib/auth/public-routes";

import { LandingChatgptContrast } from "./landing-chatgpt-contrast";
import { LandingHeroMockup } from "./landing-hero-mockup";

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

      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-px bg-gradient-to-r from-transparent via-[#B58B4F]/35 to-transparent"
      />

      <div className="mx-auto grid max-w-[1240px] items-center gap-12 lg:grid-cols-[0.92fr_1.08fr] lg:gap-16 xl:gap-20">
        <div className="relative z-10 text-center lg:text-left">
          <h1 className="animate-fade-up text-[clamp(3.2rem,7vw,6.5rem)] font-semibold leading-[0.9] tracking-[-0.065em] text-[#74172A]">
            MINERVOT
          </h1>

          <div className="animate-fade-up delay-75 mt-7">
            <p className="text-[clamp(1.85rem,4vw,3.4rem)] font-medium leading-[1.12] tracking-[-0.04em] text-[#281A1E]">
              あなたの仕事を
              <br />
              代わりに終わらせます
            </p>
          </div>

          <p className="animate-fade-up delay-100 mx-auto mt-5 max-w-[520px] text-sm leading-7 text-[#75686B] sm:text-base sm:leading-8 lg:mx-0">
            会話で終わりません。仕事を選んで1回依頼するだけ。
            <br className="hidden sm:block" />
            完成まで、MINERVOTが進めます。
          </p>

          <div className="animate-fade-up delay-150 mt-8 flex flex-col items-center gap-3 sm:flex-row lg:justify-start">
            <Show when="signed-out">
              <Link href="/sign-up" className="w-full sm:w-auto">
                <Button
                  size="lg"
                  className="group min-h-13 w-full min-w-[220px] rounded-full border border-[#74172A] bg-[#74172A] px-7 text-sm font-semibold text-white shadow-[0_18px_45px_rgba(116,23,42,0.22)] transition-all duration-300 hover:-translate-y-1 hover:bg-[#5D1020] hover:shadow-[0_22px_55px_rgba(116,23,42,0.28)] sm:w-auto"
                >
                  無料で始める
                  <span className="ml-2 transition-transform duration-300 group-hover:translate-x-1">
                    →
                  </span>
                </Button>
              </Link>

              <a href="#first-path" className="w-full sm:w-auto">
                <Button
                  variant="secondary"
                  size="lg"
                  className="min-h-13 w-full min-w-[190px] rounded-full border border-[#D8C9BD] bg-white/80 px-7 text-sm font-semibold text-[#4B383D] shadow-[0_12px_35px_rgba(61,28,35,0.06)] backdrop-blur-xl transition-all duration-300 hover:-translate-y-1 hover:border-[#B58B4F]/50 hover:bg-white sm:w-auto"
                >
                  使い方を見る
                </Button>
              </a>
            </Show>

            <Show when="signed-in">
              <Link href={ATLAS_APP_HOME_PATH} className="w-full sm:w-auto">
                <Button
                  size="lg"
                  className="group min-h-13 w-full min-w-[220px] rounded-full border border-[#74172A] bg-[#74172A] px-7 text-sm font-semibold text-white shadow-[0_18px_45px_rgba(116,23,42,0.22)] transition-all duration-300 hover:-translate-y-1 hover:bg-[#5D1020] hover:shadow-[0_22px_55px_rgba(116,23,42,0.28)] sm:w-auto"
                >
                  仕事を終わらせる
                  <span className="ml-2 transition-transform duration-300 group-hover:translate-x-1">
                    →
                  </span>
                </Button>
              </Link>

              <a href="#first-path" className="w-full sm:w-auto">
                <Button
                  variant="secondary"
                  size="lg"
                  className="min-h-13 w-full min-w-[190px] rounded-full border border-[#D8C9BD] bg-white/80 px-7 text-sm font-semibold text-[#4B383D] shadow-[0_12px_35px_rgba(61,28,35,0.06)] backdrop-blur-xl transition-all duration-300 hover:-translate-y-1 hover:border-[#B58B4F]/50 hover:bg-white sm:w-auto"
                >
                  使い方を見る
                </Button>
              </a>
            </Show>
          </div>

          <LandingChatgptContrast />
        </div>

        <div className="animate-fade-up delay-200 relative mx-auto w-full max-w-[720px] overflow-hidden lg:mx-0">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -inset-10 -z-20 rounded-[4rem] bg-[radial-gradient(circle,rgba(116,23,42,0.15)_0%,rgba(181,139,79,0.06)_40%,transparent_72%)] blur-3xl"
          />

          <LandingHeroMockup />
        </div>
      </div>
    </section>
  );
}
