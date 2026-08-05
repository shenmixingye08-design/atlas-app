"use client";

/**
 * Competitor switch clarity — copy only.
 * ChatGPT / Claude / Gemini = talk; MINERVOT = work finished.
 */
export function LandingChatgptContrast() {
  return (
    <div
      className="mt-10 grid w-full max-w-[570px] gap-3 sm:grid-cols-2 lg:mx-0 mx-auto"
      aria-label="ChatGPT・Claude・GeminiとMINERVOTの違い"
    >
      <div className="rounded-[20px] border border-[#D8C9BD]/80 bg-white/70 px-4 py-4 text-left">
        <p className="text-[10px] font-semibold tracking-[0.12em] text-[#9A8D90]">
          ChatGPT / Claude / Gemini
        </p>
        <p className="mt-3 text-lg font-semibold tracking-[-0.03em] text-[#5A4B4F]">
          会話する
        </p>
        <p className="mt-2 text-xs leading-5 text-[#8B7E81]">
          聞いて答える。仕事は自分の手元に残る。
        </p>
      </div>

      <div className="rounded-[20px] border border-[#74172A]/25 bg-[#FFFDFB] px-4 py-4 text-left">
        <p className="text-[10px] font-semibold tracking-[0.12em] text-[#9A7137]">
          MINERVOT
        </p>
        <p className="mt-3 text-lg font-semibold tracking-[-0.03em] text-[#74172A]">
          仕事が終わる
        </p>
        <p className="mt-2 text-xs leading-5 text-[#6B4E36]">
          選んで依頼するだけ。完成まで進む。
        </p>
      </div>
    </div>
  );
}
