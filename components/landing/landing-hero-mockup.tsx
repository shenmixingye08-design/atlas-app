"use client";

import { cn } from "@/lib/design-system/cn";
import { PROOF_SNS_SAMPLE } from "@/lib/landing/proof-samples";

const FLOW = [
  { id: "1", title: "依頼", detail: PROOF_SNS_SAMPLE.before.slice(0, 22) + "…", state: "done" as const },
  { id: "2", title: "AIが作業中", detail: "MINERVOTが進めています", state: "done" as const },
  { id: "3", title: "完成通知", detail: "仕事が完了しました", state: "done" as const },
  { id: "4", title: "完成物", detail: "投稿文が手元に残る", state: "active" as const },
] as const;

/**
 * Hero visual = finish story, not a feature dashboard.
 */
export function LandingHeroMockup() {
  return (
    <div className="mx-auto w-full max-w-[720px]">
      <div className="overflow-hidden rounded-[28px] border border-[#74172A]/10 bg-white/85 shadow-[0_35px_100px_rgba(74,18,31,0.16)]">
        <div className="flex items-center justify-between border-b border-[#74172A]/10 bg-white/75 px-4 py-3 sm:px-5">
          <div className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-[#FF5F57]" />
            <span className="h-2.5 w-2.5 rounded-full bg-[#FEBC2E]" />
            <span className="h-2.5 w-2.5 rounded-full bg-[#28C840]" />
          </div>
          <div className="rounded-full border border-[#74172A]/10 bg-white/85 px-4 py-1.5 text-[10px] font-medium text-[#8B7D80]">
            依頼 → 完成
          </div>
          <span className="text-[9px] font-bold tracking-[0.16em] text-emerald-700">
            DONE
          </span>
        </div>

        <div className="space-y-4 p-5 sm:p-7">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#A17B42]">
              仕事が終わる瞬間
            </p>
            <h2 className="mt-2 text-xl font-semibold tracking-[-0.03em] text-[#2C1C20] sm:text-2xl">
              完成通知が来て、文面が残る。
            </h2>
          </div>

          <ol className="space-y-2">
            {FLOW.map((step, index) => (
              <li
                key={step.id}
                className={cn(
                  "flex items-start gap-3 rounded-2xl border px-4 py-3",
                  step.state === "active"
                    ? "border-[#74172A]/20 bg-[#FFFDFB]"
                    : "border-[#74172A]/8 bg-white/80",
                )}
              >
                <span
                  className={cn(
                    "mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
                    step.state === "active"
                      ? "bg-[#74172A] text-white"
                      : "bg-[#FFF4DF] text-[#9A7137]",
                  )}
                >
                  {step.state === "done" ? "✓" : index + 1}
                </span>
                <div>
                  <p className="text-sm font-semibold text-[#302125]">{step.title}</p>
                  <p className="mt-0.5 text-xs text-[#7A6D70]">{step.detail}</p>
                </div>
              </li>
            ))}
          </ol>

          <div className="rounded-2xl border border-[#74172A]/10 bg-[#FFFDFB] px-4 py-4">
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#9A8D90]">
              完成した内容（見本）
            </p>
            <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-[#49373C]">
              {PROOF_SNS_SAMPLE.after.split("\n").slice(0, 4).join("\n")}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
