/**
 * Release blocker: unimplemented integrations must never report connected:true.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  getIntegrationProviderCapability,
  isIntegrationProviderConnectable,
  isIntegrationProviderUserVisible,
  isPlaceholderLegacyIntegrationProvider,
} from "@/lib/integrations/production-capability";
import { connectorProviders } from "@/lib/connectors/definitions";
import { integrationService } from "@/lib/integrations/integration-service";
import { serverIntegrationRepository } from "@/lib/integrations/repositories/server-integration-repository";
import { buildConnectionCenterViews } from "@/lib/connections/build-views";

const PLACEHOLDER_PROVIDERS = [
  "slack",
  "discord",
  "github",
  "webhooks",
  "gmail",
  "wordpress",
  "notion",
] as const;

describe("fake connected ban — capability", () => {
  it("marks Slack/Discord/etc. non-connectable and hidden", () => {
    for (const id of PLACEHOLDER_PROVIDERS) {
      expect(isPlaceholderLegacyIntegrationProvider(id)).toBe(true);
      const cap = getIntegrationProviderCapability(id);
      expect(cap.connectable).toBe(false);
      expect(cap.userVisibleInSettings).toBe(false);
      expect(isIntegrationProviderConnectable(id)).toBe(false);
      expect(isIntegrationProviderUserVisible(id)).toBe(false);
    }
  });

  it("keeps Google Drive legacy path connectable (OAuth only)", () => {
    expect(isIntegrationProviderConnectable("google_drive")).toBe(true);
    expect(isIntegrationProviderUserVisible("google_drive")).toBe(true);
  });

  it("marks Slack/Discord/Stripe connector catalog as coming_soon", () => {
    for (const id of ["slack", "discord", "stripe"] as const) {
      const def = connectorProviders.find((p) => p.id === id);
      expect(def?.defaultStatus).toBe("coming_soon");
      expect(def?.services.every((s) => s.status === "coming_soon")).toBe(true);
    }
  });
});

describe("fake connected ban — IntegrationService", () => {
  beforeEach(async () => {
    const { resetIntegrationStoreForTests } = await import(
      "@/lib/integrations/repositories/server-integration-repository"
    ).catch(() => ({ resetIntegrationStoreForTests: null }));
    // Best-effort reset if exported; otherwise isolate via unique user ids.
    void resetIntegrationStoreForTests;
  });

  it("refuses Slack/Discord placeholder connect", async () => {
    for (const provider of ["slack", "discord", "github", "webhooks"] as const) {
      await expect(
        integrationService.connect({
          userId: `user_fake_${provider}`,
          provider,
        }),
      ).rejects.toThrow(/ご利用いただけません/);
    }
  });

  it("does not list stale placeholder rows as connected", async () => {
    const now = new Date().toISOString();
    await serverIntegrationRepository.save({
      id: "int_stale_slack",
      userId: "user_stale_slack",
      provider: "slack",
      name: "Stale Slack",
      status: "connected",
      connected: true,
      authType: "oauth2",
      scopes: [],
      lastSyncAt: now,
      createdAt: now,
      updatedAt: now,
    });

    const catalog = await integrationService.getCatalogForUser("user_stale_slack");
    expect(catalog.connections.some((c) => c.provider === "slack")).toBe(false);
    expect(catalog.providers.some((p) => p.id === "slack")).toBe(false);
    expect(
      catalog.providers.some(
        (p) => p.id === "slack" && p.connectionStatus === "connected",
      ),
    ).toBe(false);
  });

  it("Connection Center never shows Slack/Discord as connected from legacy stubs", () => {
    const views = buildConnectionCenterViews([
      {
        id: "slack",
        displayName: "Slack",
        description: "",
        authType: "oauth2",
        requiredScopes: [],
        capabilities: [],
        connectionStatus: "connected",
        connection: {
          id: "x",
          userId: "u",
          provider: "slack",
          name: "Slack",
          status: "connected",
          connected: true,
          authType: "oauth2",
          scopes: [],
          lastSyncAt: null,
          createdAt: "",
          updatedAt: "",
        },
      },
    ] as never);
    const slack = views.find((p) => p.id === "slack");
    expect(slack?.connectionStatus).toBe("not_connected");
    const discord = views.find((p) => p.id === "discord");
    expect(discord?.connectionStatus).toBe("not_connected");
  });
});
