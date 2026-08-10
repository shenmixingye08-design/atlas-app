/**
 * N-04: Notion / YouTube stub exposure honesty.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  getExternalServiceCapability,
  isExternalServiceConnectable,
  isExternalServiceUserVisible,
  isIntegrationProviderConnectable,
  PRODUCTION_UNOFFERED_EXTERNAL_SERVICES,
} from "@/lib/integrations/production-capability";
import { connectorProviders } from "@/lib/connectors/definitions";
import { WORKFLOW_TEMPLATES } from "@/lib/automations/workflow-templates";
import { resetExternalServiceStore } from "@/lib/integrations/external-services/store";
import { externalServiceManager } from "@/lib/integrations/external-services/service";
import { buildFeatureAccessContext } from "@/lib/feature-flags/access";

describe("N-04 production capability", () => {
  it("lists Notion and YouTube as unoffered", () => {
    expect(PRODUCTION_UNOFFERED_EXTERNAL_SERVICES).toContain("notion");
    expect(PRODUCTION_UNOFFERED_EXTERNAL_SERVICES).toContain("youtube");
  });

  it("marks Notion/YouTube capability as non-connectable stubs", () => {
    for (const id of ["notion", "youtube"] as const) {
      const cap = getExternalServiceCapability(id);
      expect(cap.productionAvailable).toBe(false);
      expect(cap.connectable).toBe(false);
      expect(cap.automationAvailable).toBe(false);
      expect(cap.userVisibleInSettings).toBe(false);
      expect(isExternalServiceConnectable(id)).toBe(false);
      expect(isExternalServiceUserVisible(id)).toBe(false);
    }
    expect(isIntegrationProviderConnectable("notion")).toBe(false);
  });

  it("keeps live connectors available", () => {
    for (const id of ["google", "x", "wordpress", "dropbox"] as const) {
      const cap = getExternalServiceCapability(id);
      expect(cap.productionAvailable).toBe(true);
      expect(cap.connectable).toBe(true);
    }
  });

  it("marks Notion connector catalog as coming_soon", () => {
    const notion = connectorProviders.find((p) => p.id === "notion");
    expect(notion?.defaultStatus).toBe("coming_soon");
    expect(notion?.services.every((s) => s.status === "coming_soon")).toBe(
      true,
    );
  });

  it("does not claim YouTube投稿 in video workflow", () => {
    const step = WORKFLOW_TEMPLATES.video.steps.find(
      (s) => s.id === "youtube_publish",
    );
    expect(step?.integration).not.toBe("youtube");
    expect(step?.label).not.toContain("YouTube投稿");
  });
});

describe("N-04 external service manager", () => {
  beforeEach(() => {
    resetExternalServiceStore();
  });

  it("hides Notion/YouTube from catalog and fails connect", async () => {
    const context = buildFeatureAccessContext(null);
    const catalog = externalServiceManager.getCatalog("user_n04", context);
    const ids = catalog.services.map((s) => s.serviceId);
    expect(ids).not.toContain("notion");
    expect(ids).not.toContain("youtube");
    expect(ids).toContain("google");

    await expect(
      externalServiceManager.connect(
        "user_n04",
        "notion",
        "http://localhost:3000",
        context,
      ),
    ).rejects.toThrow(/ご利用いただけません/);

    await expect(
      externalServiceManager.connect(
        "user_n04",
        "youtube",
        "http://localhost:3000",
        context,
      ),
    ).rejects.toThrow(/ご利用いただけません/);
  });
});

describe("N-04 production probe", () => {
  beforeEach(() => {
    resetExternalServiceStore();
  });

  it("reports all required flags true", async () => {
    const { probeN04StubExposureProduction } = await import(
      "@/lib/integrations/n04-stub-exposure-production-probe"
    );
    const result = await probeN04StubExposureProduction();
    if (!result.ok) {
      expect(result).toMatchObject({ ok: true, error: null });
    }
    expect(result.canonicalCapabilityOk).toBe(true);
    expect(result.notionCapabilityTruthfulOk).toBe(true);
    expect(result.youtubeCapabilityTruthfulOk).toBe(true);
    expect(result.notionUiExposureOk).toBe(true);
    expect(result.youtubeUiExposureOk).toBe(true);
    expect(result.notionAutomationExposureOk).toBe(true);
    expect(result.youtubeAutomationExposureOk).toBe(true);
    expect(result.pricingExposureOk).toBe(true);
    expect(result.landingExposureOk).toBe(true);
    expect(result.onboardingExposureOk).toBe(true);
    expect(result.unsupportedApiFailClosedOk).toBe(true);
    expect(result.stubCannotReturnSuccessOk).toBe(true);
    expect(result.existingAutomationSafeOk).toBe(true);
    expect(result.crossUserIsolatedOk).toBe(true);
    expect(result.secretsRedactedOk).toBe(true);
    expect(result.ok).toBe(true);
  }, 60_000);
});
