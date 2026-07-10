"use client";

import Link from "next/link";
import { Show } from "@clerk/nextjs";

import { Button } from "@/components/ui/button";
import { ATLAS_APP_HOME_PATH } from "@/lib/auth/public-routes";

import { LandingHeroMockup } from "./landing-hero-mockup";

export function LandingHeroSection() {
  return (
    <section className="relative overflow-hidden px-4 pb-20 pt-16 text-center sm:px-8 sm:pb-28 sm:pt-24 lg:pb-36 lg:pt-32">
      <div
        className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_top,_rgba(0,113,227,0.08),_transparent_60%)]"
        aria-hidden
      />
      <h1 className="animate-fade-up mx-auto max-w-4xl text-4xl font-semibold leading-[1.12] tracking-tight text-foreground sm:text-5xl lg:text-6xl">
        あなた専属のAI秘書。
      </h1>
      <p className="animate-fade-up delay-75 mx-auto mt-10 max-w-2xl text-xl font-medium leading-relaxed text-foreground sm:mt-12 sm:text-2xl sm:leading-relaxed">
        仕事を覚え、
        <br />
        繰り返し作業を減らし、
        <br />
        あなたの時間を生み出します。
      </p>
      <div className="animate-fade-up delay-100 mx-auto mt-10 max-w-2xl space-y-1 text-base leading-relaxed text-[var(--foreground-muted)] sm:mt-12 sm:text-lg sm:leading-relaxed">
        <p>
          ATLASは、お客様の仕事や習慣を学習し、
          <br className="hidden sm:inline" />
          資料作成・整理・分析・改善提案までをサポートします。
        </p>
        <p className="pt-3">使うほど、お客様専用のAI秘書へ成長します。</p>
      </div>
      <div className="animate-fade-up delay-150 mt-12 flex flex-col items-center justify-center gap-3 sm:mt-14 sm:flex-row sm:gap-4">
        <Show when="signed-out">
          <Link href="/sign-up" className="w-full sm:w-auto">
            <Button variant="primary" size="lg" className="w-full min-w-[200px] shadow-[var(--shadow-md)]">
              無料で始める
            </Button>
          </Link>
          <Link href="/sign-in" className="w-full sm:w-auto">
            <Button variant="secondary" size="lg" className="w-full min-w-[200px]">
              ログイン
            </Button>
          </Link>
        </Show>
        <Show when="signed-in">
          <Link href={ATLAS_APP_HOME_PATH} className="w-full sm:w-auto">
            <Button variant="primary" size="lg" className="w-full min-w-[200px] shadow-[var(--shadow-md)]">
              ATLASを開く
            </Button>
          </Link>
          <a href="#capabilities" className="w-full sm:w-auto">
            <Button variant="secondary" size="lg" className="w-full min-w-[200px]">
              できることを見る
            </Button>
          </a>
        </Show>
      </div>

      <LandingHeroMockup />
    </section>
  );
}
