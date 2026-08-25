import Link from "next/link";

import { Button } from "@/components/ui/button";
import {
  PAY_REASON_DISCLAIMER,
} from "@/lib/landing/pay-reason";
import { PROOF_SNS_SAMPLE } from "@/lib/landing/proof-samples";

/**
 * People buy the future, not the file.
 * Uses sample typical-manual minutes only.
 */
export function LandingFutureSection() {
  const manual = PROOF_SNS_SAMPLE.typicalManualMinutes;

  return (
    <section
      id="future"
      className="border-t border-[var(--primary)]/8 bg-[var(--surface-muted)] px-4 py-16 sm:px-8 sm:py-24"
    >
      <div className="mx-auto max-w-[980px]">
        <p className="text-xs font-semibold tracking-[0.16em] text-[var(--accent-gold)]">
          買うのは未来
        </p>
        <h2 className="mt-3 text-3xl font-semibold tracking-[-0.04em] text-[var(--text-primary)] sm:text-4xl">
          朝の{manual}分を、戻す。
        </h2>
        <p className="mt-4 max-w-2xl text-sm leading-7 text-[var(--text-secondary)] sm:text-base">
          一人で仕事を回していると、毎朝のX投稿に時間を取られます。一度頼むと、戻ってきた時間で本業側に入れます。
        </p>

        <div className="mt-10 grid gap-4 md:grid-cols-3">
          <div className="rounded-[20px] border border-[var(--primary)]/10 bg-white p-5">
            <p className="text-[11px] font-semibold tracking-[0.14em] text-[var(--text-tertiary)]">
              BEFORE
            </p>
            <p className="mt-3 text-lg font-semibold text-[var(--text-primary)]">
              朝、X投稿に約{manual}分
            </p>
            <p className="mt-3 text-sm leading-7 text-[var(--text-secondary)]">
              テーマ探し・文面づくり・投稿を毎回ゼロから行う（手作業の目安・見本定義）。
            </p>
          </div>
          <div className="rounded-[20px] border border-[var(--primary)]/20 bg-[var(--background)] p-5">
            <p className="text-[11px] font-semibold tracking-[0.14em] text-[var(--accent-gold)]">
              WITH MINERVOT
            </p>
            <p className="mt-3 text-lg font-semibold text-[var(--primary)]">
              依頼して、確認する
            </p>
            <p className="mt-3 text-sm leading-7 text-[var(--text-secondary)]">
              メモを投げる → 完成通知 → 文面が手元に残る。設定の勉強は不要です。
            </p>
          </div>
          <div className="rounded-[20px] border border-[var(--primary)]/10 bg-white p-5">
            <p className="text-[11px] font-semibold tracking-[0.14em] text-[var(--text-tertiary)]">
              FUTURE
            </p>
            <p className="mt-3 text-lg font-semibold text-[var(--text-primary)]">
              その時間を、本業・家族・趣味へ
            </p>
            <p className="mt-3 text-sm leading-7 text-[var(--text-secondary)]">
              営業の準備、子どもの送り、集中仕事。戻った分だけ、人生側に使えます。
            </p>
          </div>
        </div>

        <p className="mt-5 text-xs leading-6 text-[var(--text-tertiary)]">{PAY_REASON_DISCLAIMER}</p>

        <div className="mt-8">
          <Link href="/sign-up">
            <Button
              size="lg"
              className="min-h-13 rounded-[var(--radius-large)] bg-[var(--primary)] px-7 text-sm font-semibold text-white hover:bg-[var(--primary-hover)]"
            >
              朝の{manual}分を、今日戻す
            </Button>
          </Link>
        </div>
      </div>
    </section>
  );
}
