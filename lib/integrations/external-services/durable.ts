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

/** Services whose tokens live in dedicated Supabase tables — never Clerk overflow. */
const SUPABASE_BACKED_SERVICE_IDS = new Set(["google", "x", "wordpress"]);

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

/** Test helper — clears in-memory hydrate cache. */
export function resetExternalAuthHydration(): void {
  getHydratedUsers().clear();
}
function compactConnectionForClerk(
  connection: ExternalServiceConnection,
): ExternalServiceConnection {
  return {
    serviceId: connection.serviceId,
    serviceName: connection.serviceName,
    status: connection.status,
    connectedAt: null,
    lastUsedAt: null,
    scopes: [],
    features: [],
    errorMessage: null,
    account: undefined,
  };
}

function compactAuth(): DurableExternalAuthState {
  return {
    credentials: [],
    connections: [],
  };
}

export function snapshotExternalAuth(
  userId: string,
): DurableExternalAuthState {
  return {
    credentials: listExternalServiceCredentialsForUser(userId).filter(
      (row) => !SUPABASE_BACKED_SERVICE_IDS.has(row.serviceId),
    ),
    connections: listExternalServiceConnections(userId),
  };
}

export function schedulePersistExternalAuth(userId: string): void {
  void persistDurableDomain(
    userId,
    EXTERNAL_AUTH_DOMAIN_KEY,
    snapshotExternalAuth(userId),
    {
      compact: compactAuth,
      forceSupabase: true,
    },
  );
}export async function ensureExternalAuthHydrated(userId: string): Promise<void> {
  if (getHydratedUsers().has(userId)) return;
  getHydratedUsers().add(userId);

  const { saveExternalServiceCredentials } = await import("./credential-store");
  const { saveExternalServiceConnection } = await import("./store");

  // Google tokens: prefer dedicated Supabase table (never stripped on Clerk overflow).
  const { loadGoogleAuthFromSupabase } = await import(
    "@/lib/integrations/google/credential-persistence"
  );
  const googleAuth = await loadGoogleAuthFromSupabase(userId);
  if (googleAuth) {
    saveExternalServiceCredentials(googleAuth.credentials);
    saveExternalServiceConnection(userId, googleAuth.connection);
  }

  // X tokens: same durable Supabase pattern as Google.
  const { loadXAuthFromSupabase } = await import(
    "@/lib/integrations/x/credential-persistence"
  );
  const xAuth = await loadXAuthFromSupabase(userId);
  if (xAuth) {
    saveExternalServiceCredentials(xAuth.credentials);
    saveExternalServiceConnection(userId, xAuth.connection);
  }

  // WordPress Application Passwords: encrypted Supabase table (never Clerk overflow).
  const { loadWordPressAuthFromSupabase } = await import(
    "@/lib/integrations/wordpress/credential-persistence"
  );
  const { saveWordPressCredentials } = await import(
    "@/lib/integrations/wordpress/credential-store"
  );
  const wordpressAuth = await loadWordPressAuthFromSupabase(userId);
  if (wordpressAuth) {
    saveWordPressCredentials(wordpressAuth.credentials);
    saveExternalServiceConnection(userId, wordpressAuth.connection);
  }

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
        row.refreshToken.length > 0 &&
        // Never overwrite durable Google/X/WP tokens with stripped Clerk overflow empties.
        !SUPABASE_BACKED_SERVICE_IDS.has(row.serviceId),
    );
    const existing = listExternalServiceCredentialsForUser(userId);
    const durableRows = existing.filter((row) =>
      SUPABASE_BACKED_SERVICE_IDS.has(row.serviceId),
    );
    replaceExternalServiceCredentialsForUser(userId, [
      ...usable,
      ...durableRows,
    ]);
  }

  if (Array.isArray(loaded.connections)) {
    const connections = loaded.connections.map((row) => {
      if (googleAuth && row.serviceId === "google") return googleAuth.connection;
      if (xAuth && row.serviceId === "x") return xAuth.connection;
      if (wordpressAuth && row.serviceId === "wordpress") {
        return wordpressAuth.connection;
      }
      return row;
    });
    if (googleAuth && !connections.some((row) => row.serviceId === "google")) {
      connections.push(googleAuth.connection);
    }
    if (xAuth && !connections.some((row) => row.serviceId === "x")) {
      connections.push(xAuth.connection);
    }
    if (
      wordpressAuth &&
      !connections.some((row) => row.serviceId === "wordpress")
    ) {
      connections.push(wordpressAuth.connection);
    }
    replaceExternalServiceConnectionsForUser(userId, connections);
  }
}
