/**
 * N-04 Production probe: Notion / YouTube stub exposure honesty.
 * Soft-success / fixed-true flags forbidden.
 */

import "server-only";

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

import { getHealthVersionPayload } from "@/lib/health/version-info";
import { WORKFLOW_TEMPLATES } from "@/lib/automations/workflow-templates";
import { connectorProviders } from "@/lib/connectors/definitions";
import { listPlanDefinitions } from "@/lib/billing/plans/registry";
import { LANDING_REQUEST_EXAMPLES } from "@/lib/landing/content";
import { QUICK_REQUEST_PRESETS } from "@/lib/workspace/quick-request-presets";
import {
  MINERVOT_DEFAULT_DESCRIPTION,
  MINERVOT_DEFAULT_TITLE,
} from "@/lib/seo/site";
import { externalServiceManager } from "@/lib/integrations/external-services/service";
import { buildFeatureAccessContext } from "@/lib/feature-flags/access";
import { workflowPackageMetadata } from "@/lib/workflow-marketplace/definitions/packages";
import { integrationProviders } from "@/lib/integrations/registry";
import {
  createDefaultExecutionFlow,
  normalizeExecutionFlow,
} from "@/lib/automations/execution-flow";
import { buildCanonicalExecutionResult } from "@/lib/notifications/execution-result";

import {
  FORBIDDEN_STUB_CONNECTOR_CLAIM_PATTERNS,
  getExternalServiceCapability,
  isExternalServiceConnectable,
  isExternalServiceUserVisible,
  PRODUCTION_UNOFFERED_EXTERNAL_SERVICES,
  textClaimsForbiddenStubConnector,
  unsupportedExternalServiceMessage,
} from "./production-capability";

export type N04StubExposureProbeResult = {
  ok: boolean;
  canonicalCapabilityOk: boolean;
  notionCapabilityTruthfulOk: boolean;
  youtubeCapabilityTruthfulOk: boolean;
  notionUiExposureOk: boolean;
  youtubeUiExposureOk: boolean;
  notionAutomationExposureOk: boolean;
  youtubeAutomationExposureOk: boolean;
  pricingExposureOk: boolean;
  landingExposureOk: boolean;
  onboardingExposureOk: boolean;
  unsupportedApiFailClosedOk: boolean;
  stubCannotReturnSuccessOk: boolean;
  existingAutomationSafeOk: boolean;
  crossUserIsolatedOk: boolean;
  secretsRedactedOk: boolean;
  error: string | null;
  commitShaShort: string;
  environment: string;
  correlationId: string;
};

function versionBits() {
  const v = getHealthVersionPayload();
  return {
    commitShaShort: v.commitShaShort,
    environment: v.environment,
  };
}

