"use client";

/**
 * First-viewport contrast: ChatGPT = talk / MINERVOT = work finished.
 * Copy-only clarity aid — no new product capability.
 */
export function LandingChatgptContrast() {
  return (
    <div
      className="animate-fade-up delay-200 mt-10 grid w-full max-w-[570px] gap-3 sm:grid-cols-2 lg:mx-0 mx-auto"
      aria-label="ChatGPTとMINERVOTの違い"
    >
      <div className="rounded-[20px] border border-[#D8C9BD]/80 bg-white/70 px-4 py-4 text-left shadow-[0_10px_28px_rgba(61,28,35,0.04)]">
        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#9A8D90]">
          ChatGPT
        </p>
        <p className="mt-3 text-lg font-semibold tracking-[-0.03em] text-[#5A4B4F]">
          会話する
        </p>
        <p className="mt-2 text-xs leading-5 text-[#8B7E81]">
          聞いて答える。仕事は手元に残る。
        </p>
      </div>

      <div className="rounded-[20px] border border-[#74172A]/25 bg-[linear-gradient(160deg,#fff9ef,#fffdfb)] px-4 py-4 text-left shadow-[0_14px_36px_rgba(116,23,42,0.10)]">
        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#9A7137]">
          MINERVOT
        </p>
        <p className="mt-3 text-lg font-semibold tracking-[-0.03em] text-[#74172A]">
          仕事が終わる
        </p>
        <p className="mt-2 text-xs leading-5 text-[#6B4E36]">
          選んで依頼する。完成まで進む。
        </p>
      </div>
    </div>
  );
}
