import Link from "next/link";

import { LegalFooterLinks } from "@/components/legal/legal-footer-links";
import { AtlasLandingAuth } from "@/components/layout/atlas-header-auth";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { Button } from "@/components/ui/button";
import {
  LANDING_CAPABILITIES,
  LANDING_PAIN_SOLUTIONS,
  formatLandingPrice,
  getLandingPlans,
} from "@/lib/landing/content";
import { cn } from "@/lib/design-system/cn";

import { LandingAudienceSection } from "./landing-audience-section";
import { LandingAiTeamCards } from "./landing-ai-team-cards";
import { LandingCtaSection } from "./landing-cta-section";
import { LandingHeroSection } from "./landing-hero-section";
import { LandingLearningSection } from "./landing-learning-section";
import { LandingReasonsSection } from "./landing-reasons-section";
import { LandingRequestExamplesSection } from "./landing-request-examples-section";
import { LandingResultsDashboard } from "./landing-results-dashboard";
import { LandingReveal } from "./landing-reveal";
import { LandingTrustSection } from "./landing-trust-section";
import { LandingWorkflowExperience } from "./landing-workflow-experience";

function MinervotLogo() {
  return (
    <span className="flex items-center gap-3">
      <span className="relative flex h-9 w-9 items-center justify-center overflow-hidden rounded-xl border border-[#b58b4f]/25 bg-[#74172a] shadow-[0_10px_28px_rgba(116,23,42,0.2)]">
        <span
          aria-hidden="true"
          className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(255,255,255,0.24),transparent_48%)]"
        />
        <span className="relative text-xs font-semibold tracking-[-0.05em] text-white">
          M
        </span>
      </span>

      <span>
        <span className="block text-sm font-semibold tracking-[0.08em] text-[#74172a] dark:text-[#efc6cf]">
          MINERVOT
        </span>
        <span className="block text-[9px] font-medium uppercase tracking-[0.18em] text-[#9a8d90]">
          Personal AI Secretary
        </span>
      </span>
    </span>
  );
}

function LandingHeader() {
  return (
    <header className="sticky top-0 z-50 border-b border-[#74172a]/8 bg-[#fffdfb]/85 backdrop-blur-2xl dark:border-white/10 dark:bg-[#0c0809]/85">
      <div className="mx-auto flex max-w-[1240px] items-center justify-between px-4 py-3 sm:px-8">
        <Link
          href="/"
          className="rounded-xl outline-none transition-opacity hover:opacity-80 focus-visible:ring-2 focus-visible:ring-[#74172a]/30"
        >
          <MinervotLogo />
        </Link>

        <nav className="hidden items-center gap-7 md:flex">
          <a
            href="#capabilities"
            className="text-xs font-medium text-[#6f6265] transition-colors hover:text-[#74172a] dark:text-[#b9adb0] dark:hover:text-white"
          >
            できること
          </a>

          <a
            href="#workflow"
            className="text-xs font-medium text-[#6f6265] transition-colors hover:text-[#74172a] dark:text-[#b9adb0] dark:hover:text-white"
          >
            仕組み
          </a>

          <a
            href="#pricing"
            className="text-xs font-medium text-[#6f6265] transition-colors hover:text-[#74172a] dark:text-[#b9adb0] dark:hover:text-white"
          >
            料金
          </a>

          <span className="h-5 w-px bg-[#74172a]/10 dark:bg-white/10" />

          <ThemeToggle />
          <AtlasLandingAuth />
        </nav>

        <div className="flex items-center gap-2 md:hidden">
          <ThemeToggle />
          <AtlasLandingAuth />
        </div>
      </div>
    </header>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="inline-flex items-center gap-3">
      <span className="h-px w-7 bg-[#b58b4f]" />
      <span className="text-[10px] font-semibold uppercase tracking-[0.25em] text-[#91703d] dark:text-[#d7b477]">
        {children}
      </span>
    </div>
  );
}

