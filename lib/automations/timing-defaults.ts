import type { AutomationTiming } from "./types";

export const DEFAULT_AUTOMATION_TIMING: AutomationTiming = {
  startDate: null,
  endCondition: { type: "never" },
};
