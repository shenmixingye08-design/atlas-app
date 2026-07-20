import {
  LANDING_EXAMPLE_STATUS_LABEL,
  LANDING_REQUEST_EXAMPLES,
  type LandingExampleStatus,
} from "@/lib/landing/content";
import { cn } from "@/lib/design-system/cn";

import { LandingReveal } from "./landing-reveal";

function statusClassName(status: LandingExampleStatus): string {
  switch (status) {
    case "available":
      return "border border-emerald-500/15 bg-emerald-500/10 text-emerald-700";
    case "partial":
      return "border border-[#B58B4F]/20 bg-[#FFF8EB] text-[#9A7137]";
    case "upcoming":
      return "border border-[#74172A]/8 bg-[#74172A]/[0.04] text-[#817478]";
  }
}

export function LandingRequestExamplesSection() {
  return (
    <section
      id="examples"
      className="border-t border-[#74172A]/8 bg-[#FAF6F5] px-4 py-20 sm:px-8 sm:py-28 lg:py-32"
    >
      <div className="mx-auto max-w-6xl">
        <LandingReveal className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-semibold tracking-[0.18em] text-[#74172A]">
            REAL WORK EXAMPLES
          </p>

          <h2 className="mt-4 text-3xl font-semibold tracking-[-0.04em] text-[#281A1E] sm:text-4xl">
            このような仕事を、MINERVOTへ。
          </h2>

          <p className="mt-6 text-base leading-8 text-[#75686B] sm:mt-8 sm:text-lg">
            写真や資料と、ご依頼内容を送るだけ。
            <br className="hidden sm:inline" />
            MINERVOTが内容を理解し、
            <br className="hidden sm:inline" />
            整理・作成・記録・分析まで一貫してサポートします。
          </p>
        </LandingReveal>

        <ul className="mt-14 grid grid-cols-1 gap-4 sm:mt-16 sm:grid-cols-2 sm:gap-5 lg:grid-cols-3 lg:gap-6">
          {LANDING_REQUEST_EXAMPLES.map((item, index) => (
            <LandingReveal key={item.id} delayMs={index * 50}>
              <li className="group flex h-full flex-col rounded-[26px] border border-[#74172A]/8 bg-white p-6 shadow-[0_16px_45px_rgba(70,20,31,0.05)] transition-all duration-300 hover:-translate-y-1 hover:border-[#B58B4F]/40 hover:shadow-[0_22px_60px_rgba(70,20,31,0.1)] sm:p-7">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <span
                      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-[#B58B4F]/20 bg-[#FFF8EB] text-2xl transition-transform duration-300 group-hover:scale-105"
                      aria-hidden
                    >
                      {item.icon}
                    </span>

                    <h3 className="text-lg font-semibold tracking-tight text-[#302125]">
                      {item.title}
                    </h3>
                  </div>

                  <span
                    className={cn(
                      "shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold",
                      statusClassName(item.status),
                    )}
                  >
                    {LANDING_EXAMPLE_STATUS_LABEL[item.status]}
                  </span>
                </div>

                <div className="mt-6">
                  <div className="rounded-[18px] border border-[#74172A]/8 bg-[#FAF7F6] px-4 py-4">
                    <p className="text-[11px] font-semibold tracking-[0.08em] text-[#8B7E81]">
                      資料をアップロード
                    </p>

                    <p className="mt-2 text-sm leading-7 text-[#3A292E]">
                      {item.input}
                    </p>
                  </div>

                  <div
                    className="flex justify-center py-2.5 text-sm font-semibold text-[#B58B4F]"
                    aria-hidden
                  >
                    ↓
                  </div>

                  <div className="rounded-[18px] border border-[#74172A]/10 bg-white px-4 py-4 shadow-[0_8px_24px_rgba(70,20,31,0.03)]">
                    <p className="text-[11px] font-semibold tracking-[0.08em] text-[#8B7E81]">
                      普段の言葉で依頼
                    </p>

                    <p className="mt-2 text-sm leading-7 text-[#3A292E]">
                      「{item.request}」
                    </p>
                  </div>

                  <div
                    className="flex justify-center py-2.5 text-sm font-semibold text-[#B58B4F]"
                    aria-hidden
                  >
                    ↓
                  </div>

                  <div className="rounded-[18px] border border-[#B58B4F]/20 bg-gradient-to-br from-[#FFF8EF] via-white to-[#FFF3DE] px-4 py-4">
                    <p className="text-[11px] font-semibold tracking-[0.08em] text-[#74172A]">
                      MINERVOTが実行
                    </p>

                    <p className="mt-2 text-sm leading-7 text-[#3A292E]">
                      {item.result}
                    </p>
                  </div>
                </div>
              </li>
            </LandingReveal>
          ))}
        </ul>
      </div>
    </section>
  );
}
