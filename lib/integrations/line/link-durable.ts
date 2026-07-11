import "server-only";

import {
  loadDurableDomain,
  persistDurableDomain,
} from "@/lib/persistence/durable-domain";

import type { LineUserLink } from "./link-store";
import {
  getLineLinkByAtlasUserId,
  replaceLineUserLinkForUser,
} from "./link-store";

export const LINE_LINK_DOMAIN_KEY = "atlasLineLink";

export type DurableLineLinkState = {
  link: LineUserLink | null;
};

function getHydratedUsers(): Set<string> {
  const scope = globalThis as typeof globalThis & {
    __atlasLineLinkHydratedUsers?: Set<string>;
  };
  if (!scope.__atlasLineLinkHydratedUsers) {
    scope.__atlasLineLinkHydratedUsers = new Set();
  }
  return scope.__atlasLineLinkHydratedUsers;
}

export function schedulePersistLineLink(userId: string): void {
  const link = getLineLinkByAtlasUserId(userId);
  void persistDurableDomain(
    userId,
    LINE_LINK_DOMAIN_KEY,
    { link } satisfies DurableLineLinkState,
    {
      compact: (state) => state,
    },
  );
}

export async function ensureLineLinkHydrated(userId: string): Promise<void> {
  if (getHydratedUsers().has(userId)) return;
  getHydratedUsers().add(userId);

  if (getLineLinkByAtlasUserId(userId)) return;

  const loaded = await loadDurableDomain<DurableLineLinkState>(
    userId,
    LINE_LINK_DOMAIN_KEY,
  );
  if (!loaded?.link) return;
  if (loaded.link.atlasUserId !== userId) return;
  if (!loaded.link.lineUserId) return;

  replaceLineUserLinkForUser(userId, loaded.link);
}

export function clearPersistedLineLink(userId: string): void {
  replaceLineUserLinkForUser(userId, null);
  schedulePersistLineLink(userId);
}

export function resetLineLinkHydrationForTests(): void {
  getHydratedUsers().clear();
}
