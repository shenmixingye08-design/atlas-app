import "server-only";

import { saveExternalServiceCredentials } from "@/lib/integrations/external-services/credential-store";
import { saveExternalServiceConnection } from "@/lib/integrations/external-services/store";

import {
  loadDropboxAuthFromSupabase,
  type DropboxPersistedAuth,
} from "./credential-persistence";

/**
 * Always reload this user's Dropbox credentials from durable storage and
 * overwrite only the Dropbox in-memory slot.
 */
export async function reloadDropboxAuthFromDurable(
  userId: string,
): Promise<DropboxPersistedAuth | null> {
  const loaded = await loadDropboxAuthFromSupabase(userId);
  if (!loaded) return null;
  if (loaded.credentials.userId !== userId) return null;

  saveExternalServiceCredentials(loaded.credentials);
  saveExternalServiceConnection(userId, loaded.connection);
  return loaded;
}
