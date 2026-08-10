import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { getHealthVersionPayload } from "@/lib/health/version-info";
import { MINERVOT_DEFAULT_DESCRIPTION } from "@/lib/seo/site";
import { ui } from "@/lib/i18n";
import { LANDING_CTA_TRUST } from "@/lib/landing/demo-data";

import {
  SPEED_CLAIM_SCAN_RELATIVE_PATHS,
  assertTextHasNoUnprovenSpeedClaims,
  findUnprovenSpeedClaims,
} from "./unproven-speed-claims";

export type UnprovenSpeedClaimsProbeResult = {
  ok: boolean;
  metadataHonest: boolean;
  onboardingCopyHonest: boolean;
  landingSurfacesHonest: boolean;
  pricingHonest: boolean;
  postLoginUiHonest: boolean;
  identifierHonest: boolean;
  failClosed: boolean;
  error: string | null;
  commitShaShort: string;
  environment: string;
};

function readWorkspaceFile(rel: string): string | null {
  const full = join(process.cwd(), rel);
  if (!existsSync(full)) return null;
  return readFileSync(full, "utf8");
}

function surfaceHasHits(rel: string): boolean {
  const src = readWorkspaceFile(rel);
  if (src == null) return true;
  return findUnprovenSpeedClaims(src).length > 0;
}

export function probeUnprovenSpeedClaims(): UnprovenSpeedClaimsProbeResult {
  const version = getHealthVersionPayload();
  const errors: string[] = [];

  const metadataCheck = assertTextHasNoUnprovenSpeedClaims(
    "MINERVOT_DEFAULT_DESCRIPTION",
    MINERVOT_DEFAULT_DESCRIPTION,
  );
  if (!metadataCheck.ok) errors.push(...metadataCheck.errors);

  const onboardingBundle = [
    ui.onboarding.clarityHeadline,
    ui.onboarding.clarityBody,
    ui.firstExperience.introTitle,
    ui.firstExperience.introSubtitle,
    ui.firstExperience.cardHint,
    ui.firstExperience.firstWinMessage,
    ui.firstExperience.completeTitle,
  ].join("\n");
  const onboardingCheck = assertTextHasNoUnprovenSpeedClaims(
    "onboarding/firstExperience",
    onboardingBundle,
  );
  if (!onboardingCheck.ok) errors.push(...onboardingCheck.errors);

  const trustCheck = assertTextHasNoUnprovenSpeedClaims(
    "LANDING_CTA_TRUST",
    LANDING_CTA_TRUST.join("\n"),
  );
  if (!trustCheck.ok) errors.push(...trustCheck.errors);

  for (const rel of SPEED_CLAIM_SCAN_RELATIVE_PATHS) {
    const src = readWorkspaceFile(rel);
    if (src == null) {
      errors.push(`${rel}: missing`);
      continue;
    }
    for (const hit of findUnprovenSpeedClaims(src)) {
      errors.push(`${rel}: ${hit.pattern} near "${hit.excerpt}"`);
    }
  }

  const i18nSrc = readWorkspaceFile("lib/i18n/ja.ts") ?? "";
  const identifierHonest = !i18nSrc.includes("sixtySecondWin");
  if (!identifierHonest) {
    errors.push("lib/i18n/ja.ts: sixtySecondWin identifier must be removed");
  }

  const metadataHonest = metadataCheck.ok;
  const onboardingCopyHonest = onboardingCheck.ok && trustCheck.ok;
  const landingSurfacesHonest = ![
    "components/landing/landing-hero-section.tsx",
    "components/landing/landing-cta-section.tsx",
    "components/landing/landing-page.tsx",
    "app/sign-up/[[...sign-up]]/page.tsx",
    "app/page.tsx",
    "lib/seo/site.ts",
  ].some(surfaceHasHits);
  const pricingHonest = ![
    "app/pricing/page.tsx",
    "components/landing/landing-page.tsx",
  ].some(surfaceHasHits);
  const postLoginUiHonest =
    onboardingCopyHonest &&
    !surfaceHasHits("components/onboarding/first-success-experience.tsx") &&
    !surfaceHasHits("lib/i18n/ja.ts");

  const ok = errors.length === 0;

  return {
    ok,
    metadataHonest,
    onboardingCopyHonest,
    landingSurfacesHonest,
    pricingHonest,
    postLoginUiHonest,
    identifierHonest,
    failClosed: true,
    error: ok ? null : errors.slice(0, 12).join(" | "),
    commitShaShort: version.commitShaShort,
    environment: version.environment,
  };
}
