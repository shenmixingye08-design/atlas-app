"use client";

import Link from "next/link";
import { Show } from "@clerk/nextjs";

import { Button } from "@/components/ui/button";
import { LANDING_CTA_TRUST } from "@/lib/landing/demo-data";
import { ATLAS_APP_HOME_PATH } from "@/lib/auth/public-routes";

import { LandingReveal } from "./landing-reveal";

export function LandingCtaSection() {
  return (
    <section className="border-t border-white/10 bg-[#0D0D0F] px-4 py-20 sm:px-8 sm:py-28 lg:py-32">
      <div className="mx-auto max-w-5xl">
        <LandingReveal>
          <div className="relative overflow-hidden rounded-3xl border border-[#B58B4F]/25 bg-[#15161B] px-6 py-16 text-center shadow-[0_28px_80px_rgba(0,0,0,0.35)] sm:px-12 sm:py-20">
            <div
              className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(116,23,42,0.28),_transparent_52%)]"
              aria-hidden
            />

            <div
              className="pointer-events-none absolute left-1/2 top-0 h-px w-2/3 -translate-x-1/2 bg-gradient-to-r from-transparent via-[#B58B4F]/70 to-transparent"
              aria-hidden
            />

            <p className="relative text-sm font-semibold tracking-[0.18em] text-[#C7A56A]">
              START WITH MINERVOT
            </p>

            <h2 className="relative mt-5 text-2xl font-semibold tracking-tight text-white sm:text-4xl">
              あなたの仕事を、今日からMINERVOTへ。
            </h2>

            <p className="relative mx-auto mt-5 max-w-xl text-sm leading-relaxed text-white/65 sm:text-base">
              毎日の繰り返し作業を専属AI秘書に任せて、
              <br className="hidden sm:inline" />
              本当に集中したい仕事のための時間を生み出しましょう。
            </p>

            <div className="relative mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row sm:gap-4">
              <Show when="signed-out">
                <Link href="/sign-up" className="w-full sm:w-auto">
                  <Button
                    variant="primary"
                    size="lg"
                    className="w-full min-w-[210px] border border-[#74172A] bg-[#74172A] text-white shadow-lg shadow-[#74172A]/20 hover:bg-[#5C1222]"
                  >
                    無料で始める
                  </Button>
                </Link>

                <Link href="/sign-in" className="w-full sm:w-auto">
                  <Button
                    variant="secondary"
                    size="lg"
                    className="w-full min-w-[210px] border border-white/15 bg-white/5 text-white hover:border-white/25 hover:bg-white/10"
                  >
                    ログイン
                  </Button>
                </Link>
              </Show>

              <Show when="signed-in">
                <Link href={ATLAS_APP_HOME_PATH} className="w-full sm:w-auto">
                  <Button
                    variant="primary"
                    size="lg"
                    className="w-full min-w-[210px] border border-[#74172A] bg-[#74172A] text-white shadow-lg shadow-[#74172A]/20 hover:bg-[#5C1222]"
                  >
                    MINERVOTを開く
                  </Button>
                </Link>
              </Show>
            </div>

            <ul className="relative mt-9 flex flex-col items-center gap-2 sm:flex-row sm:flex-wrap sm:justify-center sm:gap-x-7">
              {LANDING_CTA_TRUST.map((item) => (
                <li
                  key={item}
                  className="flex items-center gap-2 text-sm text-white/65"
                >
                  <span className="text-[#C7A56A]" aria-hidden>
                    ✓
                  </span>
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </LandingReveal>
      </div>
    </section>
  );
}
