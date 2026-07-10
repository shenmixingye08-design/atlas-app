import { describe, expect, it } from "vitest";

import {
  EXECUTION_LEVEL_OPTIONS,
  getExecutionLevelShortLabel,
  normalizeExecutionLevel,
} from "./execution-level";
import { buildCreateInputFromForm, defaultAutomationFormState } from "./form-utils";

describe("request scope", () => {
  it("exposes four request scope options", () => {
    expect(EXECUTION_LEVEL_OPTIONS).toHaveLength(4);
  });

  it("defaults to approve_then_run", () => {
    expect(normalizeExecutionLevel(undefined)).toBe("approve_then_run");
  });

  it("round-trips through create input", () => {
    const input = buildCreateInputFromForm(
      defaultAutomationFormState({ executionLevel: "full_auto" }),
    );
    expect(input.executionLevel).toBe("full_auto");
    expect(getExecutionLevelShortLabel(input.executionLevel)).toBe("🤖 最後まで");
  });
});
