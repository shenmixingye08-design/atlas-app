"use client";

import { detectPushBrowser } from "./browser-detect";

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

  const existing = await navigator.serviceWorker.getRegistration("/sw.js");
  if (existing) return existing;

  const registration = await navigator.serviceWorker.register("/sw.js", {
    scope: "/",
    updateViaCache: "none",
  });

  if (registration.waiting) {
    registration.waiting.postMessage({ type: "SKIP_WAITING" });
  }

  return registration;
}

export async function fetchVapidPublicKey(): Promise<string | null> {
  const response = await fetch("/api/push/vapid-key");
  if (!response.ok) return null;
  const data = (await response.json()) as { publicKey?: string };
  return data.publicKey ?? null;
}

export async function subscribeToPush(input?: {
  deviceName?: string;
}): Promise<{ ok: boolean; error?: string }> {
  const info = detectPushBrowser();
  if (!info.supportsPush) {
    return { ok: false, error: "unsupported" };
  }

  const publicKey = await fetchVapidPublicKey();
  if (!publicKey) {
    return { ok: false, error: "not_configured" };
  }

  const registration = await registerServiceWorker();
  if (!registration) {
    return { ok: false, error: "sw_failed" };
  }

  let subscription = await registration.pushManager.getSubscription();
  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey),
    });
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
    }),
  });

  if (!response.ok) {
    const data = (await response.json().catch(() => ({}))) as { error?: string };
    return { ok: false, error: data.error ?? "subscribe_failed" };
  }

  return { ok: true };
}

export async function unsubscribeFromPush(): Promise<boolean> {
  const registration = await navigator.serviceWorker.getRegistration("/sw.js");
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
}

export async function sendTestPush(): Promise<{ ok: boolean; message?: string }> {
  const response = await fetch("/api/push/test", { method: "POST" });
  const data = (await response.json().catch(() => ({}))) as {
    ok?: boolean;
    message?: string;
    error?: string;
  };
  if (!response.ok) {
    return { ok: false, message: data.error ?? data.message ?? "failed" };
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
