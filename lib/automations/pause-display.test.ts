import { describe, expect, it } from "vitest";

import {
  formatNextRunDisplay,
  pauseReconnectMessage,
  shouldShowNextRun,
} from "./pause-display";
import type { Automation } from "./types";

function automation(overrides: Partial<Automation> = {}): Automation {
  return {
    id: "a1",
    name: "Test",
    enabled: true,
    nextRun: "2026-07-23T00:00:00.000Z",
    ...overrides,
  } as Automation;
}

describe("automation pause display", () => {
  it("hides next_run when paused", () => {
    expect(shouldShowNextRun(automation({ enabled: false }))).toBe(false);
    expect(
      formatNextRunDisplay(automation({ enabled: false }), (v) => v ?? "—"),
    ).toBe("—");
  });

  it("shows next_run when enabled", () => {
    expect(shouldShowNextRun(automation())).toBe(true);
    expect(
      formatNextRunDisplay(automation(), () => "2026/07/23 09:00"),
    ).toBe("2026/07/23 09:00");
  });

  it("returns reconnect hint when paused", () => {
    expect(pauseReconnectMessage(false)).toContain("停止中");
    expect(pauseReconnectMessage(true)).toBeNull();
  });
});
