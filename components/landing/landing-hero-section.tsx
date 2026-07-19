"use client";

import Link from "next/link";
import { Show } from "@clerk/nextjs";

import { Button } from "@/components/ui/button";
import { ATLAS_APP_HOME_PATH } from "@/lib/auth/public-routes";

import { LandingHeroMockup } from "./landing-hero-mockup";

const heroBenefits = [
  "仕事を記憶",
  "自動で実行",
  "分析・改善まで提案",
];

export function LandingHeroSection() {
  return (
    <section className="relative isolate overflow-hidden bg-[#fffdfb] px-4 pb-20 pt-14 sm:px-8 sm:pb-28 sm:pt-20 lg:min-h-[820px] lg:pb-32 lg:pt-28 dark:bg-[#0c0809]">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-30 bg-[linear-gradient(180deg,#fffdfb_0%,#fff9f6_52%,#ffffff_100%)] dark:bg-[linear-gradient(180deg,#10090b_0%,#0c0809_56%,#090708_100%)]"
      />

      <div
        aria-hidden="true"
        className="pointer-events-none absolute left-[-15%] top-[-20%] -z-20 h-[620px] w-[620px] rounded-full bg-[radial-gradient(circle,rgba(128,25,45,0.12)_0%,rgba(128,25,45,0.04)_42%,transparent_72%)] blur-3xl"
      />

      <div
        aria-hidden="true"
        className="pointer-events-none absolute right-[-10%] top-[5%] -z-20 h-[760px] w-[760px] rounded-full bg-[radial-gradient(circle,rgba(180,137,75,0.10)_0%,rgba(128,25,45,0.05)_36%,transparent_70%)] blur-3xl"
      />

      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-px bg-gradient-to-r from-transparent via-[#b58b4f]/35 to-transparent"
      />

      <div className="mx-auto grid max-w-[1240px] items-center gap-14 lg:grid-cols-[0.88fr_1.12fr] lg:gap-16 xl:gap-24">
        <div className="relative z-10 text-center lg:text-left">
          <div className="animate-fade-up inline-flex items-center gap-3 rounded-full border border-[#b58b4f]/30 bg-white/75 px-4 py-2 shadow-[0_8px_30px_rgba(75,20,30,0.05)] backdrop-blur-xl dark:bg-white/[0.04]">
            <span className="h-px w-7 bg-[#b58b4f]" />

            <span className="text-[10px] font-semibold uppercase tracking-[0.3em] text-[#8d6b37] sm:text-[11px] dark:text-[#d2ad70]">
              Your personal AI secretary
            </span>
          </div>

          <h1 className="animate-fade-up delay-75 mt-8 text-[clamp(3.2rem,7vw,6.5rem)] font-semibold leading-[0.9] tracking-[-0.065em] text-[#74172a] dark:text-[#f0c7cf]">
            MINERVOT
          </h1>

          <div className="animate-fade-up delay-100 mt-8">
            <p className="text-[clamp(2rem,4.3vw,4.1rem)] font-medium leading-[1.08] tracking-[-0.045em] text-[#221719] dark:text-[#fff9fa]">
              仕事を、
              <br />
              AIに任せる時代へ。
            </p>
          </div>

          <p className="animate-fade-up delay-150 mt-7 text-lg font-medium tracking-[-0.02em] text-[#74172a] sm:text-xl dark:text-[#e6b9c3]">
            あなた専属のAI秘書
          </p>

          <p className="animate-fade-up delay-150 mx-auto mt-5 max-w-[570px] text-sm leading-7 text-[#6f6265] sm:text-base sm:leading-8 lg:mx-0 dark:text-[#b9adb0]">
            メール、SNS、資料作成、スケジュール管理まで。
            <br className="hidden sm:block" />
            MINERVOTがあなたの仕事を覚え、実行し、分析し、
            <br className="hidden sm:block" />
            次の改善まで提案します。
          </p>

          <div className="animate-fade-up delay-200 mt-9 flex flex-col items-center gap-3 sm:flex-row lg:justify-start">
            <Show when="signed-out">
              <Link href="/sign-up" className="w-full sm:w-auto">
                <Button
                  size="lg"
                  className="group min-h-13 w-full min-w-[190px] rounded-full border border-[#74172a] bg-[#74172a] px-7 text-sm font-semibold text-white shadow-[0_18px_45px_rgba(116,23,42,0.22)] transition-all duration-300 hover:-translate-y-1 hover:bg-[#5d1020] hover:shadow-[0_22px_55px_rgba(116,23,42,0.28)] sm:w-auto"
                >
                  無料で始める
                  <span className="ml-2 transition-transform duration-300 group-hover:translate-x-1">
                    →
                  </span>
                </Button>
              </Link>

              <a href="#capabilities" className="w-full sm:w-auto">
                <Button
                  variant="secondary"
                  size="lg"
                  className="min-h-13 w-full min-w-[190px] rounded-full border border-[#d8c9bd] bg-white/75 px-7 text-sm font-semibold text-[#4b383d] shadow-[0_12px_35px_rgba(61,28,35,0.06)] backdrop-blur-xl transition-all duration-300 hover:-translate-y-1 hover:border-[#b58b4f]/50 hover:bg-white sm:w-auto dark:border-white/10 dark:bg-white/[0.05] dark:text-white dark:hover:bg-white/[0.09]"
                >
                  できることを見る
                </Button>
              </a>
            </Show>

            <Show when="signed-in">
              <Link href={ATLAS_APP_HOME_PATH} className="w-full sm:w-auto">
                <Button
                  size="lg"
                  className="group min-h-13 w-full min-w-[190px] rounded-full border border-[#74172a] bg-[#74172a] px-7 text-sm font-semibold text-white shadow-[0_18px_45px_rgba(116,23,42,0.22)] transition-all duration-300 hover:-translate-y-1 hover:bg-[#5d1020] hover:shadow-[0_22px_55px_rgba(116,23,42,0.28)] sm:w-auto"
                >
                  MINERVOTを開く
                  <span className="ml-2 transition-transform duration-300 group-hover:translate-x-1">
                    →
                  </span>
                </Button>
              </Link>

              <a href="#capabilities" className="w-full sm:w-auto">
                <Button
                  variant="secondary"
                  size="lg"
                  className="min-h-13 w-full min-w-[190px] rounded-full border border-[#d8c9bd] bg-white/75 px-7 text-sm font-semibold text-[#4b383d] shadow-[0_12px_35px_rgba(61,28,35,0.06)] backdrop-blur-xl transition-all duration-300 hover:-translate-y-1 hover:border-[#b58b4f]/50 hover:bg-white sm:w-auto dark:border-white/10 dark:bg-white/[0.05] dark:text-white dark:hover:bg-white/[0.09]"
                >
                  できることを見る
                </Button>
              </a>
            </Show>
          </div>

          <div className="animate-fade-up delay-200 mt-8 flex flex-wrap items-center justify-center gap-x-5 gap-y-3 lg:justify-start">
            {heroBenefits.map((benefit) => (
              <span
                key={benefit}
                className="inline-flex items-center gap-2 text-xs font-medium text-[#78696d] dark:text-[#b7aaad]"
              >
                <span className="flex h-4 w-4 items-center justify-center rounded-full border border-[#b58b4f]/40 bg-[#fff8eb] text-[9px] text-[#9a7137] dark:bg-[#b58b4f]/10">
                  ✓
                </span>
                {benefit}
              </span>
            ))}
          </div>

          <div className="animate-fade-up delay-200 mt-10 flex items-center justify-center gap-4 lg:justify-start">
            <span className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[#9a8d90]">
              Secure connections
            </span>

            <span className="h-px w-10 bg-[#b58b4f]/35" />

            <span className="text-[11px] text-[#8b7e81]">
              Clerk · Stripe · Supabase · X
            </span>
          </div>
        </div>

        <div className="animate-fade-up delay-200 relative mx-auto w-full max-w-[720px] lg:mx-0">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -inset-10 -z-20 rounded-[4rem] bg-[radial-gradient(circle,rgba(116,23,42,0.15)_0%,rgba(181,139,79,0.06)_40%,transparent_72%)] blur-3xl"
          />

          <div
            aria-hidden="true"
            className="pointer-events-none absolute -right-8 -top-8 -z-10 h-32 w-32 rounded-full border border-[#b58b4f]/15"
          />

          <div
            aria-hidden="true"
            className="pointer-events-none absolute -bottom-8 -left-8 -z-10 h-24 w-24 rounded-full border border-[#74172a]/10"
          />

          <LandingHeroMockup />
        </div>
      </div>
    </section>
  );
}
