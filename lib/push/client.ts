"use client";

import { detectPushBrowser } from "./browser-detect";
import type { PushErrorCode } from "./errors";
import { isPushErrorCode } from "./errors";

function urlBase64ToUint8Array(base64String: string): BufferSource {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const buffer = new ArrayBuffer(raw.length);
  const output = new Uint8Array(buffer);
  for (let i = 0; i < raw.length; i += 1) {
    output[i] = raw.charCodeAt(i);
  }
  return output;
}

export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!("serviceWorker" in navigator)) return null;

  try {
    const existing = await navigator.serviceWorker.getRegistration("/");
    if (existing?.active || existing?.waiting || existing?.installing) {
      if (existing.waiting) {
        existing.waiting.postMessage({ type: "SKIP_WAITING" });
      }
      return existing;
    }

    const registration = await navigator.serviceWorker.register("/sw.js", {
      scope: "/",
      updateViaCache: "none",
    });

    if (registration.waiting) {
      registration.waiting.postMessage({ type: "SKIP_WAITING" });
    }

    await navigator.serviceWorker.ready;
    return registration;
  } catch {
    return null;
  }
}

export type VapidKeyResponse = {
  publicKey: string | null;
  configured: boolean;
  errorCode?: PushErrorCode | null;
};

export async function fetchVapidPublicKey(): Promise<{
  publicKey: string | null;
  errorCode: PushErrorCode | null;
}> {
  // Prefer build-time public key when present (never private key).
  const embedded = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim();
  if (embedded) {
    return { publicKey: embedded, errorCode: null };
  }

  try {
    const response = await fetch("/api/push/vapid-key");
    if (!response.ok) {
      return { publicKey: null, errorCode: "vapid_public_key_missing" };
    }
    const data = (await response.json()) as VapidKeyResponse;
    if (data.publicKey) {
      return { publicKey: data.publicKey, errorCode: null };
    }
    const code =
      data.errorCode && isPushErrorCode(data.errorCode)
        ? data.errorCode
        : "vapid_public_key_missing";
    return { publicKey: null, errorCode: code };
  } catch {
    return { publicKey: null, errorCode: "vapid_public_key_missing" };
  }
}

export async function subscribeToPush(input?: {
  deviceName?: string;
}): Promise<{ ok: boolean; error?: PushErrorCode }> {
  const info = detectPushBrowser();
  if (!info.supportsPush) {
    return { ok: false, error: "push_not_supported" };
  }

  if (typeof Notification === "undefined") {
    return { ok: false, error: "push_not_supported" };
  }

  if (Notification.permission === "denied") {
    return { ok: false, error: "permission_denied" };
  }

  const { publicKey, errorCode } = await fetchVapidPublicKey();
  if (!publicKey) {
    return { ok: false, error: errorCode ?? "vapid_public_key_missing" };
  }

  const registration = await registerServiceWorker();
  if (!registration?.pushManager) {
    return { ok: false, error: "service_worker_failed" };
  }

  let subscription: PushSubscription | null = null;
  try {
    subscription = await registration.pushManager.getSubscription();
    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });
    }
  } catch {
    // Existing subscription may have been created with a different VAPID key.
    try {
      const stale = await registration.pushManager.getSubscription();
      if (stale) await stale.unsubscribe();
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });
    } catch {
      return { ok: false, error: "push_subscription_failed" };
    }
  }

  if (!subscription) {
    return { ok: false, error: "push_subscription_failed" };
  }

  const json = subscription.toJSON();
  if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
    return { ok: false, error: "invalid_subscription" };
  }

  const response = await fetch("/api/push/subscribe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      endpoint: json.endpoint,
      p256dh: json.keys.p256dh,
      authKey: json.keys.auth,
      platform: info.platform,
      browser: info.browser,
      deviceName: input?.deviceName ?? null,
      userAgent:
        typeof navigator !== "undefined" ? navigator.userAgent.slice(0, 300) : null,
    }),
  });

  if (!response.ok) {
    const data = (await response.json().catch(() => ({}))) as {
      code?: string;
      error?: string;
    };
    if (response.status === 401) {
      return { ok: false, error: "authentication_required" };
    }
    if (data.code && isPushErrorCode(data.code)) {
      return { ok: false, error: data.code };
    }
    if (data.error === "Persistence unavailable") {
      return { ok: false, error: "persistence_unavailable" };
    }
    return { ok: false, error: "subscription_save_failed" };
  }

  return { ok: true };
}

export async function unsubscribeFromPush(): Promise<boolean> {
  try {
    const registration = await navigator.serviceWorker.getRegistration("/");
    const subscription = await registration?.pushManager.getSubscription();
    if (!subscription) return true;

    const endpoint = subscription.endpoint;
    await subscription.unsubscribe();

    await fetch("/api/push/unsubscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ endpoint }),
    });

    return true;
  } catch {
    return false;
  }
}

export async function sendTestPush(): Promise<{
  ok: boolean;
  message?: string;
  code?: PushErrorCode;
}> {
  const response = await fetch("/api/push/test", { method: "POST" });
  const data = (await response.json().catch(() => ({}))) as {
    ok?: boolean;
    message?: string;
    error?: string;
    code?: string;
  };
  if (!response.ok) {
    const code =
      data.code && isPushErrorCode(data.code)
        ? data.code
        : response.status === 401
          ? "authentication_required"
          : response.status === 429
            ? "rate_limit_exceeded"
            : "delivery_failed";
    return {
      ok: false,
      message: data.error ?? data.message ?? "failed",
      code,
    };
  }
  return { ok: true, message: data.message };
}

export async function fetchPushDevices(): Promise<
  Array<{
    id: string;
    platform: string | null;
    browser: string | null;
    deviceName: string | null;
    isActive: boolean;
    updatedAt: string;
  }>
> {
  const response = await fetch("/api/push/devices");
  if (!response.ok) return [];
  const data = (await response.json()) as {
    devices?: Array<{
      id: string;
      platform: string | null;
      browser: string | null;
      deviceName: string | null;
      isActive: boolean;
      updatedAt: string;
    }>;
  };
  return data.devices ?? [];
}

export async function setDeviceActive(
  subscriptionId: string,
  isActive: boolean,
): Promise<boolean> {
  const response = await fetch("/api/push/devices", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ subscriptionId, isActive }),
  });
  return response.ok;
}
