"use client";

/**
 * Strong "this is a different category" contrast.
 * Not "answers better" — "your job is still yours" vs "job ends".
 */
export function LandingChatgptContrast() {
  return (
    <div className="mt-10 w-full max-w-[570px] space-y-3 lg:mx-0 mx-auto">
      <div
        className="overflow-hidden rounded-[20px] border border-[#74172A]/15 bg-white text-left"
        aria-label="ChatGPT・Claude・GeminiとMINERVOTは別物"
      >
        <div className="grid grid-cols-2 border-b border-[#74172A]/10 text-[11px] font-semibold tracking-[0.08em]">
          <p className="bg-[#F5F1F0] px-3 py-2 text-[#8B7E81]">ChatGPT / Claude / Gemini</p>
          <p className="bg-[#FFF8EB] px-3 py-2 text-[#9A7137]">MINERVOT</p>
        </div>
        <div className="grid grid-cols-2 text-sm">
          <p className="border-b border-[#74172A]/8 px-3 py-3 text-[#5A4B4F]">
            質問に答える
          </p>
          <p className="border-b border-[#74172A]/8 px-3 py-3 font-medium text-[#74172A]">
            仕事を終わらせる
          </p>
          <p className="border-b border-[#74172A]/8 px-3 py-3 text-[#5A4B4F]">
            下書きは出る。送信・体裁・仕上げは自分
          </p>
          <p className="border-b border-[#74172A]/8 px-3 py-3 font-medium text-[#74172A]">
            完成した内容が手元に残る
          </p>
          <p className="border-b border-[#74172A]/8 px-3 py-3 text-[#5A4B4F]">
            毎日の習慣にならない（都度チャット）
          </p>
          <p className="border-b border-[#74172A]/8 px-3 py-3 font-medium text-[#74172A]">
            毎朝のX投稿・メール・資料の枠に入る
          </p>
          <p className="px-3 py-3 text-[#5A4B4F]">
            会話が資産。仕事は残る
          </p>
          <p className="px-3 py-3 font-medium text-[#74172A]">
            終わった仕事が資産になる
          </p>
        </div>
      </div>
      <p className="text-left text-xs leading-5 text-[#75686B]">
        見た瞬間の結論：チャットAIの上位互換ではありません。
        <span className="font-semibold text-[#74172A]">仕事完了の別カテゴリ</span>
        です。
      </p>
    </div>
  );
}
