import "server-only";

import { randomUUID } from "crypto";

import { ui } from "@/lib/i18n";
import { getIntegrationProvider } from "./registry";
import { GOOGLE_DRIVE_SCOPES } from "./google-drive/config";
import {
  exchangeGoogleAuthCode,
  fetchGoogleUserInfo,
  revokeGoogleToken,
} from "./google-drive/oauth";
import { serverCredentialRepository } from "./repositories/server-credential-repository";
import type { IntegrationRepository } from "./repositories/types";
import { serverIntegrationRepository } from "./repositories/server-integration-repository";
import type {
  ConnectIntegrationInput,
  DeliverableDispatchRequest,
  DeliverableDispatchResult,
  Integration,
  IntegrationCatalog,
  IntegrationFilter,
  IntegrationUploadSummary,
  OAuthCredentialRecord,
} from "./types";
import {
  integrationProviders,
  mergeProviderWithConnection,
} from "./registry";
import type { Deliverable } from "@/lib/deliverables/types";
import { getUploadProvider } from "./providers/upload-registry";
import {
  uploadDeliverablesToIntegrations,
  type UploadDeliverablesInput,
} from "./upload-service";

/**
 * Application service for external service connections.
 */
export class IntegrationService {
  constructor(
    private readonly repository: IntegrationRepository = serverIntegrationRepository,
  ) {}

  listConnections(filter?: IntegrationFilter): Promise<Integration[]> {
    return this.repository.list(filter);
  }

  listForUser(userId: string): Promise<Integration[]> {
    return this.repository.list({ userId });
  }

  getById(id: string): Promise<Integration | null> {
    return this.repository.findById(id);
  }

  getByIdForUser(id: string, userId: string): Promise<Integration | null> {
    return this.repository
      .list({ userId, ids: [id] })
      .then((rows) => rows[0] ?? null);
  }

  getByProvider(provider: ConnectIntegrationInput["provider"]): Promise<Integration | null> {
    return this.repository.findByProvider(provider);
  }

  async getCatalogForUser(userId: string): Promise<IntegrationCatalog> {
    const {
      isIntegrationProviderUserVisible,
      isIntegrationProviderConnectable,
    } = await import("@/lib/integrations/production-capability");
    const rawConnections = await this.repository.list({ userId });
    // Never surface placeholder rows as connected (stale in-memory fakes).
    const connections = rawConnections.filter((connection) => {
      if (connection.provider === "google_drive") return true;
      return isIntegrationProviderConnectable(connection.provider);
    });
    const connectionByProvider = new Map(
      connections.map((connection) => [connection.provider, connection]),
    );

    const providers = integrationProviders
      .filter((provider) => isIntegrationProviderUserVisible(provider.id))
      .map((provider) =>
        mergeProviderWithConnection(
          provider,
          connectionByProvider.get(provider.id) ?? null,
        ),
      );

    return { providers, connections };
  }

  /** @deprecated Prefer getCatalogForUser */
  async getCatalog(): Promise<IntegrationCatalog> {
    return this.getCatalogForUser("__unscoped__");
  }

  /**
   * Connect via legacy integrations API.
   * Fail closed for unimplemented providers — never invent connected:true
   * without a real OAuth/credential path (Google Drive uses completeGoogleDriveOAuth).
   */
  async connect(input: ConnectIntegrationInput): Promise<Integration> {
    if (!input.userId?.trim()) {
      throw new Error("Integration.userId is required");
    }
    const { isIntegrationProviderConnectable, unsupportedExternalServiceMessage } =
      await import("@/lib/integrations/production-capability");
    if (!isIntegrationProviderConnectable(input.provider)) {
      throw new Error(unsupportedExternalServiceMessage(input.provider));
    }
    if (input.provider === "google_drive") {
      throw new Error(
        "Google Drive requires OAuth. Use the authorize endpoint instead.",
      );
    }

    // No other legacy provider has a real credential path here.
    throw new Error(unsupportedExternalServiceMessage(input.provider));
  }

