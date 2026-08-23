import "server-only";

import type { DurableCredentialRead } from "@/lib/integrations/durable-credential-read";
import { durableReadFailed } from "@/lib/integrations/durable-credential-read";
import {
  deleteExternalServiceCredentials,
  saveExternalServiceCredentials,
} from "@/lib/integrations/external-services/credential-store";
import { saveExternalServiceConnection } from "@/lib/integrations/external-services/store";
import { createDefaultConnection } from "@/lib/integrations/external-services/registry";

import { readXAuthFromDurable, type XPersistedAuth } from "./credential-persistence";
import { xServiceDefinition } from "./definition";

export type XAuthReload = DurableCredentialRead<XPersistedAuth>;

export function buildDisconnectedXConnection() {
  return {
    ...createDefaultConnection(xServiceDefinition),
    status: "disconnected" as const,
    connectedAt: null,
    lastUsedAt: null,
    scopes: [],
    features: [...xServiceDefinition.plannedFeatures],
    errorMessage: null,
    account: undefined,
  };
}

/**
 * Reload this user's X credentials from durable storage.
 *
 * - found: overwrite only the X in-memory slot
 * - missing: confirmed no row → clear stale isolate memory, mark disconnected
 * - unavailable: read failed → do not clear and do not use memory
 * - not_configured: local/test without Supabase → leave memory alone
 */
export async function reloadXAuthFromDurable(
  userId: string,
): Promise<XAuthReload> {
  const read = await readXAuthFromDurable(userId);
  if (read.status === "found") {
    if (read.value.credentials.userId !== userId) {
      return durableReadFailed("owner_mismatch");
    }
    saveExternalServiceCredentials(read.value.credentials);
    saveExternalServiceConnection(userId, read.value.connection);
    return read;
  }
  if (read.status === "missing") {
    deleteExternalServiceCredentials(userId, "x");
    saveExternalServiceConnection(userId, buildDisconnectedXConnection());
    return read;
  }
  return read;
}
