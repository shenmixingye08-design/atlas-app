import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("personal memory mobile UI", () => {
  const source = readFileSync(
    "components/settings/personal-memory-settings.tsx",
    "utf8",
  );

  it("keeps 44px tap targets and confirm/reject copy", () => {
    expect(source).toContain("min-h-[44px]");
    expect(source).toContain("確認して記憶する");
    expect(source).toContain("記憶しない");
    expect(source).toContain("MINERVOTが記憶していること");
    expect(source).toContain("この記憶を削除しますか？");
    expect(source).toContain("safe-area-inset-bottom");
    expect(source).toContain("w-full");
  });
});
