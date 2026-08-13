import {
  resolvePushPermissionState,
  type PushPermissionUiState,
} from "./browser-detect";

export type PushSettingsMismatch =
  | "app_on_os_denied"
  | "app_on_unsupported"
  | "app_on_unasked"
  | null;

export type PushSettingsTruth = {
  permissionUi: PushPermissionUiState;
  appPushEnabled: boolean;
  /** True only when app setting, OS permission, and device registration all agree. */
  effectiveOn: boolean;
  mismatch: PushSettingsMismatch;
};

/**
 * Separate app preference from browser/OS permission.
 * Never report "通知ON" when the OS/browser has blocked push.
 */
export function resolvePushSettingsTruth(input: {
  permission: NotificationPermission | undefined;
  registered: boolean;
  supportsPush: boolean;
  appPushEnabled: boolean;
}): PushSettingsTruth {
  const permissionUi = resolvePushPermissionState(
    input.permission,
    input.registered,
    input.supportsPush,
  );
  const appPushEnabled = input.appPushEnabled === true;

  let mismatch: PushSettingsMismatch = null;
  if (appPushEnabled) {
    if (permissionUi === "denied") mismatch = "app_on_os_denied";
    else if (permissionUi === "unsupported") mismatch = "app_on_unsupported";
    else if (permissionUi === "default") mismatch = "app_on_unasked";
  }

  const effectiveOn =
    appPushEnabled && permissionUi === "granted" && input.registered;

  return {
    permissionUi,
    appPushEnabled,
    effectiveOn,
    mismatch,
  };
}
