"use client";

import { cn } from "@/lib/design-system/cn";

import { LandingReveal } from "./landing-reveal";

const FLOW = [
  { id: "1", title: "仕事を選ぶ", detail: "SNS投稿", state: "done" as const },
  { id: "2", title: "1回依頼", detail: "投稿文を1件作って", state: "done" as const },
  { id: "3", title: "完成", detail: "投稿文が手元に残る", state: "active" as const },
] as const;

/**
 * Hero visual: completion path, not a feature dashboard.
 */
export function LandingHeroMockup() {
  return (
    <LandingReveal className="mx-auto w-full max-w-[720px]" delayMs={200}>
      <div className="animate-landing-float overflow-hidden rounded-[28px] border border-[#74172A]/10 bg-white/85 shadow-[0_35px_100px_rgba(74,18,31,0.16)] backdrop-blur-2xl">
        <div className="flex items-center justify-between border-b border-[#74172A]/10 bg-white/75 px-4 py-3 sm:px-5">
          <div className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-[#FF5F57]" />
            <span className="h-2.5 w-2.5 rounded-full bg-[#FEBC2E]" />
            <span className="h-2.5 w-2.5 rounded-full bg-[#28C840]" />
          </div>
          <div className="rounded-full border border-[#74172A]/10 bg-white/85 px-4 py-1.5 text-[10px] font-medium text-[#8B7D80]">
            minervot.app / 最初の仕事
          </div>
          <span className="text-[9px] font-bold tracking-[0.16em] text-emerald-700">
            DONE
          </span>
        </div>

        <div className="relative space-y-5 p-5 sm:p-7">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#A17B42]">
              Work finished
            </p>
            <h2 className="mt-2 text-xl font-semibold tracking-[-0.03em] text-[#2C1C20] sm:text-2xl">
              仕事が完了しました。
            </h2>
            <p className="mt-2 text-sm text-[#827579]">
              会話ではなく、完成した内容が残ります。
            </p>
          </div>

          <ol className="space-y-3">
            {FLOW.map((step, index) => (
              <li
                key={step.id}
                className={cn(
                  "flex items-start gap-3 rounded-2xl border px-4 py-3",
                  step.state === "active"
                    ? "border-[#74172A]/20 bg-[linear-gradient(135deg,#fff9ef,#fffdfb)]"
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
              完成した内容
            </p>
            <p className="mt-2 text-sm leading-6 text-[#49373C]">
              【今日のひとこと】毎日の投稿準備をMINERVOTに任せると、確認するだけで進められます。
            </p>
          </div>
        </div>
      </div>
    </LandingReveal>
  );
}
