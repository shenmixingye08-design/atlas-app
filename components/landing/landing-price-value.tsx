import Link from "next/link";

import { Button } from "@/components/ui/button";
import {
  LIGHT_PLAN_JPY,
  PAY_REASON_DISCLAIMER,
  REFERENCE_CANNED_COFFEE_JPY,
  coffeeCansForLightPlan,
  minutesToHoursLabel,
  sampleMonthlyCombinedMinutes,
  sampleMonthlyEmailMinutes,
} from "@/lib/landing/pay-reason";
import { PROOF_EMAIL_SAMPLE } from "@/lib/landing/proof-samples";

/**
 * Make ¥980 feel cheap by comparison — not by explaining the plan sheet.
 * All time math is sample-baseline based and labeled.
 */
export function LandingPriceValue() {
  const emailMonth = sampleMonthlyEmailMinutes();
  const combinedMonth = sampleMonthlyCombinedMinutes();
  const cans = coffeeCansForLightPlan();
  const dailyEmail = PROOF_EMAIL_SAMPLE.typicalManualMinutes;

  return (
    <section
      id="price-value"
      className="border-t border-[#74172A]/8 bg-white px-4 py-16 sm:px-8 sm:py-24"
    >
      <div className="mx-auto max-w-[980px]">
        <p className="text-xs font-semibold tracking-[0.16em] text-[#9A7137]">
          月{LIGHT_PLAN_JPY.toLocaleString("ja-JP")}円の見え方
        </p>
        <h2 className="mt-3 text-3xl font-semibold tracking-[-0.04em] text-[#26191C] sm:text-4xl">
          価格を説明しません。比較します。
        </h2>

        <ul className="mt-10 space-y-4">
          <li className="rounded-[20px] border border-[#74172A]/10 bg-[#FFFDFB] p-5">
            <p className="text-lg font-semibold text-[#281A1E]">
              缶コーヒー約{cans}本分
            </p>
            <p className="mt-2 text-sm leading-7 text-[#75686B]">
              月{LIGHT_PLAN_JPY.toLocaleString("ja-JP")}円 ÷ 缶コーヒー約
              {REFERENCE_CANNED_COFFEE_JPY}円（参考換算）。
              毎日のメール作成を手放す対価として見る。
            </p>
          </li>
          <li className="rounded-[20px] border border-[#74172A]/10 bg-[#FFFDFB] p-5">
            <p className="text-lg font-semibold text-[#281A1E]">
              毎日約{dailyEmail}分が戻る（見本目安）
            </p>
            <p className="mt-2 text-sm leading-7 text-[#75686B]">
              メール手作業の目安{dailyEmail}分 × 平日20日 ＝ 月約
              {minutesToHoursLabel(emailMonth)}相当。
              「短い休憩より高い／安いか」ではなく、「毎日戻るか」。
            </p>
          </li>
          <li className="rounded-[20px] border border-[#74172A]/15 bg-[#FAF6F5] p-5">
            <p className="text-lg font-semibold text-[#74172A]">
              SNS＋メールを毎日任せるなら、月約
              {minutesToHoursLabel(combinedMonth)}相当（見本）
            </p>
            <p className="mt-2 text-sm leading-7 text-[#75686B]">
              これが「無料だから試す」ではなく「{LIGHT_PLAN_JPY.toLocaleString("ja-JP")}円でも使いたい」の計算です。
              1日あたりに割ると、缶コーヒー1本より小さい判断になります。
            </p>
          </li>
        </ul>

        <p className="mt-5 text-xs leading-6 text-[#9A8D90]">{PAY_REASON_DISCLAIMER}</p>

        <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
          <Link href="/sign-up">
            <Button
              size="lg"
              className="min-h-13 rounded-full bg-[#74172A] px-7 text-sm font-semibold text-white hover:bg-[#5D1020]"
            >
              今すぐ1件終わらせて判断する
            </Button>
          </Link>
          <a
            href="#pricing"
            className="text-sm font-medium text-[#74172A] underline-offset-2 hover:underline"
          >
            Light（月{LIGHT_PLAN_JPY.toLocaleString("ja-JP")}円）の内容を見る
          </a>
        </div>
      </div>
    </section>
  );
}
