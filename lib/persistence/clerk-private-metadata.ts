import "server-only";

import { clerkClient } from "@clerk/nextjs/server";

import { skipClerkRemoteForInternalProbe } from "@/lib/health/internal-probe-user";

import {
  bumpPersistenceCounter,
  recordClerkErrorMessage,
} from "./call-counters";
import { withPersistenceTimeout } from "./with-timeout";

/** Read a single privateMetadata key for a Clerk user. */
export async function loadClerkPrivateMetadataKey<T>(
  userId: string,
  key: string,
): Promise<T | null> {
  if (!process.env.CLERK_SECRET_KEY?.trim()) return null;
  if (
    skipClerkRemoteForInternalProbe({
      userId,
      route: "clerk-private-metadata",
      operation: "getUser",
    })
  ) {
    return null;
  }

  return withPersistenceTimeout<T | null>(async () => {
    try {
      bumpPersistenceCounter("clerkGetUser");
      const client = await clerkClient();
      const user = await client.users.getUser(userId);
      const value = user.privateMetadata?.[key];
      return (value as T | undefined) ?? null;
    } catch {
      return null;
    }
  }, null);
}

/**
 * Merge-write a single privateMetadata key.
 * Clerk merges top-level keys — do NOT getUser + rewrite the entire blob
 * (that re-sends oversized sibling keys and causes 8KB / 429 failures).
 */
export async function persistClerkPrivateMetadataKey(
  userId: string,
  key: string,
  value: unknown,
): Promise<boolean> {
  if (!process.env.CLERK_SECRET_KEY?.trim()) return false;
  if (
    skipClerkRemoteForInternalProbe({
      userId,
      route: "clerk-private-metadata",
      operation: "updateUserMetadata",
    })
  ) {
    return false;
  }

  return withPersistenceTimeout(async () => {
    try {
      bumpPersistenceCounter("clerkUpdateMetadata");
      const client = await clerkClient();
      await client.users.updateUserMetadata(userId, {
        privateMetadata: {
          [key]: value,
        },
      });
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      recordClerkErrorMessage(message);
      console.error(`[persistence] Clerk metadata write failed (${key}):`, error);
      if (/8192|8 KB|maximum allowed size|private_metadata/i.test(message)) {
        try {
          const { pruneOversizedClerkDurableDomains } = await import(
            "@/lib/persistence/durable-domain"
          );
          const pruned = await pruneOversizedClerkDurableDomains(userId);
          console.error("[persistence] Clerk 8KB prune attempted", pruned);
          bumpPersistenceCounter("clerkUpdateMetadata");
          const client = await clerkClient();
          await client.users.updateUserMetadata(userId, {
            privateMetadata: {
              [key]: value,
            },
          });
          return true;
        } catch (retryError) {
          const retryMessage =
            retryError instanceof Error ? retryError.message : String(retryError);
          recordClerkErrorMessage(retryMessage);
          console.error(
            `[persistence] Clerk metadata write failed after prune (${key}):`,
            retryError,
          );
          return false;
        }
      }
      return false;
    }
  }, false);
}

/** Clear specific privateMetadata keys (sets null so Clerk drops them). */
export async function clearClerkPrivateMetadataKeys(
  userId: string,
  keys: readonly string[],
): Promise<boolean> {
  if (!process.env.CLERK_SECRET_KEY?.trim() || keys.length === 0) return false;
  if (
    skipClerkRemoteForInternalProbe({
      userId,
      route: "clerk-private-metadata",
      operation: "clearUserMetadata",
    })
  ) {
    return false;
  }

  try {
    bumpPersistenceCounter("clerkClearKeys");
    const client = await clerkClient();
    const next: Record<string, null> = {};
    for (const key of keys) {
      next[key] = null;
    }
    // Partial merge — do not re-upload the rest of privateMetadata.
    await client.users.updateUserMetadata(userId, {
      privateMetadata: next,
    });
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    recordClerkErrorMessage(message);
    console.error(`[persistence] Clerk metadata clear failed:`, error);
    return false;
  }
}
