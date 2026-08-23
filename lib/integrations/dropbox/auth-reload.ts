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
  readDropboxAuthFromDurable,
  type DropboxPersistedAuth,
} from "./credential-persistence";
import { dropboxServiceDefinition } from "./definition";

export type DropboxAuthReload = DurableCredentialRead<DropboxPersistedAuth>;

export function buildDisconnectedDropboxConnection() {
  return {
    ...createDefaultConnection(dropboxServiceDefinition),
    status: "disconnected" as const,
    connectedAt: null,
    lastUsedAt: null,
    scopes: [],
    features: [...dropboxServiceDefinition.plannedFeatures],
    errorMessage: null,
    account: undefined,
  };
}

/**
 * Reload this user's Dropbox credentials from durable storage.
 *
 * - found: overwrite only the Dropbox in-memory slot
 * - missing: confirmed no row → clear stale isolate memory, mark disconnected
 * - unavailable: read failed → do not clear and do not use memory
 * - not_configured: local/test without Supabase → leave memory alone
 */
export async function reloadDropboxAuthFromDurable(
  userId: string,
): Promise<DropboxAuthReload> {
  const read = await readDropboxAuthFromDurable(userId);
  if (read.status === "found") {
    if (read.value.credentials.userId !== userId) {
      return durableReadFailed("owner_mismatch");
    }
    saveExternalServiceCredentials(read.value.credentials);
    saveExternalServiceConnection(userId, read.value.connection);
    return read;
  }
  if (read.status === "missing") {
    deleteExternalServiceCredentials(userId, "dropbox");
    saveExternalServiceConnection(userId, buildDisconnectedDropboxConnection());
    return read;
  }
  return read;
}
