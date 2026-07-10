import Link from "next/link";

import { LegalFooterLinks } from "@/components/legal/legal-footer-links";
import { AtlasLandingAuth } from "@/components/layout/atlas-header-auth";
import { Button } from "@/components/ui/button";
import {
  LANDING_CAPABILITIES,
  LANDING_PAIN_SOLUTIONS,
  formatLandingPrice,
  getLandingPlans,
} from "@/lib/landing/content";
import { ui } from "@/lib/i18n";
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

function LandingHeader() {
  return (
    <header className="sticky top-0 z-50 border-b border-[var(--border-subtle)] bg-white/80 backdrop-blur-xl">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 sm:px-8 sm:py-4">
        <Link href="/" className="focus-ring rounded-md">
          <span className="block text-sm font-semibold tracking-tight text-foreground">
            {ui.brand}
          </span>
          <span className="block text-[10px] text-[var(--foreground-muted)]">
            {ui.brandTagline}
          </span>
        </Link>
        <nav className="hidden items-center gap-8 md:flex">
          <Link href="/capabilities" className="text-sm text-[var(--foreground-muted)] transition-colors hover:text-foreground">
            できること
          </Link>
          <a href="#workflow" className="text-sm text-[var(--foreground-muted)] transition-colors hover:text-foreground">
            仕組み
          </a>
          <Link href="/pricing" className="text-sm text-[var(--foreground-muted)] transition-colors hover:text-foreground">
            料金
          </Link>
          <AtlasLandingAuth />
        </nav>
        <div className="md:hidden">
          <AtlasLandingAuth />
        </div>
      </div>
    </header>
  );
}

