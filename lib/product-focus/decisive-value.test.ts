/**
 * MINERVOT DECISIVE VALUE — source contracts for CASE 1–13.
 * No mock success. Claims must match implemented auto-exec.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { mergeXSocialPreference, parseXSocialPreferenceFromText } from "@/lib/memory-apply/x-social-preference";
import { getPlanDefinition } from "@/lib/billing/plans/registry";
import { createDefaultXAutoPostSettings } from "@/lib/integrations/x/post/autopost-types";
import {
  FREE_TRIAL_NOTE,
  HOME_X_AUTOMATION_CTA,
  HOME_X_AUTOMATION_HREF,
  HOME_X_AUTOMATION_SUPPORT,
  LP_PRIMARY_CTA,
  PRODUCT_FINISHING_HEADLINE,
  PRODUCT_HERO_PROMISE,
} from "./messaging";

function src(relative: string): string {
  return readFileSync(join(process.cwd(), relative), "utf8");
}

describe("Decisive Value CASE 1–13", () => {
  it("CASE 1/2: Home CTA goes to /workspace/x and stays there for OAuth", () => {
    const home = src("components/automation-first/home-primary-actions.tsx");
    const panel = src("components/workspace/x-autopost-panel.tsx");
    const callback = src("app/api/external-services/x/oauth/callback/route.ts");
    expect(HOME_X_AUTOMATION_CTA).toBe("毎日のX投稿を任せる");
    expect(HOME_X_AUTOMATION_HREF).toBe("/workspace/x");
    expect(home).toContain("HOME_X_AUTOMATION_HREF");
    expect(home).toContain("HOME_X_AUTOMATION_SUPPORT");
    expect(panel).toContain("X_OAUTH_CONTINUE_CTA");
    expect(panel).toContain("X_OAUTH_WORKSPACE_SETUP_RETURN");
    expect(panel).not.toContain('href="/settings/x"');
    expect(callback).toContain("withXOAuthResultParams");
    expect(callback).toContain("returnTo");
    expect(HOME_X_AUTOMATION_SUPPORT).toContain("次回から原稿作成〜投稿まで自動で実行");
  });

  it("CASE 3/4: auto-post only after explicit mode choice; default is approval", () => {
    const panel = src("components/workspace/x-autopost-panel.tsx");
    const defaults = createDefaultXAutoPostSettings("user");
    expect(defaults.mode).toBe("approval");
    expect(defaults.enabled).toBe(false);
    expect(panel).toContain('update({ mode: "full_auto" })');
    expect(panel).toContain('update({ mode: "approval" })');
    expect(panel).toContain("modeChosen");
    expect(panel).toContain("投稿方法を選んでください");
    expect(panel).toContain("自動投稿へは、あなたが選んだときだけ切り替わります");
  });

  it("CASE 5: immediate trial requires explicit confirm and real post path", () => {
    const panel = src("components/workspace/x-autopost-panel.tsx");
    const trial = src("lib/integrations/x/post/autopost-trial.ts");
    const route = src("app/api/x/autopost/trial/route.ts");
    expect(panel).toContain("X_TRIAL_CTA");
    expect(panel).toContain("X_TRIAL_CONFIRM_POST");
    expect(panel).toContain("confirm: true");
    expect(route).toContain("body.confirm !== true");
    expect(trial).toContain("postTweetAutoForUser");
    expect(trial).toContain("saveXDraftForUser");
    expect(trial).not.toContain("mockSuccess");
    expect(trial).toContain("trial:");
  });

  it("CASE 6/11/12: next-day runner + Free 1 + Light 30 stay intact", () => {
    const runner = src("lib/integrations/x/post/autopost-runner.ts");
    expect(runner).toContain("claimXAutoPostSlot");
    expect(runner).toContain("generateAutoPostText");
    expect(runner).toContain("applyMemoryToDedicatedAutoPost");
    expect(runner).toContain('settings.mode === "approval"');
    expect(runner).toContain("postTweetAutoForUser");
    expect(getPlanDefinition("free").limits.xAutoPostsMonthly).toBe(1);
    expect(getPlanDefinition("light").limits.xAutoPostsMonthly).toBe(30);
    expect(getPlanDefinition("light").monthlyPriceJpy).toBe(980);
    expect(FREE_TRIAL_NOTE).toContain("1回");
  });

  it("CASE 7/8: Memory applies unless today's explicit instruction wins", () => {
    const day1 = parseXSocialPreferenceFromText("短め、丁寧、ハッシュタグ2個");
    expect(day1.length).toBe("short");
    expect(day1.tone).toBe("polite");
    expect(day1.hashtagsMax).toBe(2);

    const day2 = mergeXSocialPreference({
      memory: { ...day1, theme: "副業" },
      explicit: {},
    });
    expect(day2.length).toBe("short");
    expect(day2.tone).toBe("polite");
    expect(day2.hashtagsMax).toBe(2);

    const override = mergeXSocialPreference({
      memory: day2,
      explicit: parseXSocialPreferenceFromText("今日は詳しく"),
    });
    expect(override.length).toBe("long");
    expect(override.tone).toBe("polite");
  });

  it("CASE 9: OAuth cancel keeps onboarding return", () => {
    const callback = src("app/api/external-services/x/oauth/callback/route.ts");
    expect(callback).toContain("oauthError");
    expect(callback).toContain("statePayload?.returnTo");
    expect(callback).toContain('x_error: "1"');
  });

  it("CASE 10: X API failure is never success and does not double-post", () => {
    const trial = src("lib/integrations/x/post/autopost-trial.ts");
    const runner = src("lib/integrations/x/post/autopost-runner.ts");
    expect(trial).toContain('status: "failed"');
    expect(trial).toContain("already_done");
    expect(runner).toContain("already_claimed");
    expect(runner).not.toContain("softSuccess");
  });

  it("CASE 13: mobile touch targets stay at 44px on the X path", () => {
    const panel = src("components/workspace/x-autopost-panel.tsx");
    const home = src("components/automation-first/home-primary-actions.tsx");
    expect(panel).toContain("min-h-[44px]");
    expect(home).toContain("min-h-[var(--touch-target)]");
  });

  it("LP and Home sell one sentence: set once, then MINERVOT finishes", () => {
    const hero = src("components/landing/landing-hero-section.tsx");
    const contrast = src("components/landing/landing-chatgpt-contrast.tsx");
    expect(PRODUCT_HERO_PROMISE).toContain("一度頼んだら次からMINERVOTに任せる");
    expect(hero).toContain("PRODUCT_HERO_PROMISE");
    expect(hero).toContain("LP_PRIMARY_CTA");
    expect(LP_PRIMARY_CTA).toBe("無料で1回試す");
    expect(contrast).toContain("PRODUCT_FINISHING_HEADLINE");
    expect(PRODUCT_FINISHING_HEADLINE).toBe("作るAIではなく、終わらせるAI。");
    expect(contrast).toContain("一般的なAI");
    expect(contrast).not.toContain("ChatGPT / Claude / Gemini");
  });
});
