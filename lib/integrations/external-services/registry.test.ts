import { describe, expect, it, beforeEach } from "vitest";
import {
  createDefaultConnection,
  externalServiceDefinitions,
  getExternalServiceDefinition,
  isExternalServiceId,
  mergeExternalServiceView,
} from "@/lib/integrations/external-services/registry";
import {
  getExternalServiceConnection,
  resetExternalServiceStore,
  saveExternalServiceConnection,
} from "@/lib/integrations/external-services/store";

describe("external service registry", () => {
  it("registers six managed services", () => {
    expect(externalServiceDefinitions).toHaveLength(6);
    expect(externalServiceDefinitions.map((s) => s.serviceId)).toEqual([
      "google",
      "dropbox",
      "x",
      "wordpress",
      "youtube",
      "notion",
    ]);
  });

  it("validates service ids", () => {
    expect(isExternalServiceId("google")).toBe(true);
    expect(isExternalServiceId("slack")).toBe(false);
  });

  it("includes google purposes", () => {
    const google = getExternalServiceDefinition("google");
    expect(google.purposes).toContain("Gmail");
    expect(google.purposes).toContain("Drive");
  });
});

const TEST_USER_ID = "user_registry_test";

describe("external service store", () => {
  beforeEach(() => {
    resetExternalServiceStore();
  });

  it("starts disconnected with planned features", () => {
    const connection = getExternalServiceConnection(TEST_USER_ID, "dropbox");
    expect(connection.status).toBe("disconnected");
    expect(connection.connectedAt).toBeNull();
    expect(connection.features.length).toBeGreaterThan(0);
  });

  it("merges view for settings UI", () => {
    const view = mergeExternalServiceView(
      getExternalServiceDefinition("x"),
      getExternalServiceConnection(TEST_USER_ID, "x"),
    );
    expect(view.serviceName).toBe("X");
    expect(view.connection.status).toBe("disconnected");
  });

  it("supports stub connect flow", async () => {
    const { notionConnector } = await import("@/lib/integrations/notion");
    const definition = getExternalServiceDefinition("notion");
    const pending = {
      ...createDefaultConnection(definition),
      status: "pending" as const,
      scopes: [...definition.plannedScopes],
    };
    saveExternalServiceConnection(TEST_USER_ID, pending);

    const result = await notionConnector.connect(pending);
    saveExternalServiceConnection(TEST_USER_ID, result.connection);

    expect(getExternalServiceConnection(TEST_USER_ID, "notion").status).toBe(
      "connected",
    );
    expect(
      getExternalServiceConnection(TEST_USER_ID, "notion").connectedAt,
    ).not.toBeNull();
  });
});
