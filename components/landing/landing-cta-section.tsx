"use client";

import Link from "next/link";
import { Show } from "@clerk/nextjs";

import { Button } from "@/components/ui/button";
import { LANDING_CTA_TRUST } from "@/lib/landing/demo-data";
import { ATLAS_APP_HOME_PATH } from "@/lib/auth/public-routes";

import { LandingReveal } from "./landing-reveal";

export function LandingCtaSection() {
  return (
    <section className="border-t border-[#74172A]/8 bg-[#FAF6F5] px-4 py-20 sm:px-8 sm:py-28 lg:py-32">
      <div className="mx-auto max-w-5xl">
        <LandingReveal>
          <div className="overflow-hidden rounded-[34px] border border-[#B58B4F]/20 bg-white px-6 py-16 text-center shadow-[0_30px_90px_rgba(70,20,31,0.08)] sm:px-12 sm:py-20">

            <p className="text-sm font-semibold tracking-[0.18em] text-[#B58B4F]">
              START WITH MINERVOT
            </p>

            <h2 className="mt-5 text-3xl font-semibold tracking-[-0.04em] text-[#281A1E] sm:text-5xl">
              あなたの仕事を、
              <br />
              今日からMINERVOTへ。
            </h2>

            <p className="mx-auto mt-6 max-w-2xl text-base leading-8 text-[#75686B]">
              毎日の繰り返し作業を専属AI秘書に任せて、
              <br className="hidden sm:inline" />
              本当に集中したい仕事のための時間を生み出しましょう。
            </p>

            <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
              <Show when="signed-out">
                <Link href="/sign-up">
                  <Button
                    size="lg"
                    className="min-w-[220px] rounded-full bg-[#74172A] px-8 py-6 text-white shadow-[0_14px_40px_rgba(116,23,42,0.22)] hover:bg-[#5F1222]"
                  >
                    無料で始める
                  </Button>
                </Link>

                <Link href="/sign-in">
                  <Button
                    size="lg"
                    variant="outline"
                    className="min-w-[220px] rounded-full border-[#74172A]/20 bg-white text-[#74172A] hover:bg-[#FAF6F5]"
                  >
                    ログイン
                  </Button>
                </Link>
              </Show>

              <Show when="signed-in">
                <Link href={ATLAS_APP_HOME_PATH}>
                  <Button
                    size="lg"
                    className="min-w-[220px] rounded-full bg-[#74172A] px-8 py-6 text-white shadow-[0_14px_40px_rgba(116,23,42,0.22)] hover:bg-[#5F1222]"
                  >
                    MINERVOTを開く
                  </Button>
                </Link>
              </Show>
            </div>

            <ul className="mt-10 flex flex-wrap items-center justify-center gap-x-8 gap-y-3">
              {LANDING_CTA_TRUST.map((item) => (
                <li
                  key={item}
                  className="flex items-center gap-2 text-sm text-[#75686B]"
                >
                  <span className="text-[#B58B4F]">✓</span>
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
