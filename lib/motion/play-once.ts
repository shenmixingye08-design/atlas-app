/**
 * Play-once flags for signature motion.
 * Home intro is per tab session. Completion is persisted so returning
 * to a result never replays the celebration.
 */

import { MOTION_PLAY_KEYS } from "@/lib/motion/tokens";

function storageGet(storage: Storage | null, key: string): string | null {
  if (!storage) return null;
  try {
    return storage.getItem(key);
  } catch {
    return null;
  }
}

function storageSet(storage: Storage | null, key: string, value: string) {
  if (!storage) return;
  try {
    storage.setItem(key, value);
  } catch {
    /* private mode / quota */
  }
}

function storageRemove(storage: Storage | null, key: string) {
  if (!storage) return;
  try {
    storage.removeItem(key);
  } catch {
    /* private mode / quota */
  }
}

function storageKeys(storage: Storage | null): string[] {
  if (!storage) return [];
  try {
    const keys: string[] = [];
    for (let i = 0; i < storage.length; i += 1) {
      const key = storage.key(i);
      if (key) keys.push(key);
    }
    return keys;
  } catch {
    return [];
  }
}

function session(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

function local(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function hasPlayedSessionMotion(key: string): boolean {
  return storageGet(session(), key) === "1";
}

export function markSessionMotionPlayed(key: string) {
  storageSet(session(), key, "1");
}

/** True only the first time in this tab session. */
export function consumeSessionMotion(key: string): boolean {
  if (hasPlayedSessionMotion(key)) return false;
  markSessionMotionPlayed(key);
  return true;
}

export function completionMotionKey(id: string): string {
  return `${MOTION_PLAY_KEYS.completePrefix}${id}`;
}

export function hasPlayedCompletion(id: string): boolean {
  return storageGet(local(), completionMotionKey(id)) === "1";
}

export function markCompletionPlayed(id: string) {
  storageSet(local(), completionMotionKey(id), "1");
}

/** True only the first time this completion id is seen on this device. */
export function consumeCompletionMotion(id: string): boolean {
  if (!id || hasPlayedCompletion(id)) return false;
  markCompletionPlayed(id);
  return true;
}

export function resetSessionMotion(key?: string) {
  const store = session();
  if (key) {
    storageRemove(store, key);
    return;
  }
  for (const item of storageKeys(store)) {
    if (item.startsWith("atlas.motion.")) storageRemove(store, item);
  }
}

export function resetCompletionMotion(id?: string) {
  const store = local();
  if (id) {
    storageRemove(store, completionMotionKey(id));
    return;
  }
  for (const item of storageKeys(store)) {
    if (item.startsWith(MOTION_PLAY_KEYS.completePrefix)) {
      storageRemove(store, item);
    }
  }
}

/** QA helper: replay session intros and completion ceremonies. */
export function resetMotionPlayState() {
  resetSessionMotion();
  resetCompletionMotion();
}
