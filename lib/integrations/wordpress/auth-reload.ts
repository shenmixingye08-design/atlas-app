import "server-only";

import { saveExternalServiceConnection } from "@/lib/integrations/external-services/store";

import { loadWordPressAuthFromSupabase } from "./credential-persistence";
import { saveWordPressCredentials } from "./credential-store";
import type { WordPressPersistedAuth } from "./types";

/**
 * Always reload this user's WordPress Application Password from durable
 * storage and overwrite only the WordPress in-memory slot.
 */
export async function reloadWordPressAuthFromDurable(
  userId: string,
): Promise<WordPressPersistedAuth | null> {
  const loaded = await loadWordPressAuthFromSupabase(userId);
  if (!loaded) return null;
  if (loaded.credentials.userId !== userId) return null;

  saveWordPressCredentials(loaded.credentials);
  saveExternalServiceConnection(userId, loaded.connection);
  return loaded;
}
