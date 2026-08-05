"use client";

import Link from "next/link";
import { Show } from "@clerk/nextjs";

import { Button } from "@/components/ui/button";
import { ATLAS_APP_HOME_PATH } from "@/lib/auth/public-routes";

const REFERRAL_LINES = [
  "ChatGPTに聞いて終わる仕事、これだと完成までやってくれる。",
  "投稿も資料も、自分で抱えなくてよくなった。月980円から。",
  "登録して仕事を1つ選ぶだけ。会話じゃなくて、仕事が終わる。",
] as const;

export function LandingCtaSection() {
  return (
    <section className="border-t border-[#74172A]/8 bg-[#FAF6F5] px-4 py-20 sm:px-8 sm:py-28">
      <div className="mx-auto max-w-5xl">
        <div className="overflow-hidden rounded-[34px] border border-[#B58B4F]/20 bg-white px-6 py-16 text-center sm:px-12 sm:py-20">
          <h2 className="text-3xl font-semibold tracking-[-0.04em] text-[#281A1E] sm:text-5xl">
            友達に「これ使え」と
            <br />
            言いたくなる理由。
          </h2>

          <ul className="mx-auto mt-8 max-w-2xl space-y-3 text-left">
            {REFERRAL_LINES.map((line) => (
              <li
                key={line}
                className="rounded-2xl border border-[#74172A]/8 bg-[#FFFDFB] px-4 py-3 text-sm leading-7 text-[#49373C]"
              >
                「{line}」
              </li>
            ))}
          </ul>

          <p className="mx-auto mt-8 max-w-2xl text-base leading-8 text-[#75686B]">
            すごいAIではありません。楽になるための仕事完了です。
          </p>

          <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
            <Show when="signed-out">
              <Link href="/sign-up">
                <Button
                  size="lg"
                  className="min-w-[220px] rounded-full bg-[#74172A] px-8 py-6 text-white hover:bg-[#5F1222]"
                >
                  無料で最初の仕事を終わらせる
                </Button>
              </Link>
            </Show>

            <Show when="signed-in">
              <Link href={ATLAS_APP_HOME_PATH}>
                <Button
                  size="lg"
                  className="min-w-[220px] rounded-full bg-[#74172A] px-8 py-6 text-white hover:bg-[#5F1222]"
                >
                  仕事を終わらせる
                </Button>
              </Link>
            </Show>
          </div>

          <p className="mt-8 text-sm text-[#75686B]">
            クレジットカード不要 · 無料で1件完成まで · 月980円から
          </p>
        </div>
      </div>
    </section>
  );
}