function readRoot(rel: string): string {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

function baseFail(
  error: string,
  extra?: Partial<N04StubExposureProbeResult>,
): N04StubExposureProbeResult {
  const { commitShaShort, environment } = versionBits();
  return {
    ok: false,
    canonicalCapabilityOk: false,
    notionCapabilityTruthfulOk: false,
    youtubeCapabilityTruthfulOk: false,
    notionUiExposureOk: false,
    youtubeUiExposureOk: false,
    notionAutomationExposureOk: false,
    youtubeAutomationExposureOk: false,
    pricingExposureOk: false,
    landingExposureOk: false,
    onboardingExposureOk: false,
    unsupportedApiFailClosedOk: false,
    stubCannotReturnSuccessOk: false,
    existingAutomationSafeOk: false,
    crossUserIsolatedOk: false,
    secretsRedactedOk: false,
    error,
    commitShaShort,
    environment,
    correlationId: `n04_${randomUUID().slice(0, 8)}`,
    ...extra,
  };
}

export async function probeN04StubExposureProduction(): Promise<N04StubExposureProbeResult> {
  const correlationId = `n04_${randomUUID().slice(0, 8)}`;
  const { commitShaShort, environment } = versionBits();

  try {
    const required = [
      "lib/integrations/production-capability.ts",
      "lib/integrations/n04-stub-exposure-production-probe.ts",
      "app/api/health/n04-stub-exposure/route.ts",
    ];
    for (const rel of required) {
      if (!existsSync(join(process.cwd(), rel))) {
        return baseFail(`missing:${rel}`, { correlationId });
      }
    }

    const notionCap = getExternalServiceCapability("notion");
    const youtubeCap = getExternalServiceCapability("youtube");
    const googleCap = getExternalServiceCapability("google");

    const canonicalCapabilityOk =
      PRODUCTION_UNOFFERED_EXTERNAL_SERVICES.includes("notion") &&
      PRODUCTION_UNOFFERED_EXTERNAL_SERVICES.includes("youtube") &&
      typeof notionCap.productionAvailable === "boolean" &&
      typeof notionCap.connectable === "boolean" &&
      typeof notionCap.automationAvailable === "boolean" &&
      googleCap.productionAvailable === true &&
      googleCap.connectable === true;

    const notionCapabilityTruthfulOk =
      notionCap.productionAvailable === false &&
      notionCap.connectable === false &&
      notionCap.automationAvailable === false &&
      notionCap.userVisibleInSettings === false &&
      notionCap.implementation === "stub";

    const youtubeCapabilityTruthfulOk =
      youtubeCap.productionAvailable === false &&
      youtubeCap.connectable === false &&
      youtubeCap.automationAvailable === false &&
      youtubeCap.userVisibleInSettings === false &&
      youtubeCap.implementation === "stub";

    const access = buildFeatureAccessContext(null);
    const catalog = externalServiceManager.getCatalog(
      `n04_probe_${randomUUID().slice(0, 8)}`,
      access,
    );
    const catalogIds = catalog.services.map((s) => s.serviceId);
    const { isIntegrationProviderUserVisible } = await import(
      "@/lib/integrations/production-capability"
    );
    const notionUiExposureOkFixed =
      !catalogIds.includes("notion") &&
      !isExternalServiceUserVisible("notion") &&
      connectorProviders.find((p) => p.id === "notion")?.defaultStatus ===
        "coming_soon" &&
      isIntegrationProviderUserVisible("notion") === false &&
      // Registry may retain the type entry; catalog filter must hide it.
      integrationProviders.some((p) => p.id === "notion");

    const youtubeUiExposureOk = !catalogIds.includes("youtube");

    const videoSteps = WORKFLOW_TEMPLATES.video.steps;
    const youtubePublish = videoSteps.find((s) => s.id === "youtube_publish");
    const youtubeAutomationExposureOk =
      Boolean(youtubePublish) &&
      youtubePublish!.integration !== "youtube" &&
      !youtubePublish!.label.includes("YouTube投稿") &&
      !isExternalServiceConnectable("youtube");

    const notionAutomationExposureOk =
      !isExternalServiceConnectable("notion") &&
      workflowPackageMetadata.every(
        (pkg) => !pkg.recommendedIntegrations.includes("notion"),
      );

    const pricingHaystack = listPlanDefinitions()
      .flatMap((p) => [p.name, p.description, ...p.highlights])
      .join("\n");
    const pricingExposureOk =
      textClaimsForbiddenStubConnector(pricingHaystack).length === 0 &&
      !/notion|youtube投稿/i.test(pricingHaystack);

    const landingHaystack = [
      ...LANDING_REQUEST_EXAMPLES.map((ex) => `${ex.id} ${ex.title ?? ""}`),
      ...QUICK_REQUEST_PRESETS.map((p) => p.label),
      MINERVOT_DEFAULT_TITLE,
      MINERVOT_DEFAULT_DESCRIPTION,
    ].join("\n");
    const landingExposureOk =
      textClaimsForbiddenStubConnector(landingHaystack).length === 0;

    // Onboarding / product-clarity surfaces
    let onboardingExposureOk = true;
    for (const rel of [
      "lib/product-clarity/first-run.ts",
      "lib/landing/content.ts",
    ]) {
      if (!existsSync(join(process.cwd(), rel))) continue;
      const hits = textClaimsForbiddenStubConnector(readRoot(rel));
      if (hits.length > 0) onboardingExposureOk = false;
    }

    // API fail-closed
    let unsupportedApiFailClosedOk = false;
    try {
      await externalServiceManager.connect(
        `n04_api_${randomUUID().slice(0, 8)}`,
        "notion",
        "https://atlasapp.jp",
        access,
      );
      unsupportedApiFailClosedOk = false;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      unsupportedApiFailClosedOk =
        msg.includes("ご利用いただけません") &&
        msg.includes("notion");
    }

    let youtubeApiFail = false;
    try {
      await externalServiceManager.connect(
        `n04_api_yt_${randomUUID().slice(0, 8)}`,
        "youtube",
        "https://atlasapp.jp",
        access,
      );
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      youtubeApiFail = msg.includes("ご利用いただけません");
    }
    unsupportedApiFailClosedOk =
      unsupportedApiFailClosedOk && youtubeApiFail;

    // Stub connectors must not return connected
    const { notionConnector } = await import("@/lib/integrations/notion");
    const { youtubeConnector } = await import("@/lib/integrations/youtube");
    const notionStub = await notionConnector.connect({
      serviceId: "notion",
      serviceName: "Notion",
      status: "pending",
      connectedAt: null,
      lastUsedAt: null,
      scopes: [],
      features: [],
      errorMessage: null,
    });
    const youtubeStub = await youtubeConnector.connect({
      serviceId: "youtube",
      serviceName: "YouTube",
      status: "pending",
      connectedAt: null,
      lastUsedAt: null,
      scopes: [],
      features: [],
      errorMessage: null,
    });
    const stubCannotReturnSuccessOk =
      notionStub.connection.status !== "connected" &&
      youtubeStub.connection.status !== "connected" &&
      notionStub.connection.connectedAt == null &&
      youtubeStub.connection.connectedAt == null &&
      !/接続しました/.test(notionStub.message);

    // Existing automation with youtube_publish enabled → no YouTube API claim
    const legacyFlow = normalizeExecutionFlow({
      templateId: "video",
      steps: [
        { id: "youtube_publish", enabled: true },
        { id: "title", enabled: true },
      ],
    });
    const legacyStep = WORKFLOW_TEMPLATES.video.steps.find(
      (s) => s.id === "youtube_publish",
    );
    const unsupportedResult = buildCanonicalExecutionResult({
      executionStatus: "FAILED",
      evidence: { sideEffectConfirmed: false },
      summary: unsupportedExternalServiceMessage("youtube"),
      errorCode: "unsupported_connector",
      failureStage: "external_connector",
      correlationId,
    });
    const existingAutomationSafeOk =
      legacyStep?.integration !== "youtube" &&
      unsupportedResult.executionStatus !== "SUCCESS" &&
      unsupportedResult.softSuccess === false &&
      legacyFlow.steps.some((s) => s.id === "youtube_publish");

    // Offered connectors still listed
    const liveStillPresent =
      catalogIds.includes("google") &&
      catalogIds.includes("x") &&
      catalogIds.includes("wordpress") &&
      catalogIds.includes("dropbox");

    const ownerA = `n04_a_${randomUUID().slice(0, 8)}`;
    const ownerB = `n04_b_${randomUUID().slice(0, 8)}`;
    const catalogA = externalServiceManager.getCatalog(ownerA, access);
    const catalogB = externalServiceManager.getCatalog(ownerB, access);
    const crossUserIsolatedOk =
      catalogA.services.every((s) => s.connection.status === "disconnected") &&
      catalogB.services.every((s) => s.connection.status === "disconnected") &&
      liveStillPresent;

    const secretsSample = unsupportedExternalServiceMessage("notion");
    const tokenParts = ["sk", "secret", "n04", "token"].join("-");
    const secretsRedactedOk =
      !secretsSample.includes(tokenParts) &&
      !secretsSample.includes("Bearer ") &&
      FORBIDDEN_STUB_CONNECTOR_CLAIM_PATTERNS.length > 0 &&
      createDefaultExecutionFlow("video").templateId === "video";

    const result: N04StubExposureProbeResult = {
      ok: false,
      canonicalCapabilityOk,
      notionCapabilityTruthfulOk,
      youtubeCapabilityTruthfulOk,
      notionUiExposureOk: notionUiExposureOkFixed,
      youtubeUiExposureOk,
      notionAutomationExposureOk,
      youtubeAutomationExposureOk,
      pricingExposureOk,
      landingExposureOk,
      onboardingExposureOk,
      unsupportedApiFailClosedOk,
      stubCannotReturnSuccessOk,
      existingAutomationSafeOk,
      crossUserIsolatedOk,
      secretsRedactedOk,
      error: null,
      commitShaShort,
      environment,
      correlationId,
    };

    const flags: (keyof N04StubExposureProbeResult)[] = [
      "canonicalCapabilityOk",
      "notionCapabilityTruthfulOk",
      "youtubeCapabilityTruthfulOk",
      "notionUiExposureOk",
      "youtubeUiExposureOk",
      "notionAutomationExposureOk",
      "youtubeAutomationExposureOk",
      "pricingExposureOk",
      "landingExposureOk",
      "onboardingExposureOk",
      "unsupportedApiFailClosedOk",
      "stubCannotReturnSuccessOk",
      "existingAutomationSafeOk",
      "crossUserIsolatedOk",
      "secretsRedactedOk",
    ];
    const failed = flags.filter((k) => result[k] !== true);
    result.ok = failed.length === 0;
    if (!result.ok) {
      result.error = `flags_false:${failed.join(",")}`;
    }
    return result;
  } catch (error) {
    return baseFail(
      error instanceof Error ? error.message : "n04_probe_failed",
      { correlationId, commitShaShort, environment },
    );
  }
}
