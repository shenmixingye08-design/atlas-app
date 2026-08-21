import { describe, expect, it } from "vitest";

import {
  AUTOMATION_LIST_EMPTY_MESSAGE,
  automationListEmptyMessage,
  shouldRenderAutomationCounts,
} from "./list-load-state";

describe("automation list load state", () => {
  it("never treats an error load as countable 0", () => {
    expect(shouldRenderAutomationCounts("error")).toBe(false);
    expect(automationListEmptyMessage("error", 0)).toBeNull();
  });

  it("never treats loading as countable 0", () => {
    expect(shouldRenderAutomationCounts("loading")).toBe(false);
    expect(automationListEmptyMessage("loading", 0)).toBeNull();
  });

  it("shows empty copy only after a successful []", () => {
    expect(shouldRenderAutomationCounts("ready")).toBe(true);
    expect(automationListEmptyMessage("ready", 0)).toBe(
      AUTOMATION_LIST_EMPTY_MESSAGE,
    );
    expect(automationListEmptyMessage("ready", 2)).toBeNull();
  });
});
