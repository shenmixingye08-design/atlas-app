import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("activation onboarding mobile UI", () => {
  const source = readFileSync(
    "components/onboarding/activation-onboarding.tsx",
    "utf8",
  );

  it("keeps 44px targets, skip, back, and safe-area", () => {
    expect(source).toContain("min-h-[44px]");
    expect(source).toContain("後で進める");
    expect(source).toContain("戻る");
    expect(source).toContain("safe-area-inset-bottom");
    expect(source).toContain("min-[390px]");
    expect(source).toContain("min-h-[44px]");
    expect(source).toContain("motion-reduce:transition-none");
    expect(source).toContain('role="dialog"');
    expect(source).toContain("何を楽にしたいですか");
  });
});
