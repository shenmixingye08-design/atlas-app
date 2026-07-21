/**
 * Lightweight client-side signal that the user's notifications may have changed
 * (a new notice arrived, or one was read / deleted). Components that show the
 * unread count or the notification list subscribe and refetch without a full
 * page reload. Mirrors `lib/billing/refresh-events.ts`.
 *
 * Server-safe: no-ops outside the browser.
 */
export const NOTIFICATIONS_CHANGED_EVENT = "atlas:notifications-changed";

/** Notify listeners that notifications may have changed. */
export function notifyNotificationsChanged(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(NOTIFICATIONS_CHANGED_EVENT));
}

/**
 * Subscribe to notifications-changed signals. Returns an unsubscribe fn.
 * No-op (returns a noop unsubscribe) during SSR.
 */
export function subscribeNotificationsChanged(handler: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const listener = () => handler();
  window.addEventListener(NOTIFICATIONS_CHANGED_EVENT, listener);
  return () => window.removeEventListener(NOTIFICATIONS_CHANGED_EVENT, listener);
}
