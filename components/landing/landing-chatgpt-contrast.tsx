"use client";

import { PRODUCT_FINISHING_HEADLINE } from "@/lib/product-focus/messaging";

/**
 * Contrast without attacking a specific company.
 * Claims stay inside implemented auto-exec: set once → run → notify.
 */
export function LandingChatgptContrast() {
  return (
    <div className="mt-10 w-full max-w-[570px] space-y-3 lg:mx-0 mx-auto">
      <p className="text-left text-sm font-semibold tracking-[-0.02em] text-[var(--text-primary)]">
        {PRODUCT_FINISHING_HEADLINE}
      </p>
      <div
        className="overflow-hidden rounded-[20px] border border-[var(--primary)]/15 bg-white text-left"
        aria-label="一般的なAIとMINERVOTの違い"
      >
        <div className="grid grid-cols-2 border-b border-[var(--primary)]/10 text-[11px] font-semibold tracking-[0.08em]">
          <p className="bg-[var(--surface-muted)] px-3 py-2 text-[var(--text-tertiary)]">一般的なAI</p>
          <p className="bg-[var(--surface-muted)] px-3 py-2 text-[var(--accent-gold)]">MINERVOT</p>
        </div>
        <div className="grid grid-cols-2 text-sm">
          <p className="border-b border-[var(--primary)]/8 px-3 py-3 text-[var(--text-secondary)]">
            毎回「文章を作って」
          </p>
          <p className="border-b border-[var(--primary)]/8 px-3 py-3 font-medium text-[var(--primary)]">
            一度設定
          </p>
          <p className="border-b border-[var(--primary)]/8 px-3 py-3 text-[var(--text-secondary)]">
            コピー
          </p>
          <p className="border-b border-[var(--primary)]/8 px-3 py-3 font-medium text-[var(--primary)]">
            次から自動実行
          </p>
          <p className="px-3 py-3 text-[var(--text-secondary)]">
            投稿は自分
          </p>
          <p className="px-3 py-3 font-medium text-[var(--primary)]">
            完了通知
          </p>
        </div>
      </div>
      <p className="text-left text-xs leading-5 text-[var(--text-secondary)]">
        質問に答えるAIではなく、毎日のX投稿を設定どおり終わらせる秘書です。
      </p>
    </div>
  );
}