function CapabilitiesSection() {
  return (
    <section
      id="capabilities"
      className="relative overflow-hidden border-t border-[#74172a]/8 bg-white px-4 py-20 sm:px-8 sm:py-28 lg:py-32 dark:border-white/10 dark:bg-[#0c0809]"
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute left-1/2 top-0 h-96 w-[800px] -translate-x-1/2 bg-[radial-gradient(circle,rgba(116,23,42,0.07),transparent_68%)] blur-3xl"
      />

      <div className="relative mx-auto max-w-[1240px]">
        <LandingReveal className="mx-auto max-w-3xl text-center">
          <SectionLabel>Capabilities</SectionLabel>

          <h2 className="mt-6 text-3xl font-semibold tracking-[-0.045em] text-[#26191c] sm:text-4xl lg:text-5xl dark:text-white">
            あなたの仕事を、
            <br />
            MINERVOTが引き受けます。
          </h2>

          <p className="mx-auto mt-6 max-w-2xl text-sm leading-7 text-[#75686b] sm:text-base sm:leading-8 dark:text-[#b9adb0]">
            単に質問へ答えるだけではありません。
            <br className="hidden sm:block" />
            仕事を覚え、実行し、結果を分析して、次の改善まで提案します。
          </p>
        </LandingReveal>

        <ul className="mt-14 grid grid-cols-1 gap-4 sm:mt-16 sm:grid-cols-2 lg:grid-cols-3 lg:gap-5">
          {LANDING_CAPABILITIES.map((item, index) => (
            <LandingReveal key={item.id} delayMs={index * 60}>
              <li className="group relative h-full overflow-hidden rounded-[24px] border border-[#74172a]/8 bg-[#fffdfb] p-6 shadow-[0_18px_55px_rgba(70,20,31,0.05)] transition-all duration-300 hover:-translate-y-1 hover:border-[#b58b4f]/30 hover:shadow-[0_25px_70px_rgba(70,20,31,0.1)] sm:p-7 dark:border-white/10 dark:bg-white/[0.035]">
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute right-[-40px] top-[-40px] h-28 w-28 rounded-full bg-[#74172a]/5 blur-2xl transition-transform duration-500 group-hover:scale-150"
                />

                <div className="relative">
                  <span className="flex h-12 w-12 items-center justify-center rounded-2xl border border-[#b58b4f]/20 bg-white text-2xl shadow-sm dark:border-white/10 dark:bg-white/[0.05]">
                    {item.icon}
                  </span>

                  <h3 className="mt-6 text-lg font-semibold tracking-[-0.025em] text-[#302125] dark:text-white">
                    {item.title}
                  </h3>

                  <p className="mt-3 text-sm leading-7 text-[#76696c] dark:text-[#b9adb0]">
                    {item.description}
                  </p>

                  <div className="mt-6 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-[#9a7137] opacity-70 transition-opacity group-hover:opacity-100">
                    MINERVOT executes
                    <span className="transition-transform duration-300 group-hover:translate-x-1">
                      →
                    </span>
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

function PainSolutionsSection() {
  return (
    <section className="relative overflow-hidden border-t border-[#74172a]/8 bg-[#faf6f5] px-4 py-20 sm:px-8 sm:py-28 dark:border-white/10 dark:bg-[#100a0c]">
      <div className="mx-auto max-w-[1100px]">
        <LandingReveal className="mx-auto max-w-3xl text-center">
          <SectionLabel>Problem solving</SectionLabel>

          <h2 className="mt-6 text-3xl font-semibold tracking-[-0.04em] text-[#26191c] sm:text-4xl dark:text-white">
            面倒な仕事を、抱え続けない。
          </h2>

          <p className="mt-5 text-sm leading-7 text-[#75686b] sm:text-base dark:text-[#b9adb0]">
            いつもの悩みを、専属AI秘書が実行可能な仕事へ変えます。
          </p>
        </LandingReveal>

        <ul className="mt-12 space-y-4">
          {LANDING_PAIN_SOLUTIONS.map((item, index) => (
            <LandingReveal key={item.pain} delayMs={index * 70}>
              <li className="grid overflow-hidden rounded-[24px] border border-[#74172a]/8 bg-white shadow-[0_16px_50px_rgba(70,20,31,0.05)] sm:grid-cols-[0.9fr_1.1fr] dark:border-white/10 dark:bg-white/[0.035]">
                <div className="p-6 sm:p-8">
                  <p className="text-[9px] font-semibold uppercase tracking-[0.2em] text-[#a39498]">
                    Before
                  </p>
                  <p className="mt-3 text-sm font-medium leading-7 text-[#49373c] sm:text-base dark:text-white">
                    {item.pain}
                  </p>
                </div>

                <div className="border-t border-[#b58b4f]/15 bg-[linear-gradient(135deg,#fff9ef,#fffdfb)] p-6 sm:border-l sm:border-t-0 sm:p-8 dark:bg-[linear-gradient(135deg,rgba(181,139,79,0.08),rgba(255,255,255,0.025))]">
                  <p className="text-[9px] font-semibold uppercase tracking-[0.2em] text-[#9a7137] dark:text-[#d7b477]">
                    With MINERVOT
                  </p>
                  <p className="mt-3 text-sm leading-7 text-[#49373c] sm:text-base dark:text-[#e4dadd]">
                    {item.solution}
                  </p>
                </div>
              </li>
            </LandingReveal>
          ))}
        </ul>
      </div>
    </section>
  );
}

function PricingSection() {
  const plans = getLandingPlans();

  return (
    <section
      id="pricing"
      className="relative overflow-hidden border-t border-[#74172a]/8 bg-white px-4 py-20 sm:px-8 sm:py-28 dark:border-white/10 dark:bg-[#0c0809]"
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute left-1/2 top-20 h-80 w-[700px] -translate-x-1/2 bg-[radial-gradient(circle,rgba(181,139,79,0.1),transparent_70%)] blur-3xl"
      />

      <div className="relative mx-auto max-w-[1240px]">
        <LandingReveal className="mx-auto max-w-3xl text-center">
          <SectionLabel>Pricing</SectionLabel>

          <h2 className="mt-6 text-3xl font-semibold tracking-[-0.04em] text-[#26191c] sm:text-4xl dark:text-white">
            あなたに合ったAI秘書を。
          </h2>

          <p className="mt-5 text-sm leading-7 text-[#75686b] sm:text-base dark:text-[#b9adb0]">
            無料から始めて、仕事量に合わせてアップグレードできます。
          </p>
        </LandingReveal>

        <ul className="mt-12 grid gap-5 md:grid-cols-2 xl:grid-cols-4">
          {plans.map((plan, index) => {
            const isPopular = plan.planId === "standard";

            return (
              <LandingReveal key={plan.planId} delayMs={index * 60}>
                <li
                  className={cn(
                    "relative flex h-full flex-col overflow-hidden rounded-[24px] border p-6 transition-all duration-300 hover:-translate-y-1 sm:p-7",
                    isPopular
                      ? "border-[#74172a] bg-[linear-gradient(160deg,#801b30,#56101f)] text-white shadow-[0_28px_70px_rgba(116,23,42,0.25)]"
                      : "border-[#74172a]/8 bg-[#fffdfb] shadow-[0_16px_50px_rgba(70,20,31,0.05)] hover:border-[#b58b4f]/30 hover:shadow-[0_22px_65px_rgba(70,20,31,0.1)] dark:border-white/10 dark:bg-white/[0.035]",
                  )}
                >
                  {isPopular && (
                    <div
                      aria-hidden="true"
                      className="pointer-events-none absolute right-[-40px] top-[-50px] h-40 w-40 rounded-full bg-[#d5ad70]/20 blur-3xl"
                    />
                  )}

                  <div className="relative flex items-center justify-between gap-3">
                    <h3
                      className={cn(
                        "text-lg font-semibold",
                        isPopular
                          ? "text-white"
                          : "text-[#34252a] dark:text-white",
                      )}
                    >
                      {plan.name}
                    </h3>

                    {isPopular && (
                      <span className="rounded-full border border-white/20 bg-white/10 px-2.5 py-1 text-[9px] font-semibold uppercase tracking-[0.12em] text-white">
                        Popular
                      </span>
                    )}
                  </div>

                  <p
                    className={cn(
                      "relative mt-5 text-3xl font-semibold tracking-[-0.04em]",
                      isPopular
                        ? "text-white"
                        : "text-[#74172a] dark:text-[#efc6cf]",
                    )}
                  >
                    {formatLandingPrice(plan.monthlyPriceJpy)}
                    {plan.monthlyPriceJpy > 0 && (
                      <span
                        className={cn(
                          "ml-1 text-xs font-normal",
                          isPopular
                            ? "text-white/60"
                            : "text-[#8b7e81]",
                        )}
                      >
                        / 月
                      </span>
                    )}
                  </p>

                  <p
                    className={cn(
                      "relative mt-3 min-h-12 text-sm leading-6",
                      isPopular
                        ? "text-white/70"
                        : "text-[#786b6e] dark:text-[#b9adb0]",
                    )}
                  >
                    {plan.description}
                  </p>

                  <div
                    className={cn(
                      "relative my-5 h-px",
                      isPopular ? "bg-white/15" : "bg-[#74172a]/8",
                    )}
                  />

                  <ul className="relative flex-1 space-y-3">
                    {plan.highlights.map((highlight) => (
                      <li
                        key={highlight}
                        className={cn(
                          "flex items-start gap-2 text-xs leading-5",
                          isPopular
                            ? "text-white/78"
                            : "text-[#716468] dark:text-[#c1b5b8]",
                        )}
                      >
                        <span
                          className={cn(
                            "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[8px]",
                            isPopular
                              ? "bg-white/15 text-white"
                              : "bg-[#fff4df] text-[#9a7137] dark:bg-[#b58b4f]/10",
                          )}
                        >
                          ✓
                        </span>
                        {highlight}
                      </li>
                    ))}
                  </ul>

                  <Link href="/sign-up" className="relative mt-7 block">
                    <Button
                      size="sm"
                      className={cn(
                        "min-h-11 w-full rounded-full text-xs font-semibold transition-all duration-300",
                        isPopular
                          ? "bg-white text-[#74172a] hover:-translate-y-0.5 hover:bg-[#fff7f8]"
                          : "border border-[#74172a]/15 bg-[#74172a] text-white hover:-translate-y-0.5 hover:bg-[#5d1020]",
                      )}
                    >
                      {plan.planId === "free"
                        ? "無料で始める"
                        : "このプランで始める"}
                    </Button>
                  </Link>
                </li>
              </LandingReveal>
            );
          })}
        </ul>

        <LandingReveal className="mt-8 text-center" delayMs={200}>
          <p className="text-xs text-[#8b7e81] dark:text-[#a99ca0]">
            契約中のプランと請求情報は、ログイン後の
            <Link
              href="/settings/billing"
              className="mx-1 font-medium text-[#74172a] hover:underline dark:text-[#efc6cf]"
            >
              プラン・請求
            </Link>
            から確認できます。
          </p>
        </LandingReveal>
      </div>
    </section>
  );
}

function LandingFooter() {
  return (
    <footer className="border-t border-[#74172a]/8 bg-[#fffdfb] px-4 py-10 dark:border-white/10 dark:bg-[#0c0809] sm:px-8">
      <div className="mx-auto flex max-w-[1240px] flex-col items-center justify-between gap-6 sm:flex-row">
        <Link href="/" className="transition-opacity hover:opacity-80">
          <MinervotLogo />
        </Link>

        <LegalFooterLinks variant="light" />

        <p className="text-[10px] text-[#918589] dark:text-[#a99ca0]">
          © {new Date().getFullYear()} MINERVOT. All rights reserved.
        </p>
      </div>
    </footer>
  );
}

export function LandingPage() {
  return (
    <div className="min-h-screen bg-[#fffdfb] text-[#281a1e] selection:bg-[#74172a] selection:text-white dark:bg-[#0c0809] dark:text-white">
      <LandingHeader />

      <main>
        <LandingHeroSection />
        <LandingAudienceSection />
        <CapabilitiesSection />
        <LandingWorkflowExperience />
        <LandingLearningSection />
        <LandingRequestExamplesSection />
        <LandingTrustSection />
        <LandingReasonsSection />
        <PainSolutionsSection />
        <LandingAiTeamCards />
        <LandingResultsDashboard />
        <PricingSection />
        <LandingCtaSection />
      </main>

      <LandingFooter />
    </div>
  );
}
