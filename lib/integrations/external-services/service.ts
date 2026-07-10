import "server-only";

import {
  externalServiceDefinitions,
  getExternalServiceConnector,
  getExternalServiceDefinition,
  mergeExternalServiceView,
} from "./registry";
import {
  getExternalServiceConnection,
  listExternalServiceConnections,
  saveExternalServiceConnection,
} from "./store";
import type {
  ExternalServiceCatalog,
  ExternalServiceConnectResult,
  ExternalServiceConnection,
  ExternalServiceId,
} from "./types";
import { buildGoogleAccountAuthorizeUrl } from "../google/oauth";
import { disconnectGoogleAccount } from "../google/oauth-service";
import { markGoogleConnectionPending } from "../google/pending";
import { buildXAuthorizeUrl } from "../x/oauth";
import { disconnectXAccount } from "../x/oauth-service";
import { markXConnectionPending } from "../x/pending";
import type { FeatureAccessContext } from "@/lib/feature-flags/types";
import {
  featureDisabledMessage,
  getExternalServiceFeatureFlag,
  isExternalServiceFeatureEnabled,
} from "@/lib/feature-flags/guards";

export class ExternalServiceManager {
  getCatalog(
    userId: string,
    context: FeatureAccessContext,
  ): ExternalServiceCatalog {
    const connections = listExternalServiceConnections(userId);
    const connectionById = new Map(
      connections.map((connection) => [connection.serviceId, connection]),
    );

    const services = externalServiceDefinitions.map((definition) => ({
      ...mergeExternalServiceView(
        definition,
        connectionById.get(definition.serviceId) ?? null,
      ),
      featureEnabled: isExternalServiceFeatureEnabled(
        definition.serviceId,
        context,
      ),
    }));

    return { services };
  }

  getConnection(
    userId: string,
    serviceId: ExternalServiceId,
  ): ExternalServiceConnection {
    return getExternalServiceConnection(userId, serviceId);
  }

  assertServiceAvailable(
    serviceId: ExternalServiceId,
    context: FeatureAccessContext,
  ): void {
    if (isExternalServiceFeatureEnabled(serviceId, context)) {
      return;
    }

    const flagId = getExternalServiceFeatureFlag(serviceId);
    throw new Error(
      flagId ? featureDisabledMessage(flagId) : "この連携は現在ご利用いただけません",
    );
  }

  async connect(
    userId: string,
    serviceId: ExternalServiceId,
    requestOrigin?: string,
    context?: FeatureAccessContext,
  ): Promise<ExternalServiceConnectResult> {
    if (context) {
      this.assertServiceAvailable(serviceId, context);
    }

    const current = getExternalServiceConnection(userId, serviceId);

    if (current.status === "connected") {
      return { connection: current, message: "すでに接続済みです" };
    }

    if (serviceId === "google") {
      if (!requestOrigin) {
        throw new Error("Request origin is required for Google OAuth");
      }

      markGoogleConnectionPending(userId);
      const pending = getExternalServiceConnection(userId, "google");
      const authorizeUrl = buildGoogleAccountAuthorizeUrl(requestOrigin, userId);

      return {
        connection: pending,
        message: "Google認証画面へ移動します",
        authorizeUrl,
      };
    }

    if (serviceId === "x") {
      if (!requestOrigin) {
        throw new Error("Request origin is required for X OAuth");
      }

      markXConnectionPending(userId);
      const pending = getExternalServiceConnection(userId, "x");
      const authorizeUrl = buildXAuthorizeUrl(requestOrigin, userId);

      return {
        connection: pending,
        message: "X認証画面へ移動します",
        authorizeUrl,
      };
    }

    const definition = getExternalServiceDefinition(serviceId);
    const connector = getExternalServiceConnector(serviceId);

    const pending: ExternalServiceConnection = {
      ...current,
      status: "pending",
      errorMessage: null,
      scopes: [...definition.plannedScopes],
      features: [...definition.plannedFeatures],
    };
    saveExternalServiceConnection(userId, pending);

    try {
      const result = await connector.connect(pending);
      saveExternalServiceConnection(userId, result.connection);
      return result;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "接続に失敗しました";
      const failed: ExternalServiceConnection = {
        ...pending,
        status: "error",
        errorMessage: message,
      };
      saveExternalServiceConnection(userId, failed);
      throw error;
    }
  }

  async disconnect(
    userId: string,
    serviceId: ExternalServiceId,
  ): Promise<ExternalServiceConnection> {
    if (serviceId === "google") {
      return disconnectGoogleAccount(userId);
    }

    if (serviceId === "x") {
      return disconnectXAccount(userId);
    }

    const connector = getExternalServiceConnector(serviceId);
    const current = getExternalServiceConnection(userId, serviceId);
    const disconnected = await connector.disconnect(current);
    saveExternalServiceConnection(userId, disconnected);
    return disconnected;
  }
}

export const externalServiceManager = new ExternalServiceManager();