  async completeGoogleDriveOAuth(
    code: string,
    requestOrigin: string,
    userId: string,
  ): Promise<Integration> {
    if (!userId.trim()) {
      throw new Error("Integration.userId is required");
    }
    const token = await exchangeGoogleAuthCode(code, requestOrigin);
    const profile = await fetchGoogleUserInfo(token.access_token);

    if (!token.refresh_token) {
      throw new Error(
        "Google did not return a refresh token. Disconnect the app in your Google account and try again.",
      );
    }

    const now = new Date().toISOString();
    const expiresAt = new Date(
      Date.now() + token.expires_in * 1000,
    ).toISOString();

    const existing = (
      await this.repository.list({ userId, provider: "google_drive" })
    )[0];
    if (existing) {
      await serverCredentialRepository.deleteByIntegrationId(existing.id);
      await this.repository.delete(existing.id);
    }

    const providerDef = getIntegrationProvider("google_drive");
    const integration: Integration = {
      id: randomUUID(),
      userId,
      provider: "google_drive",
      name: profile.email,
      status: "connected",
      connected: true,
      authType: providerDef.authType,
      scopes: [...GOOGLE_DRIVE_SCOPES],
      lastSyncAt: now,
      createdAt: now,
      updatedAt: now,
      metadata: {
        accountEmail: profile.email,
        accountName: profile.name,
        storageLocation: "ATLAS/Projects",
        lastUploadAt: null,
        lastUploadStatus: null,
        lastUploadError: null,
        lastUploadDriveUrl: null,
        uploadedFileCount: 0,
      },
    };

    await this.repository.save(integration);

    const credentials: OAuthCredentialRecord = {
      integrationId: integration.id,
      provider: "google_drive",
      accessToken: token.access_token,
      refreshToken: token.refresh_token,
      expiresAt,
      scope: token.scope,
      updatedAt: now,
    };

    await serverCredentialRepository.save(credentials);

    return integration;
  }

  async disconnectForUser(id: string, userId: string): Promise<boolean> {
    const integration = await this.getByIdForUser(id, userId);
    if (!integration) return false;

    if (integration.provider === "google_drive") {
      const credentials = await serverCredentialRepository.findByIntegrationId(id);
      if (credentials) {
        try {
          await revokeGoogleToken(credentials.accessToken);
        } catch (error) {
          console.warn("[IntegrationService] Google token revoke failed:", error);
        }
        await serverCredentialRepository.deleteByIntegrationId(id);
      }
    }

    return this.repository.delete(id);
  }

  /** @deprecated Prefer disconnectForUser */
  async disconnect(id: string): Promise<boolean> {
    return this.disconnectForUser(id, "__unscoped__");
  }

  async uploadDeliverables(
    input: UploadDeliverablesInput,
  ): Promise<IntegrationUploadSummary> {
    return uploadDeliverablesToIntegrations(input);
  }

  async dispatchDeliverable(
    request: DeliverableDispatchRequest,
    deliverable: Deliverable,
    userId: string,
  ): Promise<DeliverableDispatchResult> {
    const integration = await this.getByIdForUser(
      request.integrationId,
      userId,
    );

    if (!integration || !integration.connected) {
      return {
        success: false,
        integrationId: request.integrationId,
        action: request.action,
        message: ui.integrations.notConnectedError,
      };
    }

    const uploadProvider = getUploadProvider(integration.provider);
    if (!uploadProvider) {
      return {
        success: false,
        integrationId: request.integrationId,
        action: request.action,
        message: `Provider ${integration.provider} does not support uploads yet.`,
      };
    }

    const summary = await uploadDeliverablesToIntegrations({
      userId,
      deliverables: [deliverable],
      projectName:
        typeof request.metadata?.projectName === "string"
          ? request.metadata.projectName
          : ui.integrations.untitledProject,
      workflowId:
        typeof request.metadata?.workflowId === "string"
          ? request.metadata.workflowId
          : null,
    });

    const upload = summary.uploads[0];
    if (!upload?.success) {
      return {
        success: false,
        integrationId: request.integrationId,
        action: request.action,
        message: upload?.error ?? "Upload failed",
      };
    }

    return {
      success: true,
      integrationId: request.integrationId,
      action: request.action,
      externalRef: upload.driveFileId,
      message: `Uploaded ${deliverable.fileName} to Google Drive`,
    };
  }
}

export const integrationService = new IntegrationService();

export type { IntegrationUploadSummary, UploadDeliverablesInput };
