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
