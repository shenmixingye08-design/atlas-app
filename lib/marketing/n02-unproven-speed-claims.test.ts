import { describe, expect, it } from "vitest";

import { MINERVOT_DEFAULT_DESCRIPTION } from "@/lib/seo/site";
import { ui } from "@/lib/i18n";
import { LANDING_CTA_TRUST } from "@/lib/landing/demo-data";
import { FORBIDDEN_MEDIA_GENERATION_CLAIM_PATTERNS } from "@/lib/billing/plans/offered-capabilities";
import { QUICK_REQUEST_PRESETS } from "@/lib/workspace/quick-request-presets";
import { LANDING_REQUEST_EXAMPLES } from "@/lib/landing/content";
import { getPlanDefinition } from "@/lib/billing/plans/registry";

import {
  FORBIDDEN_UNPROVEN_SPEED_CLAIM_PATTERNS,
  SPEED_CLAIM_SCAN_RELATIVE_PATHS,
  assertTextHasNoUnprovenSpeedClaims,
  findUnprovenSpeedClaims,
} from "./unproven-speed-claims";
import { probeUnprovenSpeedClaims } from "./unproven-speed-claims-probe";

describe("N-02 unproven speed claim honesty", () => {
  it("flags classic 60-second completion guarantees", () => {
    const samples = [
      "登録後60秒以内に1件完成を目指せます",
      "60秒以内に1件終わる流れ",
      "60 seconds to first deliverable",
      "one minute to finish one job",
      "業界最速で完成",
      "瞬時に完成します",
      "数秒で1件完成",
      "必ず3分以内に終わります",
      "数分で開始",
      "sixtySecondWin",
    ];
    for (const sample of samples) {
      expect(findUnprovenSpeedClaims(sample).length).toBeGreaterThan(0);
    }
  });

  it("does not flag measured duration labels or status sync copy", () => {
    expect(findUnprovenSpeedClaims("完了時間: 42秒")).toHaveLength(0);
    expect(
      findUnprovenSpeedClaims(
        "サービス状態の変更は /status に約15秒以内に反映されます。",
      ),
    ).toHaveLength(0);
    expect(findUnprovenSpeedClaims("今すぐ1件終わらせる")).toHaveLength(0);
    expect(
      findUnprovenSpeedClaims("依頼した仕事を進め、完成したらお知らせします。"),
    ).toHaveLength(0);
  });

  it("keeps SEO / onboarding / landing trust free of unproven SLAs", () => {
    expect(
      assertTextHasNoUnprovenSpeedClaims(
        "description",
        MINERVOT_DEFAULT_DESCRIPTION,
      ).ok,
    ).toBe(true);
    expect(
      assertTextHasNoUnprovenSpeedClaims(
        "clarity",
        ui.onboarding.clarityHeadline,
      ).ok,
    ).toBe(true);
    expect(
      assertTextHasNoUnprovenSpeedClaims(
        "intro",
        ui.firstExperience.introTitle,
      ).ok,
    ).toBe(true);
    expect(
      assertTextHasNoUnprovenSpeedClaims(
        "card",
        ui.firstExperience.cardHint,
      ).ok,
    ).toBe(true);
    expect(
      assertTextHasNoUnprovenSpeedClaims(
        "trust",
        LANDING_CTA_TRUST.join("\n"),
      ).ok,
    ).toBe(true);
    expect(ui.firstExperience).not.toHaveProperty("sixtySecondWin");
    expect(FORBIDDEN_UNPROVEN_SPEED_CLAIM_PATTERNS.length).toBeGreaterThan(8);
    expect(SPEED_CLAIM_SCAN_RELATIVE_PATHS).toContain("lib/seo/site.ts");
    expect(SPEED_CLAIM_SCAN_RELATIVE_PATHS).toContain(
      "components/landing/landing-page.tsx",
    );
  });

  it("probe reports honesty on current workspace surfaces", () => {
    const result = probeUnprovenSpeedClaims();
    expect(result.ok).toBe(true);
    expect(result.metadataHonest).toBe(true);
    expect(result.onboardingCopyHonest).toBe(true);
    expect(result.landingSurfacesHonest).toBe(true);
    expect(result.pricingHonest).toBe(true);
    expect(result.postLoginUiHonest).toBe(true);
    expect(result.identifierHonest).toBe(true);
    expect(result.failClosed).toBe(true);
    expect(result.error).toBeNull();
  });

  it("N-01 regression: media generation remains unoffered", () => {
    const premium = getPlanDefinition("premium");
    expect(premium.limits.imageGeneration).toBe(false);
    expect(premium.limits.videoGeneration).toBe(false);
    expect(premium.limits.features).not.toContain("image_generation");
    expect(premium.limits.features).not.toContain("video_generation");

    const labels = QUICK_REQUEST_PRESETS.map((p) => p.label);
    for (const pattern of FORBIDDEN_MEDIA_GENERATION_CLAIM_PATTERNS) {
      if (pattern === "画像生成" || pattern === "動画生成") {
        expect(labels).not.toContain(pattern);
      }
    }
    expect(LANDING_REQUEST_EXAMPLES.map((ex) => ex.id as string)).not.toContain(
      "video",
    );
  });
});
