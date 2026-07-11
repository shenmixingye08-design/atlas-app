import "server-only";

import { clerkClient } from "@clerk/nextjs/server";

/** Read a single privateMetadata key for a Clerk user. */
export async function loadClerkPrivateMetadataKey<T>(
  userId: string,
  key: string,
): Promise<T | null> {
  if (!process.env.CLERK_SECRET_KEY?.trim()) return null;

  try {
    const client = await clerkClient();
    const user = await client.users.getUser(userId);
    const value = user.privateMetadata?.[key];
    return (value as T | undefined) ?? null;
  } catch {
    return null;
  }
}

/** Merge-write a single privateMetadata key (preserves sibling keys). */
export async function persistClerkPrivateMetadataKey(
  userId: string,
  key: string,
  value: unknown,
): Promise<boolean> {
  if (!process.env.CLERK_SECRET_KEY?.trim()) return false;

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
    console.error(`[persistence] Clerk metadata write failed (${key}):`, error);
    return false;
  }
}
