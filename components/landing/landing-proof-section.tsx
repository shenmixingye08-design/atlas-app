import Link from "next/link";

import {
  getProofDisclaimer,
  getProofFileSamples,
  getProofMeasuredAt,
  getProofTextSamples,
} from "@/lib/landing/proof-catalog";
import {
  formatProofDurationFromMs,
  formatProofSavedMinutes,
} from "@/lib/landing/proof-samples";

function MetaRow({
  creationMs,
  typicalManualMinutes,
  savedMinutes,
  usedAi,
}: {
  creationMs: number;
  typicalManualMinutes: number;
  savedMinutes: number;
  usedAi: string;
}) {
  return (
    <dl className="mt-4 grid gap-2 text-sm sm:grid-cols-3">
      <div className="rounded-xl border border-[#74172A]/10 bg-white px-3 py-3">
        <dt className="text-[11px] text-[#9A8D90]">作成時間（実測）</dt>
        <dd className="mt-1 font-semibold text-[#281A1E]">
          {formatProofDurationFromMs(creationMs)}
        </dd>
      </div>
      <div className="rounded-xl border border-[#74172A]/10 bg-white px-3 py-3">
        <dt className="text-[11px] text-[#9A8D90]">削減目安（見本）</dt>
        <dd className="mt-1 font-semibold text-[#281A1E]">
          {formatProofSavedMinutes(savedMinutes)}
        </dd>
        <dd className="mt-1 text-[11px] text-[#9A8D90]">
          手作業の目安 {typicalManualMinutes}分 − 実測
        </dd>
      </div>
      <div className="rounded-xl border border-[#74172A]/10 bg-white px-3 py-3">
        <dt className="text-[11px] text-[#9A8D90]">使用したAI</dt>
        <dd className="mt-1 font-semibold text-[#281A1E]">{usedAi}</dd>
      </div>
    </dl>
  );
}

/**
 * Proof over polish — real sample deliverables with measured timings.
 * No new animations. No invented KPIs.
 */
export function LandingProofSection() {
  const textSamples = getProofTextSamples();
  const fileSamples = getProofFileSamples();
  const disclaimer = getProofDisclaimer();
  const measuredAt = getProofMeasuredAt();

  return (
    <section
      id="proof"
      className="border-t border-[#74172A]/8 bg-[#FAF6F5] px-4 py-16 sm:px-8 sm:py-24"
    >
      <div className="mx-auto max-w-[980px]">
        <div className="max-w-3xl">
          <p className="text-xs font-semibold tracking-[0.16em] text-[#9A7137]">
            見本 · 証拠
          </p>
          <h2 className="mt-3 text-3xl font-semibold tracking-[-0.04em] text-[#26191C] sm:text-4xl">
            実際にMINERVOTが作った完成見本
          </h2>
          <p className="mt-4 text-sm leading-7 text-[#75686B] sm:text-base">
            デザインではなく、仕事が終わる証拠です。数値は見本生成時の実測と、手作業の目安（見本定義）のみを使っています。
          </p>
          <p className="mt-3 rounded-xl border border-[#B58B4F]/30 bg-[#FFFDFB] px-4 py-3 text-xs leading-6 text-[#6B4E36]">
            {disclaimer}
            <span className="mt-1 block text-[#9A8D90]">
              見本生成の計測日時: {new Date(measuredAt).toLocaleString("ja-JP")}
            </span>
          </p>
        </div>

        <div className="mt-12 space-y-8">
          {textSamples.map((sample) => (
            <article
              key={sample.id}
              className="rounded-[24px] border border-[#74172A]/10 bg-white p-5 sm:p-7"
            >
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-xl font-semibold text-[#281A1E]">{sample.title}</h3>
                <span className="rounded-full border border-[#B58B4F]/40 bg-[#FFF8EB] px-2.5 py-0.5 text-[10px] font-semibold text-[#9A7137]">
                  見本
                </span>
                <span className="text-xs text-[#9A8D90]">{sample.formatLabel}</span>
              </div>

              <div className="mt-5 grid gap-4 md:grid-cols-2">
                <div className="rounded-2xl border border-[#74172A]/8 bg-[#FAF6F5] p-4">
                  <p className="text-[11px] font-semibold tracking-[0.14em] text-[#9A8D90]">
                    BEFORE · {sample.beforeLabel}
                  </p>
                  <p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-[#5A4B4F]">
                    {sample.before}
                  </p>
                </div>
                <div className="rounded-2xl border border-[#74172A]/20 bg-[#FFFDFB] p-4">
                  <p className="text-[11px] font-semibold tracking-[0.14em] text-[#9A7137]">
                    AFTER · {sample.afterLabel}
                  </p>
                  <p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-[#281A1E]">
                    {sample.after}
                  </p>
                </div>
              </div>

              <MetaRow
                creationMs={sample.creationMs}
                typicalManualMinutes={sample.typicalManualMinutes}
                savedMinutes={sample.savedMinutes}
                usedAi={sample.usedAi}
              />

              {sample.href && (
                <p className="mt-4 text-sm">
                  <Link
                    href={sample.href}
                    className="font-medium text-[#74172A] underline-offset-2 hover:underline"
                  >
                    見本ファイルを開く
                  </Link>
                </p>
              )}
            </article>
          ))}

          {fileSamples.map((sample) => (
            <article
              key={sample.id}
              className="rounded-[24px] border border-[#74172A]/10 bg-white p-5 sm:p-7"
            >
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-xl font-semibold text-[#281A1E]">{sample.title}</h3>
                <span className="rounded-full border border-[#B58B4F]/40 bg-[#FFF8EB] px-2.5 py-0.5 text-[10px] font-semibold text-[#9A7137]">
                  見本
                </span>
                <span className="text-xs text-[#9A8D90]">{sample.formatLabel}</span>
              </div>
              <p className="mt-3 text-sm leading-7 text-[#75686B]">{sample.summary}</p>

              <MetaRow
                creationMs={sample.creationMs}
                typicalManualMinutes={sample.typicalManualMinutes}
                savedMinutes={sample.savedMinutes}
                usedAi={sample.usedAi}
              />

              <div className="mt-5 flex flex-wrap items-center gap-4">
                <Link
                  href={sample.href}
                  className="inline-flex min-h-11 items-center justify-center rounded-full bg-[#74172A] px-5 text-sm font-semibold text-white hover:bg-[#5D1020]"
                >
                  {sample.formatLabel}をダウンロード
                </Link>
                {sample.bytes != null && (
                  <p className="text-xs text-[#9A8D90]">
                    {sample.fileName} · {(sample.bytes / 1024).toFixed(1)} KB · 実ファイル
                  </p>
                )}
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
