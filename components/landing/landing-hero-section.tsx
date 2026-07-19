"use client";

import Link from "next/link";
import { Show } from "@clerk/nextjs";

import { Button } from "@/components/ui/button";
import { ATLAS_APP_HOME_PATH } from "@/lib/auth/public-routes";

import { LandingHeroMockup } from "./landing-hero-mockup";

export function LandingHeroSection() {
  return (
    <section className="relative overflow-hidden px-4 pb-20 pt-16 sm:px-8 sm:pb-28 sm:pt-24 lg:pb-36 lg:pt-32">
      <div
        className="pointer-events-none absolute inset-0 -z-20 bg-[linear-gradient(180deg,#fff_0%,#fffaf8_55%,#fff_100%)] dark:bg-[linear-gradient(180deg,#12090b_0%,#0b0b0d_60%,#09090b_100%)]"
        aria-hidden
      />

      <div
        className="pointer-events-none absolute left-1/2 top-0 -z-10 h-[520px] w-[900px] -translate-x-1/2 rounded-full bg-[radial-gradient(circle,rgba(121,20,35,0.18)_0%,rgba(121,20,35,0.06)_38%,transparent_72%)] blur-3xl"
        aria-hidden
      />

      <div className="mx-auto grid max-w-6xl items-center gap-14 lg:grid-cols-[0.9fr_1.1fr] lg:gap-16">
        <div className="text-center lg:text-left">
          <div className="animate-fade-up inline-flex items-center gap-3 rounded-full border border-[#c8a46b]/40 bg-white/80 px-4 py-2 shadow-sm backdrop-blur dark:bg-white/5">
            <span className="h-px w-8 bg-[#c8a46b]" />
            <span className="text-[11px] font-semibold uppercase tracking-[0.28em] text-[#9a7a43]">
              Your personal AI secretary
            </span>
          </div>

          <h1 className="animate-fade-up delay-75 mt-8 text-5xl font-semibold leading-none tracking-[-0.04em] text-[#7b1728] sm:text-6xl lg:text-7xl">
            MINERVOT
          </h1>

          <p className="animate-fade-up delay-100 mt-7 text-3xl font-medium leading-tight tracking-tight text-foreground sm:text-4xl">
            あなた専属の
            <br />
            AI秘書
          </p>

          <p className="animate-fade-up delay-150 mx-auto mt-8 max-w-xl text-base leading-8 text-[var(--foreground-muted)] sm:text-lg lg:mx-0">
            仕事も、メールも、資料作成も、SNS運用も。
            <br className="hidden sm:inline" />
            あなたの代わりにAIが実行します。
          </p>

          <p className="animate-fade-up delay-150 mx-auto mt-4 max-w-xl text-sm leading-7 text-[var(--foreground-muted)] sm:text-base lg:mx-0">
            仕事を覚え、実行し、分析し、
            <br className="hidden sm:inline" />
            次の改善まで提案します。
          </p>

          <div className="animate-fade-up delay-200 mt-10 flex flex-col items-center gap-3 sm:flex-row lg:justify-start">
            <Show when="signed-out">
              <Link href="/sign-up" className="w-full sm:w-auto">
                <Button
                  size="lg"
                  className="min-h-12 w-full min-w-[200px] border border-[#7b1728] bg-[#7b1728] text-white shadow-[0_16px_40px_rgba(123,23,40,0.22)] transition-all hover:-translate-y-0.5 hover:bg-[#651220] sm:w-auto"
                >
                  無料で始める
                </Button>
              </Link>

              <a href="#capabilities" className="w-full sm:w-auto">
                <Button
                  variant="secondary"
                  size="lg"
                  className="min-h-12 w-full min-w-[200px] border-[#d8c6a5] bg-white/80 hover:bg-[#fff8f4] dark:bg-white/5 dark:hover:bg-white/10 sm:w-auto"
                >
                  できることを見る
                </Button>
              </a>
            </Show>

            <Show when="signed-in">
              <Link href={ATLAS_APP_HOME_PATH} className="w-full sm:w-auto">
                <Button
                  size="lg"
                  className="min-h-12 w-full min-w-[200px] border border-[#7b1728] bg-[#7b1728] text-white shadow-[0_16px_40px_rgba(123,23,40,0.22)] transition-all hover:-translate-y-0.5 hover:bg-[#651220] sm:w-auto"
                >
                  MINERVOTを開く
                </Button>
              </Link>

              <a href="#capabilities" className="w-full sm:w-auto">
                <Button
                  variant="secondary"
                  size="lg"
                  className="min-h-12 w-full min-w-[200px] border-[#d8c6a5] bg-white/80 hover:bg-[#fff8f4] dark:bg-white/5 dark:hover:bg-white/10 sm:w-auto"
                >
                  できることを見る
                </Button>
              </a>
            </Show>
          </div>

          <div className="animate-fade-up delay-200 mt-9 flex flex-wrap items-center justify-center gap-x-6 gap-y-3 text-xs text-[var(--foreground-muted)] lg:justify-start">
            <span>✓ 仕事を記憶</span>
            <span>✓ 自動で実行</span>
            <span>✓ 改善まで提案</span>
          </div>
        </div>

        <div className="animate-fade-up delay-200 relative">
          <div
            className="pointer-events-none absolute -inset-8 -z-10 rounded-[3rem] bg-[radial-gradient(circle,rgba(123,23,40,0.14),transparent_70%)] blur-2xl"
            aria-hidden
          />
          <LandingHeroMockup />
        </div>
      </div>
    </section>
  );
}
