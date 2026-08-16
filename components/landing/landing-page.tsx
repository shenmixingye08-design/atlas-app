import Link from "next/link";

import { LegalFooterLinks } from "@/components/legal/legal-footer-links";
import { AtlasLandingAuth } from "@/components/layout/atlas-header-auth";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { Button } from "@/components/ui/button";
import {
  formatLandingPrice,
  getLandingPlans,
} from "@/lib/landing/content";
import { cn } from "@/lib/design-system/cn";

import { LandingCtaSection } from "./landing-cta-section";
import { LandingDailyHabit } from "./landing-daily-habit";
import { LandingFinishStory } from "./landing-finish-story";
import { LandingFirstPath } from "./landing-first-path";
import { LandingFutureSection } from "./landing-future-section";
import { LandingHeroSection } from "./landing-hero-section";
import { LandingObjectionKillers } from "./landing-objection-killers";
import { LandingPriceValue } from "./landing-price-value";
import { LandingProofSection } from "./landing-proof-section";

function MinervotLogo() {
  return (
    <span className="flex min-w-0 items-center gap-2 sm:gap-3">
      <span className="relative flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-[#B58B4F]/25 bg-[#74172A]">
        <span className="relative text-xs font-semibold tracking-[-0.05em] text-white">
          M
        </span>
      </span>
      <span className="min-w-0">
        <span className="block truncate text-sm font-semibold tracking-[0.08em] text-[#74172A]">
          MINERVOT
        </span>
        <span className="hidden text-[9px] font-medium tracking-[0.08em] text-[#9A8D90] sm:block">
          あなた専属のAI秘書
        </span>
      </span>
    </span>
  );
}

function LandingHeader() {
  return (
    <header className="sticky top-0 z-50 border-b border-[#74172A]/8 bg-[#fffdfb]/85 backdrop-blur-2xl">
      <div className="mx-auto flex max-w-[1240px] items-center justify-between gap-2 overflow-x-clip px-4 py-3 sm:gap-3 sm:px-8">
        <Link
          href="/"
          className="min-w-0 rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-[#74172A]/30"
        >
          <MinervotLogo />
        </Link>

        <nav className="hidden items-center gap-7 md:flex" aria-label="紹介">
          <a href="#finish-story" className="text-xs font-medium text-[#6F6265] hover:text-[#74172A]">
            終わる瞬間
          </a>
          <a href="#proof" className="text-xs font-medium text-[#6F6265] hover:text-[#74172A]">
            見本
          </a>
          <a href="#price-value" className="text-xs font-medium text-[#6F6265] hover:text-[#74172A]">
            980円
          </a>
          <a href="#pricing" className="text-xs font-medium text-[#6F6265] hover:text-[#74172A]">
            料金
          </a>
        </nav>

        <div className="flex shrink-0 items-center gap-1 sm:gap-2">
          <ThemeToggle />
          <AtlasLandingAuth />
        </div>
      </div>
    </header>
  );
}

