"use client";

import Link from "next/link";

import { Button } from "@/components/ui/button";

import { LandingReveal } from "./landing-reveal";

const STEPS = [
  {
    id: "pick",
    title: "仕事を選ぶ",
    body: "SNS・ブログ・資料・メールなど、最初の1つだけ。",
  },
  {
    id: "request",
    title: "1回依頼",
    body: "形式やメニューは後から。まずは依頼だけ。",
  },
  {
    id: "done",
    title: "完成",
    body: "会話ではなく、終わった仕事が手元に残ります。",
  },
] as const;

/**
 * Landing clarity path — mirrors the post-signup first-run flow.
 */
export function LandingFirstPath() {
  return (
    <section
      id="first-path"
      className="relative overflow-hidden border-t border-[#74172A]/8 bg-white px-4 py-16 sm:px-8 sm:py-24"
    >
      <div className="mx-auto max-w-[980px]">
        <LandingReveal className="mx-auto max-w-2xl text-center">
          <p className="text-[10px] font-semibold uppercase tracking-[0.25em] text-[#91703D]">
            First 5 minutes
          </p>
          <h2 className="mt-5 text-3xl font-semibold tracking-[-0.045em] text-[#26191C] sm:text-4xl">
            最初は、これだけ。
          </h2>
          <p className="mt-4 text-sm leading-7 text-[#75686B] sm:text-base">
            機能を覚えなくても使えます。仕事を選んで依頼すると、完成まで進みます。
          </p>
        </LandingReveal>

        <ol className="mt-12 grid gap-4 sm:grid-cols-3">
          {STEPS.map((step, index) => (
            <LandingReveal key={step.id} delayMs={index * 80}>
              <li className="relative h-full rounded-[24px] border border-[#74172A]/8 bg-[#FFFDFB] px-5 py-6 text-left">
                <p className="text-[11px] font-semibold tracking-[0.16em] text-[#9A7137]">
                  {String(index + 1).padStart(2, "0")}
                </p>
                <h3 className="mt-3 text-xl font-semibold tracking-[-0.03em] text-[#302125]">
                  {step.title}
                </h3>
                <p className="mt-3 text-sm leading-7 text-[#76696C]">{step.body}</p>
              </li>
            </LandingReveal>
          ))}
        </ol>

        <LandingReveal className="mt-10 flex justify-center" delayMs={220}>
          <Link href="/sign-up">
            <Button
              size="lg"
              className="min-h-13 min-w-[220px] rounded-full border border-[#74172A] bg-[#74172A] px-7 text-sm font-semibold text-white shadow-[0_18px_45px_rgba(116,23,42,0.22)] transition-all duration-300 hover:-translate-y-1 hover:bg-[#5D1020]"
            >
              無料で最初の仕事を終わらせる
            </Button>
          </Link>
        </LandingReveal>
      </div>
    </section>
  );
}
