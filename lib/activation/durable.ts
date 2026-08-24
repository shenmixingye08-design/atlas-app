import "server-only";

import {
  loadDurableDomain,
  persistDurableDomain,
} from "@/lib/persistence/durable-domain";

import {
  isActivationHydrated,
  listActivationEvents,
  markActivationHydrated,
  readActivationProgress,
  replaceActivationEvents,
  writeActivationProgress,
} from "./store";
import type { ActivationEventPayload, ActivationProgress } from "./types";

export const ACTIVATION_DOMAIN_KEY = "atlasActivation";

export type DurableActivationState = {
  progress: ActivationProgress | null;
  events: ActivationEventPayload[];
};

export async function persistActivationNow(userId: string): Promise<void> {
  const payload: DurableActivationState = {
    progress: readActivationProgress(userId),
    events: listActivationEvents(userId).slice(-80),
  };
  await persistDurableDomain(userId, ACTIVATION_DOMAIN_KEY, payload, {
    compact: (state) => ({
      progress: state.progress,
      events: (state.events ?? []).slice(-40),
    }),
    forceSupabase: true,
  });
}

export async function ensureActivationHydrated(userId: string): Promise<void> {
  if (isActivationHydrated(userId)) return;
  const loaded = await loadDurableDomain<DurableActivationState>(
    userId,
    ACTIVATION_DOMAIN_KEY,
  );
  if (loaded?.progress && loaded.progress.userId === userId) {
    writeActivationProgress(userId, loaded.progress);
  }
  if (loaded?.events?.length) {
    replaceActivationEvents(
      userId,
      loaded.events.filter((event) => event.userId === userId),
    );
  }
  markActivationHydrated(userId);
}