function PricingSection() {
  const plans = getLandingPlans();

  return (
    <section
      id="pricing"
      className="relative overflow-hidden border-t border-[#74172A]/8 bg-white px-4 py-20 sm:px-8 sm:py-28"
    >
      <div className="relative mx-auto max-w-[1240px]">
        <div className="mx-auto max-w-3xl text-center">
          <h2 className="text-3xl font-semibold tracking-[-0.04em] text-[#26191C] sm:text-4xl">
            合えば、月980円。
          </h2>
          <p className="mt-5 text-sm leading-7 text-[#75686B] sm:text-base">
            無料で1件完成させて判断。X投稿・メール・資料づくりを日常的に任せるなら Light。
            価格の比較は
            <a href="#price-value" className="mx-1 text-[#74172A] underline-offset-2 hover:underline">
              こちら
            </a>
            。
          </p>
        </div>

        <ul className="mt-12 grid gap-5 overflow-x-clip md:grid-cols-2 xl:grid-cols-4">
          {plans.map((plan) => {
            const isRecommended = plan.planId === "light";

            return (
              <li
                key={plan.planId}
                className={cn(
                  "relative flex h-full flex-col overflow-hidden rounded-[24px] border p-6 sm:p-7",
                  isRecommended
                    ? "border-2 border-[#B58B4F] bg-[#FFFDFB]"
                    : "border-[#74172A]/10 bg-white",
                )}
              >
                <div className="relative flex items-center justify-between gap-3">
                  <h3
                    className={cn(
                      "text-lg font-semibold",
                      isRecommended ? "text-[#74172A]" : "text-[#34252A]",
                    )}
                  >
                    {plan.name}
                  </h3>
                  {isRecommended && (
                    <span className="rounded-full bg-[#74172A] px-3 py-1 text-[10px] font-semibold tracking-[0.12em] text-white">
                      元が取りやすい
                    </span>
                  )}
                </div>

                <p
                  className={cn(
                    "relative mt-5 text-3xl font-semibold tracking-[-0.04em]",
                    isRecommended ? "text-[#74172A]" : "text-[#34252A]",
                  )}
                >
                  {formatLandingPrice(plan.monthlyPriceJpy)}
                  {plan.monthlyPriceJpy > 0 && (
                    <span
                      className={cn(
                        "ml-1 text-base font-medium",
                        isRecommended ? "text-[#74172A]" : "text-[#8B7E81]",
                      )}
                    >
                      ／月
                    </span>
                  )}
                </p>

                <p
                  className={cn(
                    "relative mt-3 min-h-12 text-sm leading-6",
                    isRecommended ? "text-[#74172A]" : "text-[#786B6E]",
                  )}
                >
                  {plan.planId === "free"
                    ? "無料で1件完成まで体験。クレジットカード不要。"
                    : plan.description}
                </p>

                <div
                  className={cn(
                    "relative my-5 h-px",
                    isRecommended ? "bg-[#E8D8B5]" : "bg-[#74172A]/10",
                  )}
                />

                <ul className="relative flex-1 space-y-3">
                  {plan.highlights.map((highlight) => (
                    <li
                      key={highlight}
                      className={cn(
                        "flex items-start gap-2 text-xs leading-5",
                        isRecommended ? "text-[#5B1A26]" : "text-[#716468]",
                      )}
                    >
                      <span
                        className={cn(
                          "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[8px]",
                          isRecommended
                            ? "bg-[#74172A] text-white"
                            : "bg-[#FFF4DF] text-[#9A7137]",
                        )}
                      >
                        ✓
                      </span>
                      <span>{highlight}</span>
                    </li>
                  ))}
                  {plan.notes?.map((note) => (
                    <li
                      key={note}
                      className={cn(
                        "text-[11px] leading-5",
                        isRecommended ? "text-[#8A6A4A]" : "text-[#918589]",
                      )}
                    >
                      {note}
                    </li>
                  ))}
                </ul>

                <Link href="/sign-up" className="relative mt-7 block">
                  <Button
                    size="sm"
                    className="min-h-11 w-full rounded-full bg-[#74172A] text-xs font-semibold text-white hover:bg-[#5D1020]"
                  >
                    {plan.planId === "free"
                      ? "今すぐ1件終わらせる"
                      : plan.planId === "light"
                        ? "月980円で毎日任せる"
                        : "このプランで始める"}
                  </Button>
                </Link>
              </li>
            );
          })}
        </ul>

        <p className="mt-8 text-center text-xs text-[#8B7E81]">
          解約はいつでも設定から。まずは1件完成させて「元が取れるか」を体で確認してください。
        </p>
      </div>
    </section>
  );
}

function LandingFooter() {
  return (
    <footer className="border-t border-[#74172A]/8 bg-[#FFFDFB] px-4 py-10 sm:px-8">
      <div className="mx-auto flex max-w-[1240px] flex-col items-center justify-between gap-6 sm:flex-row">
        <Link href="/">
          <MinervotLogo />
        </Link>
        <LegalFooterLinks variant="light" />
        <p className="text-[10px] text-[#918589]">
          © {new Date().getFullYear()} MINERVOT. All rights reserved.
        </p>
      </div>
    </footer>
  );
}

/**
 * Pay-decision landing order:
 * hero → finish story → future → daily → objections → proof → price value → path → pricing → CTA
 */
export function LandingPage() {
  return (
    <div className="min-h-screen overflow-x-clip bg-[#FFFDFB] text-[#281A1E] selection:bg-[#74172A] selection:text-white">
      <LandingHeader />
      <main>
        <LandingHeroSection />
        <LandingFinishStory />
        <LandingFutureSection />
        <LandingDailyHabit />
        <LandingObjectionKillers />
        <LandingProofSection />
        <LandingPriceValue />
        <LandingFirstPath />
        <PricingSection />
        <LandingCtaSection />
      </main>
      <LandingFooter />
    </div>
  );
}
