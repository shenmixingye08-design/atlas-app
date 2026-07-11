import type {
  ExternalServiceConnection,
  ExternalServiceId,
} from "./types";
import {
  createDefaultConnection,
  externalServiceDefinitions,
  getExternalServiceDefinition,
} from "./registry";

type UserConnectionBucket = Map<ExternalServiceId, ExternalServiceConnection>;
type ConnectionStore = Map<string, UserConnectionBucket>;

function getStore(): ConnectionStore {
  const globalScope = globalThis as typeof globalThis & {
    __atlasExternalServiceStore?: ConnectionStore;
  };

  if (!globalScope.__atlasExternalServiceStore) {
    globalScope.__atlasExternalServiceStore = new Map();
  }

  return globalScope.__atlasExternalServiceStore;
}

function getUserBucket(userId: string): UserConnectionBucket {
  const store = getStore();
  let bucket = store.get(userId);
  if (!bucket) {
    bucket = new Map<ExternalServiceId, ExternalServiceConnection>();
    for (const definition of externalServiceDefinitions) {
      bucket.set(definition.serviceId, createDefaultConnection(definition));
    }
    store.set(userId, bucket);
  }
  return bucket;
}

export function listExternalServiceConnections(
  userId: string,
): ExternalServiceConnection[] {
  const bucket = getUserBucket(userId);
  return externalServiceDefinitions.map(
    (definition) =>
      bucket.get(definition.serviceId) ??
      createDefaultConnection(definition),
  );
}

export function getExternalServiceConnection(
  userId: string,
  serviceId: ExternalServiceId,
): ExternalServiceConnection {
  const bucket = getUserBucket(userId);
  return (
    bucket.get(serviceId) ??
    createDefaultConnection(getExternalServiceDefinition(serviceId))
  );
}

export function saveExternalServiceConnection(
  userId: string,
  connection: ExternalServiceConnection,
): ExternalServiceConnection {
  getUserBucket(userId).set(connection.serviceId, connection);
  return connection;
}

export function replaceExternalServiceConnectionsForUser(
  userId: string,
  connections: ExternalServiceConnection[],
): void {
  const bucket = getUserBucket(userId);
  for (const connection of connections) {
    bucket.set(connection.serviceId, connection);
  }
}

/** All persisted connections across users (owner aggregation — no secrets). */
export function listAllExternalServiceConnections(): Array<{
  userId: string;
  connection: ExternalServiceConnection;
}> {
  const results: Array<{
    userId: string;
    connection: ExternalServiceConnection;
  }> = [];

  for (const [userId, bucket] of getStore().entries()) {
    for (const connection of bucket.values()) {
      results.push({ userId, connection });
    }
  }

  return results;
}

export function resetExternalServiceStore(): void {
  getStore().clear();
}
