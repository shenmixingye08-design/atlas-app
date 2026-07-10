"use client";

import Link from "next/link";
import { Show } from "@clerk/nextjs";

import { Button } from "@/components/ui/button";
import { LANDING_CTA_TRUST } from "@/lib/landing/demo-data";
import { ATLAS_APP_HOME_PATH } from "@/lib/auth/public-routes";

import { LandingReveal } from "./landing-reveal";

export function LandingCtaSection() {
  return (
    <section className="px-4 pb-24 pt-4 sm:px-8 sm:pb-32">
      <div className="mx-auto max-w-4xl">
        <LandingReveal>
          <div className="landing-glass relative overflow-hidden rounded-[var(--radius-2xl)] border border-[var(--border-subtle)] bg-foreground px-6 py-16 text-center shadow-[var(--shadow-lg)] sm:px-12 sm:py-20">
            <div
              className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_rgba(0,113,227,0.35),_transparent_55%)]"
              aria-hidden
            />
            <h2 className="relative text-2xl font-semibold tracking-tight text-white sm:text-4xl">
              あなたの仕事を、今日からATLASへ。
            </h2>
            <p className="relative mx-auto mt-4 max-w-lg text-sm text-white/70 sm:text-base">
              毎日のルーティンを任せて、時間を生み出しましょう。
            </p>
            <div className="relative mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row sm:gap-4">
              <Show when="signed-out">
                <Link href="/sign-up" className="w-full sm:w-auto">
                  <Button
                    variant="primary"
                    size="lg"
                    className="w-full min-w-[200px] bg-white text-foreground hover:bg-white/90"
                  >
                    無料で始める
                  </Button>
                </Link>
                <Link href="/sign-in" className="w-full sm:w-auto">
                  <Button
                    variant="secondary"
                    size="lg"
                    className="w-full min-w-[200px] border-white/20 bg-white/10 text-white hover:bg-white/20"
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
                    className="w-full min-w-[200px] bg-white text-foreground hover:bg-white/90"
                  >
                    ATLASを開く
                  </Button>
                </Link>
              </Show>
            </div>
            <ul className="relative mt-8 flex flex-col items-center gap-2 sm:flex-row sm:flex-wrap sm:justify-center sm:gap-x-6 sm:gap-y-2">
              {LANDING_CTA_TRUST.map((item) => (
                <li key={item} className="flex items-center gap-2 text-sm text-white/80">
                  <span className="text-[var(--status-success)]" aria-hidden>
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
