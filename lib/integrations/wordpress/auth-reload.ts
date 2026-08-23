import "server-only";

import type { DurableCredentialRead } from "@/lib/integrations/durable-credential-read";
import { saveExternalServiceConnection } from "@/lib/integrations/external-services/store";
import { createDefaultConnection } from "@/lib/integrations/external-services/registry";

import { readWordPressAuthFromDurable } from "./credential-persistence";
import {
  deleteWordPressCredentials,
  saveWordPressCredentials,
} from "./credential-store";
import { wordpressServiceDefinition } from "./definition";
import type { WordPressPersistedAuth } from "./types";

export type WordPressAuthReload = DurableCredentialRead<WordPressPersistedAuth>;

export function buildDisconnectedWordPressConnection() {
  return {
    ...createDefaultConnection(wordpressServiceDefinition),
    status: "disconnected" as const,
    connectedAt: null,
    lastUsedAt: null,
    scopes: [],
    features: [...wordpressServiceDefinition.plannedFeatures],
    errorMessage: null,
    account: undefined,
  };
}

/**
 * Reload this user's WordPress credentials from durable storage.
 *
 * - found: overwrite only the WordPress in-memory slot
 * - missing: confirmed no row → clear stale isolate memory, mark disconnected
 * - unavailable: read failed → do not clear and do not use memory
 * - not_configured: local/test without Supabase → leave memory alone
 */
export async function reloadWordPressAuthFromDurable(
  userId: string,
): Promise<WordPressAuthReload> {
  const read = await readWordPressAuthFromDurable(userId);
  if (read.status === "found") {
    if (read.value.credentials.userId !== userId) {
      return {
        status: "unavailable",
        developerCode: "durable_read_failed",
        reason: "owner_mismatch",
      };
    }
    saveWordPressCredentials(read.value.credentials);
    saveExternalServiceConnection(userId, read.value.connection);
    return read;
  }
  if (read.status === "missing") {
    deleteWordPressCredentials(userId);
    saveExternalServiceConnection(userId, buildDisconnectedWordPressConnection());
    return read;
  }
  return read;
}
