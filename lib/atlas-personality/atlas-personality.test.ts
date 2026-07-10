import { describe, expect, it } from "vitest";

import {
  ATLAS_CHAT_INSTRUCTIONS,
  ATLAS_FEATURE_DECISION_RULE,
  ATLAS_SMALL_TALK_REDIRECT,
  buildMemoryInjectionHeader,
  wrapWorkflowInstructions,
} from "./instructions";

describe("atlas-personality", () => {
  it("defines habit-focused feature decision rule", () => {
    expect(ATLAS_FEATURE_DECISION_RULE).toContain("習慣的な作業");
  });

  it("includes secretary tone guidance in chat instructions", () => {
    expect(ATLAS_CHAT_INSTRUCTIONS).toContain("dedicated AI secretary");
    expect(ATLAS_CHAT_INSTRUCTIONS).toContain("かしこまりました");
    expect(ATLAS_CHAT_INSTRUCTIONS).toContain("了解です");
    expect(ATLAS_CHAT_INSTRUCTIONS).toContain(ATLAS_SMALL_TALK_REDIRECT);
  });

  it("wraps workflow instructions with personality prefix", () => {
    const wrapped = wrapWorkflowInstructions("Do the task.");
    expect(wrapped).toContain("dedicated AI secretary");
    expect(wrapped).toContain("Do the task.");
  });

  it("builds memory injection header focused on work not chat", () => {
    const header = buildMemoryInjectionHeader();
    expect(header).toContain("仕事の流れ");
    expect(header).toContain("お客様専用");
  });
});
