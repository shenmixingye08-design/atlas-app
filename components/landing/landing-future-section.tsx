import Link from "next/link";

import { Button } from "@/components/ui/button";
import {
  PAY_REASON_DISCLAIMER,
} from "@/lib/landing/pay-reason";
import { PROOF_EMAIL_SAMPLE } from "@/lib/landing/proof-samples";

/**
 * People buy the future, not the file.
 * Uses sample typical-manual minutes only.
 */
export function LandingFutureSection() {
  const manual = PROOF_EMAIL_SAMPLE.typicalManualMinutes;

  return (
    <section
      id="future"
      className="border-t border-[#74172A]/8 bg-[#FAF6F5] px-4 py-16 sm:px-8 sm:py-24"
    >
      <div className="mx-auto max-w-[980px]">
        <p className="text-xs font-semibold tracking-[0.16em] text-[#9A7137]">
          買うのは未来
        </p>
        <h2 className="mt-3 text-3xl font-semibold tracking-[-0.04em] text-[#26191C] sm:text-4xl">
          朝の{manual}分を、戻す。
        </h2>
        <p className="mt-4 max-w-2xl text-sm leading-7 text-[#75686B] sm:text-base">
          一人で仕事を回していると、朝のメールや投稿に時間を取られます。戻ってきた時間で、本業側に入れます。
        </p>

        <div className="mt-10 grid gap-4 md:grid-cols-3">
          <div className="rounded-[20px] border border-[#74172A]/10 bg-white p-5">
            <p className="text-[11px] font-semibold tracking-[0.14em] text-[#9A8D90]">
              BEFORE
            </p>
            <p className="mt-3 text-lg font-semibold text-[#281A1E]">
              朝、メール作成に約{manual}分
            </p>
            <p className="mt-3 text-sm leading-7 text-[#75686B]">
              件名・挨拶・次の一手を毎回ゼロから書く（手作業の目安・見本定義）。
            </p>
          </div>
          <div className="rounded-[20px] border border-[#74172A]/20 bg-[#FFFDFB] p-5">
            <p className="text-[11px] font-semibold tracking-[0.14em] text-[#9A7137]">
              WITH MINERVOT
            </p>
            <p className="mt-3 text-lg font-semibold text-[#74172A]">
              依頼して、確認する
            </p>
            <p className="mt-3 text-sm leading-7 text-[#6B4E36]">
              メモを投げる → 完成通知 → 文面が手元に残る。設定の勉強は不要です。
            </p>
          </div>
          <div className="rounded-[20px] border border-[#74172A]/10 bg-white p-5">
            <p className="text-[11px] font-semibold tracking-[0.14em] text-[#9A8D90]">
              FUTURE
            </p>
            <p className="mt-3 text-lg font-semibold text-[#281A1E]">
              その時間を、本業・家族・趣味へ
            </p>
            <p className="mt-3 text-sm leading-7 text-[#75686B]">
              営業の準備、子どもの送り、集中仕事。戻った分だけ、人生側に使えます。
            </p>
          </div>
        </div>

        <p className="mt-5 text-xs leading-6 text-[#9A8D90]">{PAY_REASON_DISCLAIMER}</p>

        <div className="mt-8">
          <Link href="/sign-up">
            <Button
              size="lg"
              className="min-h-13 rounded-full bg-[#74172A] px-7 text-sm font-semibold text-white hover:bg-[#5D1020]"
            >
              朝の{manual}分を、今日戻す
            </Button>
          </Link>
        </div>
      </div>
    </section>
  );
}
