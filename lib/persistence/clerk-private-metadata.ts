import "server-only";

import { clerkClient } from "@clerk/nextjs/server";

import { withPersistenceTimeout } from "./with-timeout";

/** Read a single privateMetadata key for a Clerk user. */
export async function loadClerkPrivateMetadataKey<T>(
  userId: string,
  key: string,
): Promise<T | null> {
  if (!process.env.CLERK_SECRET_KEY?.trim()) return null;

  // Bounded: a hung Clerk call must not stall the request indefinitely.
  return withPersistenceTimeout<T | null>(async () => {
    try {
      const client = await clerkClient();
      const user = await client.users.getUser(userId);
      const value = user.privateMetadata?.[key];
      return (value as T | undefined) ?? null;
    } catch {
      return null;
    }
  }, null);
}

/** Merge-write a single privateMetadata key (preserves sibling keys). */
export async function persistClerkPrivateMetadataKey(
  userId: string,
  key: string,
  value: unknown,
): Promise<boolean> {
  if (!process.env.CLERK_SECRET_KEY?.trim()) return false;

  return withPersistenceTimeout(async () => {
    try {
      const client = await clerkClient();
      const user = await client.users.getUser(userId);
      const existing =
        user.privateMetadata && typeof user.privateMetadata === "object"
          ? { ...user.privateMetadata }
          : {};

      await client.users.updateUserMetadata(userId, {
        privateMetadata: {
          ...existing,
          [key]: value,
        },
      });
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[persistence] Clerk metadata write failed (${key}):`, error);
      if (/8192|8 KB|maximum allowed size|private_metadata/i.test(message)) {
        try {
          const { pruneOversizedClerkDurableDomains } = await import(
            "@/lib/persistence/durable-domain"
          );
          const pruned = await pruneOversizedClerkDurableDomains(userId);
          console.error("[persistence] Clerk 8KB prune attempted", pruned);
          const client = await clerkClient();
          const user = await client.users.getUser(userId);
          const existing =
            user.privateMetadata && typeof user.privateMetadata === "object"
              ? { ...user.privateMetadata }
              : {};
          await client.users.updateUserMetadata(userId, {
            privateMetadata: {
              ...existing,
              [key]: value,
            },
          });
          return true;
        } catch (retryError) {
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

  try {
    const client = await clerkClient();
    const user = await client.users.getUser(userId);
    const existing =
      user.privateMetadata && typeof user.privateMetadata === "object"
        ? { ...user.privateMetadata }
        : {};

    const next: Record<string, unknown> = { ...existing };
    for (const key of keys) {
      next[key] = null;
    }

    await client.users.updateUserMetadata(userId, {
      privateMetadata: next,
    });
    return true;
  } catch (error) {
    console.error(`[persistence] Clerk metadata clear failed:`, error);
    return false;
  }
}
