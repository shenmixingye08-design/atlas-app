import Link from "next/link";

import { Button } from "@/components/ui/button";
import {
  PAY_REASON_DISCLAIMER,
  SAMPLE_DAILY_HABITS,
  minutesToHoursLabel,
  sampleMonthlyCombinedMinutes,
} from "@/lib/landing/pay-reason";

/**
 * Daily open reason — not "convenient", but embedded in the day.
 */
export function LandingDailyHabit() {
  const monthly = sampleMonthlyCombinedMinutes();

  return (
    <section
      id="daily"
      className="border-t border-[var(--primary)]/8 bg-white px-4 py-16 sm:px-8 sm:py-24"
    >
      <div className="mx-auto max-w-[980px]">
        <p className="text-xs font-semibold tracking-[0.16em] text-[var(--accent-gold)]">
          毎日開く理由
        </p>
        <h2 className="mt-3 text-3xl font-semibold tracking-[-0.04em] text-[var(--text-primary)] sm:text-4xl">
          毎日のX投稿を、確認するだけにする。
        </h2>
        <p className="mt-4 max-w-2xl text-sm leading-7 text-[var(--text-secondary)] sm:text-base">
          「毎朝10時に投稿して」と一度頼むと、原稿作成と投稿が自動で進みます。使うほど、前回の文体や長さを覚えて、毎回の細かい指示が減ります。
        </p>

        <ul className="mt-10 grid gap-4 sm:grid-cols-2">
          {SAMPLE_DAILY_HABITS.map((habit) => (
            <li
              key={habit.id}
              className="rounded-[20px] border border-[var(--primary)]/10 bg-[var(--background)] p-5"
            >
              <p className="text-[11px] font-semibold tracking-[0.14em] text-[var(--accent-gold)]">
                {habit.when}
              </p>
              <h3 className="mt-2 text-lg font-semibold text-[var(--text-primary)]">
                {habit.title}
              </h3>
              <p className="mt-3 text-sm text-[var(--text-secondary)]">
                依頼例：「{habit.request}」
              </p>
              <p className="mt-2 text-sm leading-7 text-[var(--text-secondary)]">
                手作業の目安 {habit.typicalManualMinutes}分（見本定義）→ {habit.future}
              </p>
            </li>
          ))}
        </ul>

        <div className="mt-8 rounded-[20px] border border-[var(--primary)]/15 bg-[var(--surface-muted)] px-5 py-5">
          <p className="text-base font-semibold text-[var(--text-primary)]">
            見本計算：毎朝SNS（15分）＋平日メール（10分）を任せる場合
          </p>
          <p className="mt-2 text-sm leading-7 text-[var(--text-secondary)]">
            月あたり約{minutesToHoursLabel(monthly)}相当の手作業目安が対象になります。
            これが「毎日開く理由」です。
          </p>
          <p className="mt-3 text-xs leading-6 text-[var(--text-tertiary)]">{PAY_REASON_DISCLAIMER}</p>
        </div>

        <div className="mt-8">
          <Link href="/sign-up">
            <Button
              size="lg"
              className="min-h-13 rounded-[var(--radius-large)] bg-[var(--primary)] px-7 text-sm font-semibold text-white hover:bg-[var(--primary-hover)]"
            >
              毎日の1枠から始める
            </Button>
          </Link>
        </div>
      </div>
    </section>
  );
}
