import "server-only";

import {
  loadDurableDomain,
  persistDurableDomain,
} from "@/lib/persistence/durable-domain";

import type { ExternalServiceCredentialRecord } from "./credential-store";
import {
  listExternalServiceCredentialsForUser,
  replaceExternalServiceCredentialsForUser,
} from "./credential-store";
import type { ExternalServiceConnection } from "./types";
import {
  listExternalServiceConnections,
  replaceExternalServiceConnectionsForUser,
} from "./store";

export const EXTERNAL_AUTH_DOMAIN_KEY = "atlasExternalAuth";

export type DurableExternalAuthState = {
  credentials: ExternalServiceCredentialRecord[];
  connections: ExternalServiceConnection[];
};

function getHydratedUsers(): Set<string> {
  const scope = globalThis as typeof globalThis & {
    __atlasExternalAuthHydratedUsers?: Set<string>;
  };
  if (!scope.__atlasExternalAuthHydratedUsers) {
    scope.__atlasExternalAuthHydratedUsers = new Set();
  }
  return scope.__atlasExternalAuthHydratedUsers;
}

function compactAuth(
  state: DurableExternalAuthState,
): DurableExternalAuthState {
  // Never put raw tokens into a Clerk overflow compact blob.
  return {
    connections: state.connections.map((connection) => ({
      ...connection,
      account: connection.account
        ? {
            email: connection.account.email,
            name: connection.account.name,
            pictureUrl: null,
          }
        : undefined,
    })),
    credentials: state.credentials.map((credential) => ({
      ...credential,
      accessToken: "",
      refreshToken: "",
    })),
  };
}

export function snapshotExternalAuth(userId: string): DurableExternalAuthState {
  return {
    credentials: listExternalServiceCredentialsForUser(userId),
    connections: listExternalServiceConnections(userId),
  };
}

export function schedulePersistExternalAuth(userId: string): void {
  void persistDurableDomain(
    userId,
    EXTERNAL_AUTH_DOMAIN_KEY,
    snapshotExternalAuth(userId),
    { compact: compactAuth },
  );
}

export async function ensureExternalAuthHydrated(userId: string): Promise<void> {
  if (getHydratedUsers().has(userId)) return;
  getHydratedUsers().add(userId);

  if (listExternalServiceCredentialsForUser(userId).length > 0) return;

  const loaded = await loadDurableDomain<DurableExternalAuthState>(
    userId,
    EXTERNAL_AUTH_DOMAIN_KEY,
  );
  if (!loaded) return;

  if (Array.isArray(loaded.credentials)) {
    const usable = loaded.credentials.filter(
      (row) =>
        row.userId === userId &&
        typeof row.refreshToken === "string" &&
        row.refreshToken.length > 0,
    );
    replaceExternalServiceCredentialsForUser(userId, usable);
  }

  if (Array.isArray(loaded.connections)) {
    replaceExternalServiceConnectionsForUser(userId, loaded.connections);
  }
}
