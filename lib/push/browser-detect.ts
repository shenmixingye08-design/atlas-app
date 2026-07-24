export type PushBrowserInfo = {
  platform: string;
  browser: string;
  isIos: boolean;
  isAndroid: boolean;
  isStandalone: boolean;
  supportsPush: boolean;
};

export function detectPushBrowser(): PushBrowserInfo {
  if (typeof navigator === "undefined") {
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
  const isIos = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const isAndroid = /Android/.test(ua);
  const isStandalone =
    window.matchMedia("(display-mode: standalone)").matches ||
    ("standalone" in navigator && (navigator as { standalone?: boolean }).standalone === true);

  let browser = "unknown";
  if (/Edg\//.test(ua)) browser = "edge";
  else if (/Chrome\//.test(ua)) browser = "chrome";
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

export type PushPermissionState = NotificationPermission | "unsupported" | "unregistered";

export function resolvePushPermissionState(
  permission: NotificationPermission | undefined,
  registered: boolean,
  supportsPush: boolean,
): PushPermissionState {
  if (!supportsPush) return "unsupported";
  if (!registered && permission === "default") return "unregistered";
  return permission ?? "default";
}
