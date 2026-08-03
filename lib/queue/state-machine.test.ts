import { describe, expect, it } from "vitest";

import {
  canTransitionJobStage,
  IllegalJobTransitionError,
  transitionJobStage,
} from "@/lib/queue/state-machine";

describe("job state machine", () => {
  it("allows the happy-path pipeline", () => {
    const path = [
      "queued",
      "validating",
      "preprocessing",
      "analyzing",
      "generating",
      "converting",
      "uploading",
      "saving",
      "notifying",
      "completed",
    ] as const;
    for (let i = 0; i < path.length - 1; i += 1) {
      expect(canTransitionJobStage(path[i]!, path[i + 1]!)).toBe(true);
      expect(transitionJobStage(path[i]!, path[i + 1]!)).toBe(path[i + 1]);
    }
  });

  it("forbids illegal transitions", () => {
    expect(canTransitionJobStage("completed", "queued")).toBe(false);
    expect(canTransitionJobStage("queued", "completed")).toBe(false);
    expect(() => transitionJobStage("notifying", "analyzing")).toThrow(
      IllegalJobTransitionError,
    );
  });

  it("allows retry and cancel exception paths", () => {
    expect(canTransitionJobStage("generating", "retrying")).toBe(true);
    expect(canTransitionJobStage("retrying", "validating")).toBe(true);
    expect(canTransitionJobStage("queued", "cancelled")).toBe(true);
    expect(canTransitionJobStage("analyzing", "needs_input")).toBe(true);
  });
});
