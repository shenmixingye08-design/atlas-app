import { describe, expect, it } from "vitest";

import { resolvePushPermissionState } from "./browser-detect";
import { resolvePushSettingsTruth } from "./settings-truth";

describe("push permission UX states", () => {
  it("1: default / 未設定", () => {
    expect(resolvePushPermissionState("default", false, true)).toBe("default");
  });

  it("2: granted + registered", () => {
    expect(resolvePushPermissionState("granted", true, true)).toBe("granted");
  });

  it("3: denied", () => {
    expect(resolvePushPermissionState("denied", false, true)).toBe("denied");
  });

  it("4: unsupported", () => {
    expect(resolvePushPermissionState("granted", true, false)).toBe("unsupported");
    expect(resolvePushPermissionState("default", false, false)).toBe("unsupported");
  });

  it("does not treat denied as a fake ON", () => {
    const truth = resolvePushSettingsTruth({
      permission: "denied",
      registered: false,
      supportsPush: true,
      appPushEnabled: true,
    });
    expect(truth.effectiveOn).toBe(false);
    expect(truth.mismatch).toBe("app_on_os_denied");
  });

  it("does not treat unsupported as ON", () => {
    const truth = resolvePushSettingsTruth({
      permission: "granted",
      registered: true,
      supportsPush: false,
      appPushEnabled: true,
    });
    expect(truth.effectiveOn).toBe(false);
    expect(truth.mismatch).toBe("app_on_unsupported");
  });

  it("effective ON requires app + granted + registered", () => {
    expect(
      resolvePushSettingsTruth({
        permission: "granted",
        registered: true,
        supportsPush: true,
        appPushEnabled: true,
      }).effectiveOn,
    ).toBe(true);
    expect(
      resolvePushSettingsTruth({
        permission: "granted",
        registered: true,
        supportsPush: true,
        appPushEnabled: false,
      }).effectiveOn,
    ).toBe(false);
  });
});
