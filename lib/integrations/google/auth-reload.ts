import "server-only";

import {
  deleteExternalServiceCredentials,
  saveExternalServiceCredentials,
} from "@/lib/integrations/external-services/credential-store";
import { saveExternalServiceConnection } from "@/lib/integrations/external-services/store";

import {
  loadGoogleAuthFromSupabase,
  type GooglePersistedAuth,
} from "./credential-persistence";

/**
 * Always reload this user's Google credentials from durable storage and
 * overwrite only the Google in-memory slot. X / Dropbox / WordPress
 * memory is left untouched.
 *
 * Returns null when durable has no row or load failed — callers keep
 * existing in-memory Google state in that case (tests without Supabase).
 * Decode failure applies status=error and clears the stale token slot.
 */
export async function reloadGoogleAuthFromDurable(
  userId: string,
): Promise<GooglePersistedAuth | null> {
  const loaded = await loadGoogleAuthFromSupabase(userId);
  if (!loaded) return null;

  saveExternalServiceConnection(userId, loaded.connection);
  if (!loaded.credentials || loaded.decodeFailed) {
    deleteExternalServiceCredentials(userId, "google");
    return loaded;
  }
  if (loaded.credentials.userId !== userId) return null;

  saveExternalServiceCredentials(loaded.credentials);
  return loaded;
}
