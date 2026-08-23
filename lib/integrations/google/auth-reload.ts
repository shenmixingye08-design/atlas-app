import "server-only";

import type { DurableCredentialRead } from "@/lib/integrations/durable-credential-read";
import { durableReadFailed } from "@/lib/integrations/durable-credential-read";
import {
  deleteExternalServiceCredentials,
  saveExternalServiceCredentials,
} from "@/lib/integrations/external-services/credential-store";
import { saveExternalServiceConnection } from "@/lib/integrations/external-services/store";
import { createDefaultConnection } from "@/lib/integrations/external-services/registry";

import {
  readGoogleAuthFromDurable,
  type GooglePersistedAuth,
} from "./credential-persistence";
import { googleServiceDefinition } from "./definition";

export type GoogleAuthReload = DurableCredentialRead<GooglePersistedAuth>;

export function buildDisconnectedGoogleConnection() {
  return {
    ...createDefaultConnection(googleServiceDefinition),
    status: "disconnected" as const,
    connectedAt: null,
    lastUsedAt: null,
    scopes: [],
    features: [...googleServiceDefinition.plannedFeatures],
    errorMessage: null,
    account: undefined,
  };
}

/**
 * Reload this user's Google credentials from durable storage.
 *
 * - found: overwrite only the Google in-memory slot
 * - missing: confirmed no row → clear stale isolate memory, mark disconnected
 * - unavailable: read failed → do not clear and do not use memory
 * - not_configured: local/test without Supabase → leave memory alone
 */
export async function reloadGoogleAuthFromDurable(
  userId: string,
): Promise<GoogleAuthReload> {
  const read = await readGoogleAuthFromDurable(userId);
  if (read.status === "found") {
    if (!read.value.credentials || read.value.decodeFailed) {
      return durableReadFailed("row_unreadable");
    }
    if (read.value.credentials.userId !== userId) {
      return durableReadFailed("owner_mismatch");
    }
    saveExternalServiceCredentials(read.value.credentials);
    saveExternalServiceConnection(userId, read.value.connection);
    return read;
  }
  if (read.status === "missing") {
    deleteExternalServiceCredentials(userId, "google");
    saveExternalServiceConnection(userId, buildDisconnectedGoogleConnection());
    return read;
  }
  return read;
}