function CapabilitiesSection() {
  return (
    <section id="capabilities" className="border-t border-[var(--border-subtle)] bg-white px-4 py-20 sm:px-8 sm:py-28 lg:py-32">
      <div className="mx-auto max-w-6xl">
        <LandingReveal className="mx-auto max-w-2xl text-center">
          <h2 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
            ATLASができること
          </h2>
          <p className="mt-6 text-base leading-relaxed text-[var(--foreground-muted)] sm:mt-8 sm:text-lg sm:leading-relaxed">
            仕事を覚え、
            <br />
            繰り返し作業を減らし、
            <br />
            あなたの時間を生み出します。
          </p>
        </LandingReveal>
        <ul className="mt-14 grid grid-cols-1 gap-4 sm:mt-16 sm:gap-5 lg:grid-cols-3 lg:gap-6">
          {LANDING_CAPABILITIES.map((item, index) => (
            <LandingReveal key={item.id} delayMs={index * 60}>
              <li className="h-full rounded-[var(--radius-2xl)] border border-[var(--border-subtle)] bg-white p-6 shadow-[var(--shadow-sm)] transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[var(--shadow-md)] sm:p-8">
                <span className="text-3xl" aria-hidden>
                  {item.icon}
                </span>
                <h3 className="mt-4 text-lg font-semibold tracking-tight text-foreground">
                  {item.title}
                </h3>
                <p className="mt-3 text-sm leading-relaxed text-[var(--foreground-muted)]">
                  {item.description}
                </p>
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
    <section className="border-t border-[var(--border-subtle)] bg-[var(--background-subtle)]/50 px-4 py-20 sm:px-8 sm:py-28">
      <div className="mx-auto max-w-6xl">
        <LandingReveal className="mx-auto max-w-2xl text-center">
          <h2 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
            よくある悩みを、ATLASが解決
          </h2>
        </LandingReveal>
        <ul className="mt-12 space-y-4">
          {LANDING_PAIN_SOLUTIONS.map((item, index) => (
            <LandingReveal key={item.pain} delayMs={index * 80}>
              <li className="grid gap-4 rounded-[var(--radius-2xl)] border border-[var(--border-subtle)] bg-white p-6 shadow-[var(--shadow-sm)] sm:grid-cols-2 sm:items-center sm:gap-8 sm:p-8">
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-[var(--foreground-subtle)]">
                    悩み
                  </p>
                  <p className="mt-2 text-base font-medium text-foreground">{item.pain}</p>
                </div>
                <div className="rounded-[var(--radius-xl)] bg-[var(--accent-muted)] px-5 py-4">
                  <p className="text-xs font-medium uppercase tracking-wide text-accent">解決</p>
                  <p className="mt-2 text-sm leading-relaxed text-foreground">{item.solution}</p>
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
    <section id="pricing" className="px-4 py-20 sm:px-8 sm:py-28">
      <div className="mx-auto max-w-6xl">
        <LandingReveal className="mx-auto max-w-2xl text-center">
          <h2 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
            料金プラン
          </h2>
          <p className="mt-4 text-base text-[var(--foreground-muted)]">
            無料から始められます。仕事の量に合わせてプランを選べます。
          </p>
        </LandingReveal>
        <ul className="mt-12 grid gap-5 md:grid-cols-2 xl:grid-cols-4">
          {plans.map((plan, index) => (
            <LandingReveal key={plan.planId} delayMs={index * 60}>
              <li
                className={cn(
                  "flex h-full flex-col rounded-[var(--radius-2xl)] border p-6 shadow-[var(--shadow-sm)] transition-shadow hover:shadow-[var(--shadow-md)] sm:p-8",
                  plan.planId === "standard"
                    ? "border-accent bg-[var(--accent-muted)]/40 ring-1 ring-accent/20"
                    : "border-[var(--border-subtle)] bg-white",
                )}
              >
                <div className="flex items-baseline justify-between gap-2">
                  <h3 className="text-lg font-semibold text-foreground">{plan.name}</h3>
                  {plan.planId === "standard" && (
                    <span className="rounded-full bg-accent px-2 py-0.5 text-[10px] font-medium text-white">
                      人気
                    </span>
                  )}
                </div>
                <p className="mt-3 text-2xl font-semibold text-foreground">
                  {formatLandingPrice(plan.monthlyPriceJpy)}
                  {plan.monthlyPriceJpy > 0 && (
                    <span className="text-sm font-normal text-[var(--foreground-muted)]"> / 月</span>
                  )}
                </p>
                <p className="mt-2 text-sm text-[var(--foreground-muted)]">{plan.description}</p>
                <ul className="mt-5 flex-1 space-y-2">
                  {plan.highlights.map((highlight) => (
                    <li key={highlight} className="text-sm text-[var(--foreground-muted)]">
                      · {highlight}
                    </li>
                  ))}
                </ul>
                <Link href="/sign-up" className="mt-6 block">
                  <Button
                    variant={plan.planId === "free" ? "primary" : "secondary"}
                    size="sm"
                    className="w-full"
                  >
                    {plan.planId === "free" ? "無料で始める" : "このプランで始める"}
                  </Button>
                </Link>
              </li>
            </LandingReveal>
          ))}
        </ul>
        <LandingReveal className="mt-8 text-center" delayMs={200}>
          <p className="text-sm text-[var(--foreground-muted)]">
            詳細・請求管理は
            <Link href="/settings/billing" className="text-accent hover:underline">
              プラン・請求
            </Link>
            から確認できます（要ログイン）。
          </p>
        </LandingReveal>
      </div>
    </section>
  );
}

function LandingFooter() {
  return (
    <footer className="border-t border-[var(--border-subtle)] px-4 py-10 sm:px-8">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 sm:flex-row">
        <div>
          <p className="text-sm font-semibold text-foreground">{ui.brand}</p>
          <p className="text-xs text-[var(--foreground-muted)]">{ui.brandTagline}</p>
        </div>
        <LegalFooterLinks variant="light" />
        <p className="text-xs text-[var(--foreground-muted)]">
          © {new Date().getFullYear()} ATLAS. All rights reserved.
        </p>
      </div>
    </footer>
  );
}

export function LandingPage() {
  return (
    <div className="min-h-screen bg-white text-foreground">
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
