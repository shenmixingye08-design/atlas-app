"use client";

import Link from "next/link";

import { Button } from "@/components/ui/button";

const STEPS = [
  {
    id: "ask",
    title: "一度頼む",
    body: "「毎朝10時に投稿して」と伝える。テーマと時間だけ。",
  },
  {
    id: "run",
    title: "毎日自動実行",
    body: "原稿作成からXへの投稿まで、MINERVOTが進めます。",
  },
  {
    id: "done",
    title: "確認するだけ",
    body: "終わったら通知。自分は結果を見るだけです。",
  },
] as const;

/**
 * Conversion path — mirrors post-signup flow. No reveal animations added.
 */
export function LandingFirstPath() {
  return (
    <section
      id="first-path"
      className="relative overflow-hidden border-t border-[#74172A]/8 bg-white px-4 py-16 sm:px-8 sm:py-24"
    >
      <div className="mx-auto max-w-[980px]">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-semibold tracking-[-0.045em] text-[#26191C] sm:text-4xl">
            最初は、これだけ。
          </h2>
          <p className="mt-4 text-sm leading-7 text-[#75686B] sm:text-base">
            覚えることはありません。選んで依頼すると、完成まで進みます。
          </p>
        </div>

        <ol className="mt-12 grid gap-4 sm:grid-cols-3">
          {STEPS.map((step, index) => (
            <li
              key={step.id}
              className="relative h-full rounded-[24px] border border-[#74172A]/8 bg-[#FFFDFB] px-5 py-6 text-left"
            >
              <p className="text-[11px] font-semibold tracking-[0.16em] text-[#9A7137]">
                {String(index + 1).padStart(2, "0")}
              </p>
              <h3 className="mt-3 text-xl font-semibold tracking-[-0.03em] text-[#302125]">
                {step.title}
              </h3>
              <p className="mt-3 text-sm leading-7 text-[#76696C]">{step.body}</p>
            </li>
          ))}
        </ol>

        <div className="mt-10 flex justify-center">
          <Link href="/sign-up">
            <Button
              size="lg"
              className="min-h-13 min-w-[220px] rounded-full border border-[#74172A] bg-[#74172A] px-7 text-sm font-semibold text-white"
            >
              無料で1回試す
            </Button>
          </Link>
        </div>
      </div>
    </section>
  );
}
