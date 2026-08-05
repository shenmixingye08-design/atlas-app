import Link from "next/link";

import { Button } from "@/components/ui/button";
import { PROOF_SNS_SAMPLE } from "@/lib/landing/proof-samples";

const STEPS = [
  {
    id: "request",
    label: "① 依頼",
    title: "メモを投げる",
    body: PROOF_SNS_SAMPLE.before,
  },
  {
    id: "working",
    label: "② AIが作業中",
    title: "MINERVOTが進める",
    body: "設定画面は開きません。依頼を受けたあと、MINERVOTが投稿文を仕上げます。",
  },
  {
    id: "notify",
    label: "③ 完成通知",
    title: "「仕事が完了しました」",
    body: "会話の続きではなく、完了の知らせが来ます。確認するだけで次に進めます。",
  },
  {
    id: "done",
    label: "④ 完成物",
    title: "手元に残る文面",
    body: PROOF_SNS_SAMPLE.after,
  },
] as const;

/**
 * One story: request → working → notify → deliverable.
 * Proof narrative, not decoration.
 */
export function LandingFinishStory() {
  return (
    <section
      id="finish-story"
      className="border-t border-[#74172A]/8 bg-white px-4 py-16 sm:px-8 sm:py-24"
    >
      <div className="mx-auto max-w-[980px]">
        <p className="text-xs font-semibold tracking-[0.16em] text-[#9A7137]">
          仕事が終わる瞬間
        </p>
        <h2 className="mt-3 text-3xl font-semibold tracking-[-0.04em] text-[#26191C] sm:text-4xl">
          依頼してから、完成するまで。
        </h2>
        <p className="mt-4 max-w-2xl text-sm leading-7 text-[#75686B] sm:text-base">
          成果物の一覧ではありません。1件の仕事が終わる流れです（SNS見本）。
        </p>

        <ol className="mt-10 space-y-4">
          {STEPS.map((step) => (
            <li
              key={step.id}
              className="rounded-[20px] border border-[#74172A]/10 bg-[#FFFDFB] p-5 sm:p-6"
            >
              <p className="text-[11px] font-semibold tracking-[0.14em] text-[#9A7137]">
                {step.label}
              </p>
              <h3 className="mt-2 text-lg font-semibold text-[#281A1E]">
                {step.title}
              </h3>
              <p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-[#5A4B4F]">
                {step.body}
              </p>
            </li>
          ))}
        </ol>

        <p className="mt-4 text-xs text-[#9A8D90]">
          ※本文は見本です。実ファイルは
          <a href="#proof" className="mx-1 text-[#74172A] underline-offset-2 hover:underline">
            完成見本
          </a>
          から確認できます。
        </p>

        <div className="mt-8">
          <Link href="/sign-up">
            <Button
              size="lg"
              className="min-h-13 rounded-full bg-[#74172A] px-7 text-sm font-semibold text-white hover:bg-[#5D1020]"
            >
              今すぐ同じ流れで1件終わらせる
            </Button>
          </Link>
        </div>
      </div>
    </section>
  );
}
