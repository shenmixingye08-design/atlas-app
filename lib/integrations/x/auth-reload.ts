import "server-only";

import { saveExternalServiceCredentials } from "@/lib/integrations/external-services/credential-store";
import { saveExternalServiceConnection } from "@/lib/integrations/external-services/store";

import {
  loadXAuthFromSupabase,
  type XPersistedAuth,
} from "./credential-persistence";

/**
 * Always reload this user's X credentials from durable storage and
 * overwrite only the X in-memory slot. Google / Dropbox / WordPress
 * memory is left untouched.
 *
 * Returns null when durable has no row or load failed — callers keep
 * existing in-memory X state in that case (tests without Supabase).
 */
export async function reloadXAuthFromDurable(
  userId: string,
): Promise<XPersistedAuth | null> {
  const loaded = await loadXAuthFromSupabase(userId);
  if (!loaded) return null;
  if (loaded.credentials.userId !== userId) return null;

  saveExternalServiceCredentials(loaded.credentials);
  saveExternalServiceConnection(userId, loaded.connection);
  return loaded;
}
