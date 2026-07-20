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
import type { GooglePersistedAuth } from "@/lib/integrations/google/credential-persistence";
import type { XPersistedAuth } from "@/lib/integrations/x/credential-persistence";
import type { WordPressPersistedAuth } from "@/lib/integrations/wordpress/types";

export const EXTERNAL_AUTH_DOMAIN_KEY = "atlasExternalAuth";

/** Services whose tokens live in dedicated Supabase tables — never Clerk overflow. */
const SUPABASE_BACKED_SERVICE_IDS = new Set(["google", "x", "wordpress"]);

export type DurableExternalAuthState = {
  credentials: ExternalServiceCredentialRecord[];
  connections: ExternalServiceConnection[];
};

/**
 * Re-hydrate the Supabase-backed source of truth at most once per this window
 * per instance. Without a TTL, a serverless instance that cached hydration
 * *before* the user connected an account keeps serving a stale "disconnected"
 * state forever — the user then appears to need re-connecting on every visit.
 */
const HYDRATION_TTL_MS = 60_000;

/**
 * When a hydration pass applies no durable state (transient Supabase/Clerk
 * failure, or a genuinely un-connected user) we only suppress re-hydration for
 * this short window. Without it, a single failed load would pin a connected
 * account to "disconnected" for the full TTL — the reported "Google asks to
 * re-login every time" symptom.
 */
const HYDRATION_NEGATIVE_TTL_MS = 5_000;

function getHydratedUsers(): Map<string, number> {
  const scope = globalThis as typeof globalThis & {
    __atlasExternalAuthHydratedUsers?: Map<string, number>;
  };
  if (!scope.__atlasExternalAuthHydratedUsers) {
    scope.__atlasExternalAuthHydratedUsers = new Map();
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
}

export async function ensureExternalAuthHydrated(userId: string): Promise<void> {
  const hydratedUsers = getHydratedUsers();
  const lastHydratedAt = hydratedUsers.get(userId);
  if (lastHydratedAt !== undefined && Date.now() - lastHydratedAt < HYDRATION_TTL_MS) {
    return;
  }
  // Tentatively mark now to dedup concurrent hydrations in the same tick. If
  // nothing durable is applied we shorten this below so a transient store
  // failure cannot pin a connected account to "disconnected" for the full TTL.
  hydratedUsers.set(userId, Date.now());
  let appliedDurable = false;

  try {
    const { saveExternalServiceCredentials } = await import(
      "./credential-store"
    );
    const { saveExternalServiceConnection } = await import("./store");

    // Google tokens: prefer dedicated Supabase table (never stripped on Clerk overflow).
    const { loadGoogleAuthFromSupabase } = await import(
      "@/lib/integrations/google/credential-persistence"
    );
    const googleAuth = await loadGoogleAuthFromSupabase(userId);
    if (googleAuth) {
      saveExternalServiceCredentials(googleAuth.credentials);
      saveExternalServiceConnection(userId, googleAuth.connection);
      appliedDurable = true;
    }

    // X tokens: same durable Supabase pattern as Google.
    const { loadXAuthFromSupabase } = await import(
      "@/lib/integrations/x/credential-persistence"
    );
    const xAuth = await loadXAuthFromSupabase(userId);
    if (xAuth) {
      saveExternalServiceCredentials(xAuth.credentials);
      saveExternalServiceConnection(userId, xAuth.connection);
      appliedDurable = true;
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
      appliedDurable = true;
    }

    const loaded = await loadDurableDomain<DurableExternalAuthState>(
      userId,
      EXTERNAL_AUTH_DOMAIN_KEY,
    );
    if (loaded) {
      appliedDurable = true;
      hydrateDurableDomain(userId, loaded, {
        googleAuth,
        xAuth,
        wordpressAuth,
      });
    }
  } catch (error) {
    console.warn("[external-auth] Hydration failed:", error);
  } finally {
    if (!appliedDurable) {
      // Allow a quick retry instead of caching a possibly-stale disconnected
      // state for the whole TTL.
      hydratedUsers.set(
        userId,
        Date.now() - (HYDRATION_TTL_MS - HYDRATION_NEGATIVE_TTL_MS),
      );
    }
  }
}

function hydrateDurableDomain(
  userId: string,
  loaded: DurableExternalAuthState,
  applied: {
    googleAuth: GooglePersistedAuth | null;
    xAuth: XPersistedAuth | null;
    wordpressAuth: WordPressPersistedAuth | null;
  },
): void {
  const { googleAuth, xAuth, wordpressAuth } = applied;

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
