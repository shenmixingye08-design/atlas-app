export type PushBrowserInfo = {
  platform: string;
  browser: string;
  isIos: boolean;
  isAndroid: boolean;
  isStandalone: boolean;
  supportsPush: boolean;
};

export function detectPushBrowser(): PushBrowserInfo {
  // SSR / Node: never touch window/navigator browser APIs.
  if (typeof window === "undefined" || typeof navigator === "undefined") {
    return {
      platform: "unknown",
      browser: "unknown",
      isIos: false,
      isAndroid: false,
      isStandalone: false,
      supportsPush: false,
    };
  }

  const ua = navigator.userAgent;
  const isIos =
    /iPad|iPhone|iPod/.test(ua) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const isAndroid = /Android/.test(ua);
  const isStandalone =
    window.matchMedia("(display-mode: standalone)").matches ||
    ("standalone" in navigator &&
      (navigator as { standalone?: boolean }).standalone === true);

  let browser = "unknown";
  if (/Edg\//.test(ua)) browser = "edge";
  else if (/Chrome\//.test(ua) || /CriOS\//.test(ua)) browser = "chrome";
  else if (/Safari\//.test(ua)) browser = "safari";
  else if (/Firefox\//.test(ua)) browser = "firefox";

  const supportsPush =
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window &&
    !(isIos && !isStandalone);

  return {
    platform: isIos ? "ios" : isAndroid ? "android" : "desktop",
    browser,
    isIos,
    isAndroid,
    isStandalone,
    supportsPush,
  };
}

export type PushPermissionUiState =
  | "unsupported"
  | "denied"
  | "granted"
  | "default"
  | "unregistered";

/**
 * Map Notification.permission + registration to UI state.
 * - unsupported: browser cannot do Web Push
 * - denied: user blocked notifications
 * - granted: permission granted (may or may not have DB subscription)
 * - default: not yet asked
 * - unregistered: granted locally but no active device row yet
 */
export function resolvePushPermissionState(
  permission: NotificationPermission | undefined,
  registered: boolean,
  supportsPush: boolean,
): PushPermissionUiState {
  if (!supportsPush) return "unsupported";
  if (permission === "denied") return "denied";
  if (permission === "granted") {
    return registered ? "granted" : "unregistered";
  }
  return "default";
}
