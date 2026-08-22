"use client";

import { PRODUCT_FINISHING_HEADLINE } from "@/lib/product-focus/messaging";

/**
 * Contrast without attacking a specific company.
 * Claims stay inside implemented auto-exec: set once → run → notify.
 */
export function LandingChatgptContrast() {
  return (
    <div className="mt-10 w-full max-w-[570px] space-y-3 lg:mx-0 mx-auto">
      <p className="text-left text-sm font-semibold tracking-[-0.02em] text-[#281A1E]">
        {PRODUCT_FINISHING_HEADLINE}
      </p>
      <div
        className="overflow-hidden rounded-[20px] border border-[#74172A]/15 bg-white text-left"
        aria-label="一般的なAIとMINERVOTの違い"
      >
        <div className="grid grid-cols-2 border-b border-[#74172A]/10 text-[11px] font-semibold tracking-[0.08em]">
          <p className="bg-[#F5F1F0] px-3 py-2 text-[#8B7E81]">一般的なAI</p>
          <p className="bg-[#FFF8EB] px-3 py-2 text-[#9A7137]">MINERVOT</p>
        </div>
        <div className="grid grid-cols-2 text-sm">
          <p className="border-b border-[#74172A]/8 px-3 py-3 text-[#5A4B4F]">
            毎回「文章を作って」
          </p>
          <p className="border-b border-[#74172A]/8 px-3 py-3 font-medium text-[#74172A]">
            一度設定
          </p>
          <p className="border-b border-[#74172A]/8 px-3 py-3 text-[#5A4B4F]">
            コピー
          </p>
          <p className="border-b border-[#74172A]/8 px-3 py-3 font-medium text-[#74172A]">
            次から自動実行
          </p>
          <p className="px-3 py-3 text-[#5A4B4F]">
            投稿は自分
          </p>
          <p className="px-3 py-3 font-medium text-[#74172A]">
            完了通知
          </p>
        </div>
      </div>
      <p className="text-left text-xs leading-5 text-[#75686B]">
        質問に答えるAIではなく、毎日のX投稿を設定どおり終わらせる秘書です。
      </p>
    </div>
  );
}
