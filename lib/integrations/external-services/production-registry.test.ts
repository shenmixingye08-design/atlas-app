import { describe, expect, it } from "vitest";

import { isLiveAdapterWired } from "@/lib/automation-platform/execution/production-step-registry";
import {
  assertProductionRegistryConsistency,
  EXTERNAL_AVAILABILITY_LABEL,
  getExternalAvailability,
  listAvailableProductionAdapters,
  PRODUCTION_WIRED_ADAPTER_IDS,
} from "@/lib/integrations/external-services/production-registry";

describe("External Production Registry cutover", () => {
  it("wires exactly the five Production Live adapters", () => {
    expect([...PRODUCTION_WIRED_ADAPTER_IDS].sort()).toEqual(
      [
        "dropbox",
        "google_calendar",
        "google_drive",
        "google_gmail",
        "wordpress",
      ].sort(),
    );
    for (const id of PRODUCTION_WIRED_ADAPTER_IDS) {
      expect(isLiveAdapterWired(id)).toBe(true);
    }
  });

  it("keeps unfinished services unwired and preparing/unsupported", () => {
    expect(getExternalAvailability("x")).toBe("preparing");
    expect(getExternalAvailability("slack")).toBe("preparing");
    expect(getExternalAvailability("discord")).toBe("preparing");
    expect(getExternalAvailability("notion")).toBe("preparing");
    expect(getExternalAvailability("line")).toBe("unsupported");
    expect(getExternalAvailability("teams")).toBe("unsupported");
    expect(getExternalAvailability("outlook")).toBe("unsupported");
    expect(EXTERNAL_AVAILABILITY_LABEL.preparing).toBe("準備中");
    expect(EXTERNAL_AVAILABILITY_LABEL.available).toBe("利用可能");
    for (const id of ["x", "slack", "discord", "notion", "line", "teams"]) {
      expect(isLiveAdapterWired(id)).toBe(false);
    }
  });

  it("lists five available production adapters", () => {
    const available = listAvailableProductionAdapters();
    expect(available).toHaveLength(5);
    expect(available.every((item) => item.mode === "production")).toBe(true);
  });

  it("passes registry consistency check", () => {
    expect(assertProductionRegistryConsistency()).toEqual([]);
  });
});
